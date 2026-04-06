/**
 * AI Brain — 知识提取模块
 * 后台学习文库讲记，提取结构化知识存入 D1
 */

import { AI_CONFIG, GATEWAY_PROFILES, runAIWithLogging, resolveAIModel } from './ai-utils.js';

// 知识提取的分段参数
const SEGMENT_MAX_LEN = 3500;  // 每段最大字数
const SEGMENT_OVERLAP = 200;   // 段间重叠字数

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
        start = breakPoint - SEGMENT_OVERLAP;
        if (start < 0) start = 0;
    }
    return segments.filter(s => s.length > 50); // 过滤过短段落
}

/**
 * 构建知识提取 Prompt
 */
function buildExtractionPrompt(segment, docMeta, segIndex, segTotal) {
    const system = `你是净土宗讲记知识整理专家。从讲记片段中提取结构化知识。

## 提取规则
1. 只提取法师原文中的内容，不添加自己的理解
2. 每个知识条目必须包含原文引用（逐字摘录，100-400字）
3. 问答对的"question"用普通信众可能问的自然提问方式
4. 关键引文选择法师精彩、有修行指导意义的论述
5. 概念选择净土宗核心术语

## 主题类目（选一个最匹配的）
信 | 愿 | 行 | 往生 | 净土庄严 | 阿弥陀佛 | 因果 | 菩提心 | 教理 | 实修问答

## 输出严格 JSON 格式
{
  "qa_pairs": [
    {
      "question": "信众可能问的问题",
      "answer_quote": "法师原文逐字摘录（100-400字，必须是原文中连续的文字）",
      "topic": "主题类目",
      "importance": "high 或 medium"
    }
  ],
  "key_quotes": [
    {
      "quote": "法师精彩论述原文（50-200字）",
      "topic": "主题类目",
      "context": "一句话说明上下文"
    }
  ],
  "concepts": [
    {
      "name": "净土宗术语",
      "definition": "法师对此术语的解释原文",
      "topic": "主题类目"
    }
  ]
}

注意：
- 如果片段是寒暄、开场白等非实质内容，可以返回空数组
- qa_pairs 最多 5 个，key_quotes 最多 3 个，concepts 最多 3 个
- 必须输出合法 JSON，不要加额外文字`;

    const user = `## 文档信息
- 系列：${docMeta.series_name || '未知'}
- 标题：${docMeta.title || '未知'}
- 片段：第${segIndex + 1}/${segTotal}段

## 讲记原文

${segment}`;

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
 * 处理单篇文档的知识提取
 */
async function processDocument(doc, env) {
    const db = env.DB;
    const topicMap = await getTopicMap(db);

    // 标记为处理中
    await db.prepare(
        `INSERT OR REPLACE INTO ai_learning_state (doc_id, status, started_at, updated_at)
     VALUES (?, 'processing', datetime('now'), datetime('now'))`
    ).bind(doc.id).run();

    const segments = splitDocForLearning(doc.content);
    const totalSegments = segments.length;

    // 更新总段数
    await db.prepare(
        `UPDATE ai_learning_state SET segments_total = ? WHERE doc_id = ?`
    ).bind(totalSegments, doc.id).run();

    let totalQA = 0;
    let totalQuotes = 0;
    let totalConcepts = 0;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const { system, user } = buildExtractionPrompt(
            segment,
            { series_name: doc.series_name, title: doc.title },
            i,
            totalSegments
        );

        try {
            // 调用 LLM 提取知识
            const model = resolveAIModel(env, 'chat');
            const response = await runAIWithLogging(
                env,
                model,
                {
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user },
                    ],
                    max_tokens: 2048,
                    temperature: 0.3,
                },
                GATEWAY_PROFILES.ragChat,
                'brain-extract'
            );

            const rawText = typeof response === 'string'
                ? response
                : response?.response || response?.result?.response || '';

            const extracted = parseLLMJson(rawText);
            if (!extracted) {
                // LLM 没返回有效 JSON，跳过此段
                await db.prepare(
                    `UPDATE ai_learning_state SET segments_done = segments_done + 1, updated_at = datetime('now') WHERE doc_id = ?`
                ).bind(doc.id).run();
                continue;
            }

            // 存储问答对
            if (Array.isArray(extracted.qa_pairs)) {
                for (const qa of extracted.qa_pairs) {
                    if (!qa.question || !qa.answer_quote) continue;
                    // 验证引文真实性
                    const isValid = validateQuoteInSource(qa.answer_quote, doc.content);
                    if (!isValid) continue; // 跳过无法在原文中验证的引文
                    const topicId = topicMap[qa.topic] || topicMap['教理'] || 9;
                    const position = findQuotePosition(qa.answer_quote, doc.content);
                    await db.prepare(
                        `INSERT INTO ai_qa_pairs (doc_id, topic_id, question, answer_quote, answer_position, importance, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        doc.id, topicId, qa.question.trim(), qa.answer_quote.trim(),
                        position, qa.importance || 'medium', isValid ? 0.9 : 0.5
                    ).run();
                    totalQA++;
                }
            }

            // 存储关键引文
            if (Array.isArray(extracted.key_quotes)) {
                for (const kq of extracted.key_quotes) {
                    if (!kq.quote) continue;
                    const isValid = validateQuoteInSource(kq.quote, doc.content);
                    if (!isValid) continue;
                    const topicId = topicMap[kq.topic] || topicMap['教理'] || 9;
                    const position = findQuotePosition(kq.quote, doc.content);
                    await db.prepare(
                        `INSERT INTO ai_key_quotes (doc_id, topic_id, quote, context, position)
             VALUES (?, ?, ?, ?, ?)`
                    ).bind(doc.id, topicId, kq.quote.trim(), kq.context || '', position).run();
                    totalQuotes++;
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
                    totalConcepts++;
                }
            }

            // 更新段进度
            await db.prepare(
                `UPDATE ai_learning_state
         SET segments_done = ?, qa_extracted = ?, quotes_extracted = ?, concepts_extracted = ?, updated_at = datetime('now')
         WHERE doc_id = ?`
            ).bind(i + 1, totalQA, totalQuotes, totalConcepts, doc.id).run();

        } catch (err) {
            // 记录段级错误但继续处理
            console.error(`Brain extract error doc=${doc.id} seg=${i}:`, err.message);
        }
    }

    // 标记完成
    await db.prepare(
        `UPDATE ai_learning_state
     SET status = 'learned', completed_at = datetime('now'), updated_at = datetime('now'),
         qa_extracted = ?, quotes_extracted = ?, concepts_extracted = ?
     WHERE doc_id = ?`
    ).bind(totalQA, totalQuotes, totalConcepts, doc.id).run();

    return { qa: totalQA, quotes: totalQuotes, concepts: totalConcepts, segments: totalSegments };
}

// ============================================================
// API 处理函数
// ============================================================

/**
 * POST /api/ai/brain/learn — 启动/继续知识学习
 * 每次处理 limit 篇文档（默认1，最大3）
 * 支持参数：?limit=1&retry=true&doc_id=xxx
 */
export async function handleBrainLearn(env, request, cors, json) {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '1', 10), 3);
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

    // 获取待处理文档
    let query;
    if (specificDoc) {
        query = db.prepare(
            `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
       FROM documents d WHERE d.id = ? AND d.content IS NOT NULL AND d.content != ''`
        ).bind(specificDoc);
    } else if (retryFailed) {
        query = db.prepare(
            `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
       FROM documents d
       INNER JOIN ai_learning_state ls ON ls.doc_id = d.id AND ls.status = 'failed'
       WHERE d.content IS NOT NULL AND d.content != ''
       ORDER BY d.id LIMIT ?`
        ).bind(limit);
    } else {
        query = db.prepare(
            `SELECT d.id, d.title, d.content, d.series_name, d.audio_episode_num
       FROM documents d
       INNER JOIN ai_learning_state ls ON ls.doc_id = d.id AND ls.status = 'pending'
       WHERE d.content IS NOT NULL AND d.content != ''
       ORDER BY d.id LIMIT ?`
        ).bind(limit);
    }

    const { results: documents } = await query.all();

    if (!documents.length) {
        // 查询总体状态
        const stats = await db.prepare(
            `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
        ).all();
        return json({
            success: true,
            message: '无待处理文档',
            stats: stats.results,
        }, cors);
    }

    const results = [];
    for (const doc of documents) {
        try {
            const result = await processDocument(doc, env);
            results.push({ doc_id: doc.id, title: doc.title, ...result, status: 'learned' });
        } catch (err) {
            // 标记失败
            await db.prepare(
                `UPDATE ai_learning_state SET status = 'failed', error = ?, updated_at = datetime('now') WHERE doc_id = ?`
            ).bind(err.message, doc.id).run();
            results.push({ doc_id: doc.id, title: doc.title, error: err.message, status: 'failed' });
        }
    }

    // 查询剩余待处理数
    const remaining = await db.prepare(
        `SELECT COUNT(*) as cnt FROM ai_learning_state WHERE status = 'pending'`
    ).first();

    // 查询总体统计
    const totalStats = await db.prepare(
        `SELECT
       SUM(qa_extracted) as total_qa,
       SUM(quotes_extracted) as total_quotes,
       SUM(concepts_extracted) as total_concepts
     FROM ai_learning_state WHERE status = 'learned'`
    ).first();

    return json({
        success: true,
        processed: results,
        remaining: remaining?.cnt || 0,
        totals: {
            qa_pairs: totalStats?.total_qa || 0,
            key_quotes: totalStats?.total_quotes || 0,
            concepts: totalStats?.total_concepts || 0,
        },
    }, cors);
}

/**
 * GET /api/ai/brain/status — 查看学习进度
 */
export async function handleBrainStatus(env, cors, json) {
    const db = env.DB;

    // 各状态计数
    const statusCounts = await db.prepare(
        `SELECT status, COUNT(*) as cnt FROM ai_learning_state GROUP BY status`
    ).all();

    // 总提取量
    const totals = await db.prepare(
        `SELECT
       SUM(qa_extracted) as total_qa,
       SUM(quotes_extracted) as total_quotes,
       SUM(concepts_extracted) as total_concepts
     FROM ai_learning_state WHERE status = 'learned'`
    ).first();

    // 最近处理的文档
    const recent = await db.prepare(
        `SELECT doc_id, status, qa_extracted, quotes_extracted, concepts_extracted, completed_at, error
     FROM ai_learning_state
     ORDER BY updated_at DESC LIMIT 5`
    ).all();

    // 主题分布
    const topicDist = await db.prepare(
        `SELECT t.name, COUNT(q.id) as qa_count
     FROM ai_topics t
     LEFT JOIN ai_qa_pairs q ON q.topic_id = t.id
     GROUP BY t.id ORDER BY t.sort_order`
    ).all();

    return json({
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
 * POST /api/ai/brain/reset — 重置学习状态（清空知识，重新来过）
 */
export async function handleBrainReset(env, cors, json) {
    const db = env.DB;
    await db.batch([
        db.prepare('DELETE FROM ai_qa_pairs'),
        db.prepare('DELETE FROM ai_key_quotes'),
        db.prepare('DELETE FROM ai_concepts'),
        db.prepare('DELETE FROM ai_learning_state'),
    ]);
    _topicCache = null;
    return json({ success: true, message: '知识库已清空，可重新开始学习' }, cors);
}
