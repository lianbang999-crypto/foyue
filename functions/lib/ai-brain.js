/**
 * AI Brain — 知识提取模块
 * 后台学习文库讲记，提取结构化知识存入 D1
 */

import { isEnvFlagEnabled, resolveAIModel } from './ai-utils.js';

// 知识提取的分段参数
const SEGMENT_MAX_LEN = 2000;  // 每段最大字数（小段 = LLM 更快完成）
const SEGMENT_OVERLAP = 150;   // 段间重叠字数

// 主题ID缓存（避免重复查询）
let _topicCache = null;

/**
 * 将文档分成适合 LLM 处理的段落
 */
function splitDocForLearning(content) {
    if (!content) return [];
    const text = content.replace(/\r\n/g, '\n').trim();
    if (text.length <= SEGMENT_MAX_LEN) return [text];

    const segments = [];
    let start = 0;
    while (start < text.length) {
        let end = start + SEGMENT_MAX_LEN;
        if (end >= text.length) {
            segments.push(text.slice(start).trim());
            break;
        }
        // 在段落边界处截断（优先找双换行，次选句号）
        let breakPoint = text.lastIndexOf('\n\n', end);
        if (breakPoint <= start) breakPoint = text.lastIndexOf('。', end);
        if (breakPoint <= start) breakPoint = text.lastIndexOf('！', end);
        if (breakPoint <= start) breakPoint = text.lastIndexOf('？', end);
        if (breakPoint <= start) breakPoint = end; // 硬截断
        else breakPoint += 1; // 包含标点

        segments.push(text.slice(start, breakPoint).trim());
        const nextStart = breakPoint - SEGMENT_OVERLAP;
        start = nextStart > start ? nextStart : breakPoint;
    }
    return segments.filter(s => s.length > 50); // 过滤过短段落
}

/**
 * 构建知识提取 Prompt
 */
function buildExtractionPrompt(segment, docMeta, segIndex, segTotal) {
    const system = `/no_think
从佛法讲记中提取知识，严格输出 JSON。

规则：只摘原文，不添加内容。qa_pairs 最多3个，key_quotes 最多2个，concepts 最多2个。
主题类目：信|愿|行|往生|净土庄严|阿弥陀佛|因果|菩提心|教理|实修问答

输出格式：
{"qa_pairs":[{"question":"问题","answer_quote":"法师原文100-300字","topic":"类目","importance":"high或medium"}],"key_quotes":[{"quote":"原文50-150字","topic":"类目","context":"一句话说明"}],"concepts":[{"name":"术语","definition":"法师解释原文","topic":"类目"}]}

无实质内容则返回 {"qa_pairs":[],"key_quotes":[],"concepts":[]}`;

    const user = `《${docMeta.series_name || ''}·${docMeta.title || ''}》第${segIndex + 1}/${segTotal}段：\n\n${segment}`;

    return { system, user };
}

/**
 * 从 LLM 输出中解析 JSON
 */
function parseLLMJson(text) {
    if (!text) return null;
    // 去除可能的 markdown 代码块标记
    let cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // 去除 think 标签
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // 尝试提取 JSON 对象
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

/**
 * 验证提取的引文确实出现在源文档中
 */
function validateQuoteInSource(quote, sourceContent) {
    if (!quote || !sourceContent) return false;
    // 标准化空白后比较（LLM 可能调整空白）
    const normalizedQuote = quote.replace(/\s+/g, '').slice(0, 80);
    const normalizedSource = sourceContent.replace(/\s+/g, '');
    return normalizedSource.includes(normalizedQuote);
}

/**
 * 查找引文在源文档中的位置
 */
function findQuotePosition(quote, sourceContent) {
    if (!quote || !sourceContent) return -1;
    const normalizedQuote = quote.replace(/\s+/g, '').slice(0, 50);
    const normalizedSource = sourceContent.replace(/\s+/g, '');
    return normalizedSource.indexOf(normalizedQuote);
}

/**
 * 获取主题名称到ID的映射
 */
async function getTopicMap(db) {
    if (_topicCache) return _topicCache;
    const { results } = await db.prepare('SELECT id, name FROM ai_topics').all();
    _topicCache = {};
    for (const row of results) {
        _topicCache[row.name] = row.id;
    }
    return _topicCache;
}

/**
 * 处理单篇文档的「一个段落」知识提取
 * 每次 HTTP 请求只处理一个段落，避免超时
 * 返回 { done, segIndex, segTotal, qa, quotes, concepts }
 */
async function processOneSegment(doc, env) {
    const db = env.DB;
    const topicMap = await getTopicMap(db);

    const segments = splitDocForLearning(doc.content);
    const totalSegments = segments.length;

    // 读取当前进度
    const state = await db.prepare(
        `SELECT segments_done, qa_extracted, quotes_extracted, concepts_extracted
         FROM ai_learning_state WHERE doc_id = ?`
    ).bind(doc.id).first();

    const segIndex = state?.segments_done || 0;

    // 初始化或更新 learning_state
    if (!state) {
        await db.prepare(
            `INSERT INTO ai_learning_state (doc_id, status, segments_total, segments_done, started_at, updated_at)
             VALUES (?, 'processing', ?, 0, datetime('now'), datetime('now'))`
        ).bind(doc.id, totalSegments).run();
    } else {
        await db.prepare(
            `UPDATE ai_learning_state SET status = 'processing', segments_total = ?, updated_at = datetime('now') WHERE doc_id = ?`
        ).bind(totalSegments, doc.id).run();
    }

    // 所有段落已处理完 → 标记完成
    if (segIndex >= totalSegments) {
        await db.prepare(
            `UPDATE ai_learning_state SET status = 'learned', completed_at = datetime('now'), updated_at = datetime('now') WHERE doc_id = ?`
        ).bind(doc.id).run();
        return {
            done: true, segIndex, segTotal: totalSegments,
            qa: state?.qa_extracted || 0, quotes: state?.quotes_extracted || 0, concepts: state?.concepts_extracted || 0,
        };
    }

    // 处理当前段落
    const segment = segments[segIndex];
    const { system, user } = buildExtractionPrompt(
        segment,
        { series_name: doc.series_name, title: doc.title },
        segIndex,
        totalSegments
    );

    let newQA = 0, newQuotes = 0, newConcepts = 0;

    // 用 fast 模型 + 流式调用，收集完整文本后解析
    // 流式调用不会触发 Pages Functions 的 wall clock 超时
    const model = resolveAIModel(env, 'chatFallback');
    const streamResponse = await env.AI.run(model, {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        max_tokens: 1024,
        temperature: 0.3,
        stream: true,
    });

    // 从 EventSource stream 收集完整文本
    let rawText = '';
    const reader = streamResponse.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // SSE 格式: data: {"response":"token"}
        for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
                const parsed = JSON.parse(data);
                if (parsed.response) rawText += parsed.response;
            } catch { /* skip malformed chunks */ }
        }
    }

    const extracted = parseLLMJson(rawText);

    if (extracted) {
        // 存储问答对
        if (Array.isArray(extracted.qa_pairs)) {
            for (const qa of extracted.qa_pairs) {
                if (!qa.question || !qa.answer_quote) continue;
                if (!validateQuoteInSource(qa.answer_quote, doc.content)) continue;
                const topicId = topicMap[qa.topic] || topicMap['教理'] || 9;
                const position = findQuotePosition(qa.answer_quote, doc.content);
                await db.prepare(
                    `INSERT INTO ai_qa_pairs (doc_id, topic_id, question, answer_quote, answer_position, importance, confidence)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(doc.id, topicId, qa.question.trim(), qa.answer_quote.trim(), position, qa.importance || 'medium', 0.9).run();
                newQA++;
            }
        }
        // 存储关键引文
        if (Array.isArray(extracted.key_quotes)) {
            for (const kq of extracted.key_quotes) {
                if (!kq.quote || !validateQuoteInSource(kq.quote, doc.content)) continue;
                const topicId = topicMap[kq.topic] || topicMap['教理'] || 9;
                const position = findQuotePosition(kq.quote, doc.content);
                await db.prepare(
                    `INSERT INTO ai_key_quotes (doc_id, topic_id, quote, context, position)
                     VALUES (?, ?, ?, ?, ?)`
                ).bind(doc.id, topicId, kq.quote.trim(), kq.context || '', position).run();
                newQuotes++;
            }
        }
        // 存储概念
        if (Array.isArray(extracted.concepts)) {
            for (const concept of extracted.concepts) {
                if (!concept.name || !concept.definition) continue;
                const topicId = topicMap[concept.topic] || topicMap['教理'] || 9;
                await db.prepare(
                    `INSERT INTO ai_concepts (name, definition, doc_id, topic_id)
                     VALUES (?, ?, ?, ?)`
                ).bind(concept.name.trim(), concept.definition.trim(), doc.id, topicId).run();
                newConcepts++;
            }
        }
    }

    // 更新段进度（原子递增）
    const totalQA = (state?.qa_extracted || 0) + newQA;
    const totalQuotes = (state?.quotes_extracted || 0) + newQuotes;
    const totalConcepts = (state?.concepts_extracted || 0) + newConcepts;
    const nextSeg = segIndex + 1;
    const isDone = nextSeg >= totalSegments;

    await db.prepare(
        `UPDATE ai_learning_state
         SET segments_done = ?, qa_extracted = ?, quotes_extracted = ?, concepts_extracted = ?,
             status = ?, ${isDone ? "completed_at = datetime('now')," : ''} updated_at = datetime('now')
         WHERE doc_id = ?`
    ).bind(nextSeg, totalQA, totalQuotes, totalConcepts, isDone ? 'learned' : 'processing', doc.id).run();

    return {
        done: isDone, segIndex: nextSeg, segTotal: totalSegments,
        qa: totalQA, quotes: totalQuotes, concepts: totalConcepts,
        newInSegment: { qa: newQA, quotes: newQuotes, concepts: newConcepts },
    };
}

// ============================================================
// API 处理函数
// ============================================================

/**
 * POST /api/ai/brain/learn — 逐段学习
 * 每次请求只处理一个段落（避免超时）
 * 前端/脚本循环调用直到所有文档完成
 * 
 * 参数：
 *   ?doc_id=xxx  — 指定处理某篇文档
 *   ?retry=true  — 重试失败的文档
 *   不传参数     — 自动取下一篇 pending 或 processing 的文档
 */
export async function handleBrainLearn(env, request, cors, json) {
    try {
        const url = new URL(request.url);
        const retryFailed = url.searchParams.get('retry') === 'true';
        const specificDoc = url.searchParams.get('doc_id');

        const db = env.DB;

        // 初始化学习状态（为所有未在 ai_learning_state 中的文档创建 pending 记录）
        await db.prepare(
            `INSERT OR IGNORE INTO ai_learning_state (doc_id, status)
         SELECT d.id, 'pending'
         FROM documents d
         WHERE d.content IS NOT NULL AND d.content != ''
           AND d.id NOT IN (SELECT doc_id FROM ai_learning_state)`
        ).run();

        // 获取要处理的文档
        let doc;
        if (specificDoc) {
            doc = await db.prepare(
                `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
             FROM documents d WHERE d.id = ? AND d.content IS NOT NULL AND d.content != ''`
            ).bind(specificDoc).first();
        } else if (retryFailed) {
            doc = await db.prepare(
                `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
             FROM documents d
             INNER JOIN ai_learning_state ls ON ls.doc_id = d.id AND ls.status = 'failed'
             WHERE d.content IS NOT NULL AND d.content != ''
             ORDER BY d.id LIMIT 1`
            ).first();
            // 重试前先重置段进度
            if (doc) {
                await db.prepare(
                    `UPDATE ai_learning_state SET status = 'pending', segments_done = 0,
                 qa_extracted = 0, quotes_extracted = 0, concepts_extracted = 0, error = NULL WHERE doc_id = ?`
                ).bind(doc.id).run();
            }
        } else {
            // 优先处理已经在 processing 中的（续传），然后取 pending 的
            doc = await db.prepare(
                `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
             FROM documents d
             INNER JOIN ai_learning_state ls ON ls.doc_id = d.id AND ls.status IN ('processing', 'pending')
             WHERE d.content IS NOT NULL AND d.content != ''
             ORDER BY CASE ls.status WHEN 'processing' THEN 0 ELSE 1 END, d.id
             LIMIT 1`
            ).first();
        }

        if (!doc) {
            const stats = await db.prepare(
                `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
            ).all();
            return json({ success: true, message: '无待处理文档', all_done: true, stats: stats.results }, cors);
        }

        // 处理一个段落
        let result;
        try {
            result = await processOneSegment(doc, env);
        } catch (err) {
            await db.prepare(
                `UPDATE ai_learning_state
                 SET status = 'failed', error = ?, updated_at = datetime('now')
                 WHERE doc_id = ?`
            ).bind(String(err.message || err).slice(0, 500), doc.id).run();
            throw err;
        }

        // 查询剩余
        const remaining = await db.prepare(
            `SELECT COUNT(*) as cnt FROM ai_learning_state WHERE status IN ('pending', 'processing')`
        ).first();

        return json({
            success: true,
            doc_id: doc.id,
            title: doc.title,
            segment: `${result.segIndex}/${result.segTotal}`,
            doc_done: result.done,
            extracted: result.newInSegment || null,
            totals_for_doc: { qa: result.qa, quotes: result.quotes, concepts: result.concepts },
            remaining_docs: remaining?.cnt || 0,
            next_action: result.done
                ? (remaining?.cnt > 1 ? 'call_again' : 'all_done')
                : 'call_again',
        }, cors);
    } catch (err) {
        return json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) }, cors, 500);
    }
}

/**
 * GET /api/ai/brain/status — 查看学习进度
 */
export async function handleBrainStatus(env, cors, json) {
    const db = env.DB;
    const enabled = isEnvFlagEnabled(env, 'ENABLE_AI_BRAIN_JOB');

    const statusCounts = await db.prepare(
        `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
    ).all();

    const totals = await db.prepare(
        `SELECT
         SUM(qa_extracted) as total_qa,
         SUM(quotes_extracted) as total_quotes,
         SUM(concepts_extracted) as total_concepts
         FROM ai_learning_state WHERE status = 'learned'`
    ).first();

    const recent = await db.prepare(
        `SELECT doc_id, status, qa_extracted, quotes_extracted, concepts_extracted, completed_at, error
         FROM ai_learning_state
         ORDER BY updated_at DESC LIMIT 5`
    ).all();

    const topicDist = await db.prepare(
        `SELECT t.name, COUNT(q.id) as qa_count
         FROM ai_topics t
         LEFT JOIN ai_qa_pairs q ON q.topic_id = t.id
         GROUP BY t.id ORDER BY t.sort_order`
    ).all();

    return json({
        enabled,
        status_counts: statusCounts.results,
        totals: {
            qa_pairs: totals?.total_qa || 0,
            key_quotes: totals?.total_quotes || 0,
            concepts: totals?.total_concepts || 0,
        },
        recent: recent.results,
        topic_distribution: topicDist.results,
    }, cors);
}

/**
 * POST /api/ai/brain/reset — 重置学习状态
 * 可选参数 ?doc_id=xxx 只重置一篇
 */
export async function handleBrainReset(env, request, cors, json) {
    const db = env.DB;
    const url = new URL(request.url);
    const specificDoc = url.searchParams.get('doc_id');

    if (specificDoc) {
        await db.batch([
            db.prepare('DELETE FROM ai_qa_pairs WHERE doc_id = ?').bind(specificDoc),
            db.prepare('DELETE FROM ai_key_quotes WHERE doc_id = ?').bind(specificDoc),
            db.prepare('DELETE FROM ai_concepts WHERE doc_id = ?').bind(specificDoc),
            db.prepare('DELETE FROM ai_learning_state WHERE doc_id = ?').bind(specificDoc),
        ]);
        _topicCache = null;
        return json({ success: true, message: `文档 ${specificDoc} 已重置` }, cors);
    }

    await db.batch([
        db.prepare('DELETE FROM ai_qa_pairs'),
        db.prepare('DELETE FROM ai_key_quotes'),
        db.prepare('DELETE FROM ai_concepts'),
        db.prepare('DELETE FROM ai_learning_state'),
    ]);
    _topicCache = null;
    return json({ success: true, message: '知识库已清空，可重新开始学习' }, cors);
}
