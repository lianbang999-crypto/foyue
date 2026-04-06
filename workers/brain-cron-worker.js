/**
 * AI Brain 自动学习 Worker
 * 通过 Cron Trigger 每天定时运行，自动处理文库讲记
 * 
 * 每次 Cron 触发处理最多 MAX_DOCS_PER_RUN 篇文档
 * 每篇文档分段调用 LLM 提取知识，存入 D1
 */

// ============================================================
// 配置
// ============================================================
const SEGMENT_MAX_LEN = 6000;     // Google AI（Gemma4）上下文充足，可用大段落提升质量
const SEGMENT_OVERLAP = 200;      // 段落间重叠，防止有效信息被截断
const MAX_DOCS_PER_RUN = 8;       // 每次 Cron 最多处理几篇
const MAX_SEGMENTS_PER_RUN = 60;  // 每次 Cron 最多处理几个段落（兜底防超时）
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ============================================================
// 文本处理
// ============================================================

function splitDoc(content) {
    if (!content) return [];
    const text = String(content).replace(/\r\n/g, '\n').trim();
    if (text.length <= SEGMENT_MAX_LEN) return [text];
    const segs = [];
    let start = 0;
    while (start < text.length) {
        let end = start + SEGMENT_MAX_LEN;
        if (end >= text.length) { segs.push(text.slice(start).trim()); break; }
        let bp = text.lastIndexOf('\n\n', end);
        if (bp <= start) bp = text.lastIndexOf('。', end);
        if (bp <= start) bp = text.lastIndexOf('！', end);
        if (bp <= start) bp = text.lastIndexOf('？', end);
        if (bp <= start) bp = end; else bp += 1;
        segs.push(text.slice(start, bp).trim());
        const next = bp - SEGMENT_OVERLAP;
        start = next > start ? next : bp;
    }
    return segs.filter(s => s.length > 50);
}

function buildPrompt(segment, meta, segIdx, segTotal) {
    return {
        messages: [
            {
                role: 'system', content: `/no_think
从佛法讲记中提取知识，严格输出 JSON。
规则：只摘原文，不添加内容。qa_pairs 最多5个，key_quotes 最多3个，concepts 最多3个。
主题类目：信|愿|行|往生|净土庄严|阿弥陀佛|因果|菩提心|教理|实修问答
输出格式：
{"qa_pairs":[{"question":"问题","answer_quote":"法师原文100-300字","topic":"类目","importance":"high或medium"}],"key_quotes":[{"quote":"原文50-150字","topic":"类目","context":"一句话说明"}],"concepts":[{"name":"术语","definition":"法师解释原文","topic":"类目"}]}
无实质内容则返回 {"qa_pairs":[],"key_quotes":[],"concepts":[]}`
            },
            {
                role: 'user',
                content: `《${meta.series_name || ''}·${meta.title || ''}》第${segIdx + 1}/${segTotal}段：\n\n${segment}`
            },
        ],
        max_tokens: 2048,
        temperature: 0.3,
    };
}

function parseLLMJson(text) {
    if (!text) return null;
    let s = String(text);
    // 如果 AI 直接返回了对象
    if (typeof text === 'object' && text !== null) s = JSON.stringify(text);
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    s = s.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}

function normalize(s) {
    return String(s).replace(/\s+/g, '').replace(/[""''「」『』【】《》〈〉…·、，。！？；：（）\-]/g, '');
}

function validateQuote(q, src) {
    if (!q || !src) return false;
    const nSrc = normalize(src);
    const nQ = normalize(q);
    for (const len of [40, 25, 15]) {
        if (nQ.length >= len && nSrc.includes(nQ.slice(0, len))) return true;
    }
    return false;
}

function findPos(q, src) {
    if (!q || !src) return -1;
    return normalize(src).indexOf(normalize(q).slice(0, 30));
}

// ============================================================
// AI 调度（Workers AI 或 Google AI Studio / Gemma）
// ============================================================

/**
 * 调用 Google AI Studio 接口（Gemma4 等免费模型）
 * 需在 Worker 中设置 GOOGLE_AI_KEY secret
 */
async function callGoogleAI(apiKey, model, promptObj) {
    const sysMsg = promptObj.messages.find(m => m.role === 'system');
    const userMsg = promptObj.messages.find(m => m.role === 'user');
    const body = {
        contents: [{ role: 'user', parts: [{ text: userMsg?.content || '' }] }],
        generationConfig: {
            maxOutputTokens: promptObj.max_tokens || 1024,
            temperature: promptObj.temperature || 0.3,
        },
    };
    if (sysMsg) body.system_instruction = { parts: [{ text: sysMsg.content }] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
    });
    const d = await r.json();
    if (d.error) throw new Error(`Google AI: ${d.error.message}`);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 统一 AI 调用入口：
 *   有 GOOGLE_AI_KEY → 走 Google AI Studio（Gemma4 等免费模型）
 *   无               → 走 Cloudflare Workers AI（默认）
 */
async function runAI(env, promptObj) {
    if (env.GOOGLE_AI_KEY) {
        const model = env.GOOGLE_AI_MODEL || 'gemma-3-27b-it';
        return await callGoogleAI(env.GOOGLE_AI_KEY, model, promptObj);
    }
    return await env.AI.run(AI_MODEL, promptObj);
}

// ============================================================
// 主题缓存
// ============================================================

async function getTopics(db) {
    const { results } = await db.prepare('SELECT id, name FROM ai_topics').all();
    const map = {};
    for (const r of results) map[r.name] = r.id;
    return map;
}

// ============================================================
// 单文档处理
// ============================================================

async function processDocument(doc, db, env, topics, log) {
    const segments = splitDoc(doc.content);
    const total = segments.length;

    // 读取当前进度（支持续传）
    const state = await db.prepare(
        `SELECT segments_done, qa_extracted, quotes_extracted, concepts_extracted
     FROM ai_learning_state WHERE doc_id = ?`
    ).bind(doc.id).first();

    let segStart = state?.segments_done || 0;
    let qaCount = state?.qa_extracted || 0;
    let quotesCount = state?.quotes_extracted || 0;
    let conceptsCount = state?.concepts_extracted || 0;

    // 初始化/更新状态
    if (!state) {
        await db.prepare(
            `INSERT INTO ai_learning_state (doc_id, status, segments_total, segments_done, started_at, updated_at)
       VALUES (?, 'processing', ?, 0, datetime('now'), datetime('now'))`
        ).bind(doc.id, total).run();
    } else {
        await db.prepare(
            `UPDATE ai_learning_state SET status='processing', segments_total=?, updated_at=datetime('now') WHERE doc_id=?`
        ).bind(total, doc.id).run();
    }

    let segmentsProcessed = 0;

    for (let i = segStart; i < total; i++) {
        // 全局段落预算检查（由调用方通过返回值累计）
        const seg = segments[i];
        log(`  段${i + 1}/${total} (${seg.length}字)`);

        try {
            const prompt = buildPrompt(seg, doc, i, total);
            const result = await runAI(env, prompt);

            // AI 可能返回 string 或 object
            const rawText = typeof result === 'object' && result?.response !== undefined
                ? result.response
                : result;

            const extracted = parseLLMJson(rawText);
            let nQ = 0, nK = 0, nC = 0;

            if (extracted) {
                for (const qa of (extracted.qa_pairs || [])) {
                    if (!qa.question || !qa.answer_quote) continue;
                    if (!validateQuote(qa.answer_quote, doc.content)) continue;
                    const tid = topics[qa.topic] || topics['教理'] || 9;
                    await db.prepare(
                        `INSERT INTO ai_qa_pairs (doc_id,topic_id,question,answer_quote,answer_position,importance,confidence) VALUES (?,?,?,?,?,?,?)`
                    ).bind(doc.id, tid, qa.question.trim(), qa.answer_quote.trim(), findPos(qa.answer_quote, doc.content), qa.importance || 'medium', 0.9).run();
                    nQ++;
                }
                for (const kq of (extracted.key_quotes || [])) {
                    if (!kq.quote || !validateQuote(kq.quote, doc.content)) continue;
                    const tid = topics[kq.topic] || topics['教理'] || 9;
                    await db.prepare(
                        `INSERT INTO ai_key_quotes (doc_id,topic_id,quote,context,position) VALUES (?,?,?,?,?)`
                    ).bind(doc.id, tid, kq.quote.trim(), kq.context || '', findPos(kq.quote, doc.content)).run();
                    nK++;
                }
                for (const c of (extracted.concepts || [])) {
                    if (!c.name || !c.definition) continue;
                    const tid = topics[c.topic] || topics['教理'] || 9;
                    await db.prepare(
                        `INSERT INTO ai_concepts (name,definition,doc_id,topic_id) VALUES (?,?,?,?)`
                    ).bind(c.name.trim(), c.definition.trim(), doc.id, tid).run();
                    nC++;
                }
            }

            qaCount += nQ; quotesCount += nK; conceptsCount += nC;
            segmentsProcessed++;
            log(`    +${nQ}Q +${nK}引 +${nC}概`);

            // 更新进度
            await db.prepare(
                `UPDATE ai_learning_state SET segments_done=?, qa_extracted=?, quotes_extracted=?, concepts_extracted=?, updated_at=datetime('now') WHERE doc_id=?`
            ).bind(i + 1, qaCount, quotesCount, conceptsCount, doc.id).run();

        } catch (err) {
            log(`    ❌ ${err.message?.slice(0, 120)}`);
            await db.prepare(
                `UPDATE ai_learning_state SET status='failed', error=?, updated_at=datetime('now') WHERE doc_id=?`
            ).bind(String(err.message || err).slice(0, 500), doc.id).run();
            return { ok: false, segmentsProcessed, qaCount, quotesCount, conceptsCount };
        }
    }

    // 标记完成
    await db.prepare(
        `UPDATE ai_learning_state SET status='learned', completed_at=datetime('now'), updated_at=datetime('now') WHERE doc_id=?`
    ).bind(doc.id).run();

    return { ok: true, segmentsProcessed, qaCount, quotesCount, conceptsCount };
}

// ============================================================
// Cron 入口
// ============================================================

export default {
    async scheduled(event, env, ctx) {
        const db = env.DB;
        const logs = [];
        const log = (msg) => { logs.push(`[${new Date().toISOString()}] ${msg}`); };

        log('🧠 Brain Cron 开始');

        try {
            // 初始化：把新文档加入 pending
            await db.prepare(
                `INSERT OR IGNORE INTO ai_learning_state (doc_id, status)
         SELECT d.id, 'pending' FROM documents d
         WHERE d.content IS NOT NULL AND d.content != ''
           AND d.id NOT IN (SELECT doc_id FROM ai_learning_state)`
            ).run();

            // 先重试上一次失败的（可能是临时错误）
            await db.prepare(
                `UPDATE ai_learning_state
         SET status='pending', error=NULL, segments_done=0,
             qa_extracted=0, quotes_extracted=0, concepts_extracted=0,
             started_at=NULL, completed_at=NULL, updated_at=datetime('now')
         WHERE status='failed'
           AND updated_at < datetime('now', '-1 hour')`
            ).run();

            // 加载主题
            const topics = await getTopics(db);
            let docsProcessed = 0;
            let totalSegments = 0;

            for (let d = 0; d < MAX_DOCS_PER_RUN; d++) {
                if (totalSegments >= MAX_SEGMENTS_PER_RUN) {
                    log(`⏸ 段落预算用完 (${totalSegments}/${MAX_SEGMENTS_PER_RUN})`);
                    break;
                }

                // 优先 processing（续传），再 pending（按长度升序）
                const doc = await db.prepare(
                    `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
           FROM documents d
           INNER JOIN ai_learning_state ls ON ls.doc_id = d.id
           WHERE ls.status IN ('processing', 'pending')
             AND d.content IS NOT NULL AND d.content != ''
           ORDER BY CASE ls.status WHEN 'processing' THEN 0 ELSE 1 END,
                    LENGTH(d.content) ASC
           LIMIT 1`
                ).first();

                if (!doc) { log('✅ 无更多待处理文档'); break; }

                log(`📖 [${d + 1}] ${doc.title} (${doc.content?.length || 0}字)`);
                const result = await processDocument(doc, db, env, topics, log);
                docsProcessed++;
                totalSegments += result.segmentsProcessed;

                if (!result.ok) {
                    log(`⚠️ 文档处理失败，继续下一篇`);
                    continue;
                }
                log(`✅ ${doc.title} → ${result.qaCount}Q ${result.quotesCount}引 ${result.conceptsCount}概`);
            }

            // 统计
            const stats = await db.prepare(
                `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
            ).all();
            const statsStr = (stats.results || []).map(r => `${r.status}:${r.cnt}`).join(' ');
            log(`📊 本次: ${docsProcessed}篇 ${totalSegments}段 | 全局: ${statsStr}`);

        } catch (err) {
            log(`💥 致命错误: ${err.message}`);
        }

        log('🧠 Brain Cron 结束');

        // 把日志写入 D1（方便排查）
        try {
            await db.prepare(
                `INSERT INTO ai_query_log (query, response_path, created_at)
         VALUES ('__cron_log__', ?, datetime('now'))`
            ).bind(logs.join('\n')).run();
        } catch { /* ignore log write failure */ }
    },

    // HTTP 入口（手动触发 + 状态查询）
    async fetch(request, env) {
        const url = new URL(request.url);

        // 简单鉴权
        const token = request.headers.get('X-Admin-Token') || url.searchParams.get('token');
        if (token !== env.ADMIN_TOKEN) {
            return new Response('Unauthorized', { status: 401 });
        }

        const db = env.DB;

        // GET /status
        if (url.pathname === '/status' || url.pathname === '/') {
            const counts = await db.prepare(
                `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
            ).all();
            const totals = await db.prepare(
                `SELECT SUM(qa_extracted) as qa, SUM(quotes_extracted) as quotes, SUM(concepts_extracted) as concepts
         FROM ai_learning_state WHERE status='learned'`
            ).first();
            const recentLogs = await db.prepare(
                `SELECT query, response_path, created_at FROM ai_query_log
         WHERE query='__cron_log__' ORDER BY created_at DESC LIMIT 3`
            ).all();

            return Response.json({
                status_counts: counts.results,
                totals: { qa: totals?.qa || 0, quotes: totals?.quotes || 0, concepts: totals?.concepts || 0 },
                recent_cron_logs: (recentLogs.results || []).map(r => ({
                    time: r.created_at,
                    log: r.response_path,
                })),
            });
        }

        // POST /trigger — 手动触发一次学习（和 Cron 一样的逻辑）
        if (url.pathname === '/trigger' && request.method === 'POST') {
            // 用 waitUntil 异步执行，立即返回
            const ctrl = new AbortController();
            const fakeEvent = { scheduledTime: Date.now() };
            env.__ctx?.waitUntil?.(this.scheduled(fakeEvent, env, { waitUntil: () => { } }));

            // 也同步执行一次（如果 waitUntil 不可用）
            try {
                await this.scheduled(fakeEvent, env, { waitUntil: () => { } });
                return Response.json({ success: true, message: '学习任务已执行' });
            } catch (err) {
                return Response.json({ error: err.message }, { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    },
};
