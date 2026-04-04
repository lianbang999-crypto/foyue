/**
 * AI 工具模块 — 共享的服务端 AI 功能
 * 供 Pages Functions 路由处理器使用
 */

import {
  buildRagSystemPrompt,
  buildSummaryMessages,
  normalizeHistoryMessages,
} from './ai-prompts.js';

// ============================================================
// 配置常量
// ============================================================
export const AI_CONFIG = {
  // 基础 Gateway 标识
  gateway: {
    id: 'buddhist-ai-gateway',
    skipCache: false,
    cacheTtl: 3600,
  },
  models: {
    embedding: '@cf/baai/bge-m3',
    chat: '@cf/qwen/qwen3-30b-a3b-fp8',
    chatFallback: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    whisper: '@cf/openai/whisper-large-v3-turbo',
  },
  vectorize: {
    topK: 5,
    scoreThreshold: 0.35,
  },
  chunking: {
    maxChunkSize: 800,
    overlapSize: 120,
  },
  rateLimit: {
    maxPerMinute: 10,
    maxPerDay: 100,
  },
};

// ============================================================
// AI Gateway 分场景配置 — 按调用类型区分缓存策略
// ============================================================
const GATEWAY_BASE = { id: 'buddhist-ai-gateway' };

export const GATEWAY_PROFILES = {
  // Embedding：相同文本 → 相同向量，高度确定性，长缓存
  embedding: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 86400,      // 24 小时 — 同一文本的向量不会变
  },

  // 语义搜索（查询侧 embedding）：用户查询词可能重复，中等缓存
  searchEmbedding: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 43200,      // 12 小时 — 热门查询词缓存
  },

  // RAG 问答（非流式）：含上下文，每次不同，跳过缓存
  ragChat: {
    ...GATEWAY_BASE,
    skipCache: true,
  },

  // RAG 问答（流式 SSE）：必须跳过缓存
  ragStream: {
    ...GATEWAY_BASE,
    skipCache: true,
  },

  // 文档摘要：确定性高（同标题+同内容），长缓存
  summary: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 604800,     // 7 天 — 文档内容不变则摘要不变
  },

  // 每日推荐语：每天更新，缓存匹配推荐周期
  recommend: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 43200,      // 12 小时 — 每天刷新，但当天内可复用
  },

  // Whisper 转写：相同音频 → 相同文字，缓存
  whisper: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 604800,     // 7 天 — 同音频转写结果不变
  },

  // 管理员诊断：不缓存，确保测试结果真实
  diagnostic: {
    ...GATEWAY_BASE,
    skipCache: true,
  },

  // Reranker：相同 query+contexts → 相同排序，中等缓存
  reranker: {
    ...GATEWAY_BASE,
    skipCache: false,
    cacheTtl: 43200,      // 12 小时
  },
};

function shouldRetryWithoutGateway(err) {
  const message = String(err?.message || '');
  return /gateway|gateway profile|ai gateway|invalid gateway|not configured/i.test(message);
}

// ============================================================
// 短 hash — 将长字符串压缩为 12 字符的 hex
// ============================================================
function shortHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const h2 = h >>> 0;
  let h3 = 0x6c62272e;
  for (let i = str.length - 1; i >= 0; i--) {
    h3 ^= str.charCodeAt(i);
    h3 = Math.imul(h3, 0x01000193);
  }
  const h4 = h3 >>> 0;
  return h2.toString(16).padStart(8, '0') + h4.toString(16).padStart(8, '0');
}

// ============================================================
// 文本切块 — 保持段落完整性，超长段落按句子切分
// NOTE: 修改切块参数后需重建 Vectorize 嵌入
//       POST /api/admin/embeddings/build?rebuild=true
// ============================================================
const HEADING_PATTERN = /^(第[一二三四五六七八九十百千\d]+[讲章节篇回]|[一二三四五六七八九十]+[、.]|[\d]+[、.]|【.+】)/;

export function chunkText(text, docId, metadata = {}) {
  if (!text || typeof text !== 'string') return [];
  const { maxChunkSize, overlapSize } = AI_CONFIG.chunking;
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  let idx = 0;

  function pushChunk(content) {
    const trimmed = content.trim();
    if (!trimmed) return;
    // Vectorize ID 上限 64 字节，用 shortHash 压缩长 docId
    const shortId = shortHash(docId);
    chunks.push({
      id: `${shortId}-c${idx}`,
      text: trimmed,
      metadata: { ...metadata, doc_id: docId, chunk_index: idx },
    });
    idx++;
  }

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 检测标题行（如"第一讲"、"一、"、"【净土资粮】"），强制开始新 chunk
    if (HEADING_PATTERN.test(trimmed) && current.trim()) {
      pushChunk(current);
      current = '';
    }

    // 如果单个段落就超过 maxChunkSize，按句子强制切分
    if (trimmed.length > maxChunkSize) {
      // 先把 current 中已有内容推出
      if (current) { pushChunk(current); current = ''; }
      // 按句号/问号/叹号/换行切分超长段落
      const sentences = trimmed.split(/(?<=[。！？\n])/);
      let buf = '';
      for (const s of sentences) {
        if (buf.length + s.length > maxChunkSize && buf) {
          pushChunk(buf);
          buf = buf.slice(-overlapSize) + s;
        } else {
          buf += s;
        }
      }
      // 如果 buf 还是超长（无标点的连续文本），硬切
      while (buf.length > maxChunkSize) {
        pushChunk(buf.slice(0, maxChunkSize));
        buf = buf.slice(maxChunkSize - overlapSize);
      }
      if (buf) current = buf;
      continue;
    }

    if (current.length + trimmed.length > maxChunkSize && current.length > 0) {
      pushChunk(current);
      const overlap = current.slice(-overlapSize);
      current = overlap + '\n\n' + trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  if (current.trim()) {
    pushChunk(current);
  }

  return chunks;
}

// ============================================================
// 生成嵌入向量
// ============================================================
export async function generateEmbeddings(env, texts, options = {}) {
  const { gatewayProfile = 'embedding', ctx = null } = options;
  const response = await runAIWithLogging(
    env,
    AI_CONFIG.models.embedding,
    { text: texts },
    GATEWAY_PROFILES[gatewayProfile] || GATEWAY_PROFILES.embedding,
    gatewayProfile,
    ctx
  );
  return response.data; // float[][] 每个 1024 维 (bge-m3 在 Workers AI 上输出 1024 维)
}

// ============================================================
// 语义搜索 — Vectorize 查询
// ============================================================
export async function semanticSearch(env, query, options = {}) {
  if (!env?.VECTORIZE) return [];
  const {
    topK = AI_CONFIG.vectorize.topK,
    filter = {},
    scoreThreshold = AI_CONFIG.vectorize.scoreThreshold,
    ctx = null,
  } = options;

  const [queryVector] = await generateEmbeddings(env, [query], { gatewayProfile: 'searchEmbedding', ctx });

  const queryOptions = { topK, returnMetadata: 'all' };
  if (Object.keys(filter).length > 0) {
    queryOptions.filter = filter;
  }

  const results = await env.VECTORIZE.query(queryVector, queryOptions);
  return results.matches.filter(m => m.score >= scoreThreshold);
}

// ============================================================
// 重排序 — 使用 bge-reranker-base 对检索结果精排
// ============================================================
export async function rerankResults(env, query, matches, options = {}) {
  const { topK, ctx = null } = options;
  // 提取有文本的匹配项
  const withText = matches.filter(m => m.metadata?.text);
  if (withText.length < 2) return matches; // 不足 2 条无需重排

  const contexts = withText.map(m => ({ text: m.metadata.text }));
  try {
    const result = await runAIWithLogging(
      env,
      '@cf/baai/bge-reranker-base',
      { query, contexts, top_k: topK || contexts.length },
      GATEWAY_PROFILES.reranker,
      'reranker',
      ctx
    );
    // result.response = [{ id: index, score: float }]
    const ranked = (result.response || [])
      .sort((a, b) => b.score - a.score)
      .map(r => withText[r.id])
      .filter(Boolean);
    // 把没有文本的条目追加到末尾
    const noText = matches.filter(m => !m.metadata?.text);
    return [...ranked, ...noText].slice(0, topK || matches.length);
  } catch (err) {
    console.warn('Reranker failed, using original order:', err.message);
    return matches; // 优雅降级
  }
}

// ============================================================
// 上下文扩展 — 从源文档中扩展匹配片段的上下文窗口
// ============================================================
export function expandContextFromDocs(matches, docs, options = {}) {
  const { overlapChars = 200 } = options;
  return matches.map(m => {
    const docId = m.metadata?.doc_id;
    const chunkText = m.metadata?.text || '';
    if (!chunkText || !docId) return m;

    const doc = docs.find(d => d.id === docId);
    if (!doc || !doc.content) return m;

    // 在原文中定位 chunk 的位置
    const searchKey = chunkText.slice(0, 80).trim();
    const pos = doc.content.indexOf(searchKey);
    if (pos === -1) return m;

    // 扩展上下文窗口
    const start = Math.max(0, pos - overlapChars);
    const end = Math.min(doc.content.length, pos + chunkText.length + overlapChars);
    const expandedText = doc.content.slice(start, end);

    return {
      ...m,
      metadata: { ...m.metadata, text: expandedText },
    };
  });
}

// ============================================================
// 从 D1 检索源文档
// ============================================================
export async function retrieveDocuments(env, vectorMatches) {
  if (!vectorMatches.length) return [];

  const docIds = [...new Set(
    vectorMatches.map(m => m.metadata?.doc_id).filter(Boolean)
  )].slice(0, 20);

  if (!docIds.length) return [];

  const placeholders = docIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, title, content, category, series_name,
            audio_series_id, audio_episode_num
     FROM documents WHERE id IN (${placeholders})`
  ).bind(...docIds).all();

  return results;
}

// ============================================================
// 提取 AI 响应文本 — 兼容多种 Workers AI 模型格式
// 旧格式: { response: "..." }
// 新格式 (OpenAI 兼容): { choices: [{ message: { content: "..." } }] }
// GLM / other: { result: { response: "..." } } or { text: "..." }
// ============================================================
export function extractAIResponse(result) {
  if (!result) return null;
  // 旧格式
  if (typeof result.response === 'string' && result.response) {
    return result.response;
  }
  // 新格式 (choices)
  if (result.choices && result.choices.length > 0) {
    const msg = result.choices[0].message;
    if (msg) {
      // content 优先，reasoning 次之
      if (typeof msg.content === 'string' && msg.content) return msg.content;
      if (typeof msg.reasoning === 'string' && msg.reasoning) return msg.reasoning;
    }
  }
  // Nested result wrapper
  if (result.result && typeof result.result.response === 'string' && result.result.response) {
    return result.result.response;
  }
  // Direct text field
  if (typeof result.text === 'string' && result.text) {
    return result.text;
  }
  return null;
}

// Strip Qwen3 <think>...</think> blocks from output
export function stripThinkTags(text) {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ============================================================
// RAG 问答 — 检索增强生成
// ============================================================
export async function ragAnswer(env, question, contextDocs, options = {}) {
  const { history = [], vectorMatches = [], ctx = null } = options;
  const messages = buildRAGMessages(question, contextDocs, { history, vectorMatches });

  let response;
  try {
    response = await runAIWithLogging(
      env,
      AI_CONFIG.models.chat,
      {
        messages,
        max_tokens: 500,
        temperature: 0.2,
      },
      GATEWAY_PROFILES.ragChat,
      'ragChat',
      ctx
    );
  } catch (err) {
    console.warn('Primary chat model failed, using fallback:', err.message);
    response = await runAIWithLogging(
      env,
      AI_CONFIG.models.chatFallback,
      {
        messages,
        max_tokens: 500,
        temperature: 0.2,
      },
      GATEWAY_PROFILES.ragChat,
      'ragChat',
      ctx
    );
  }

  return { response: stripThinkTags(extractAIResponse(response)) };
}

// ============================================================
// Build RAG messages (shared by ragAnswer and streaming endpoint)
// ============================================================
export function buildRAGMessages(question, contextDocs, options = {}) {
  const { maxContextLength = 10000, history = [], vectorMatches = [] } = options;

  let context = '';
  if (vectorMatches.length > 0) {
    const seen = new Set();
    for (const m of vectorMatches) {
      const docId = m.metadata?.doc_id;
      const chunkText = m.metadata?.text || '';
      const doc = contextDocs.find(d => d.id === docId);
      const title = doc?.title || m.metadata?.title || '未知';
      if (chunkText && context.length + chunkText.length < maxContextLength) {
        const key = `${docId}:${m.metadata?.chunk_index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        context += `【${title}】\n${chunkText}\n\n`;
      }
    }
  }
  if (!context) {
    const perDocLimit = Math.floor(maxContextLength / Math.max(contextDocs.length, 1));
    for (const doc of contextDocs) {
      const snippet = doc.content ? doc.content.slice(0, perDocLimit) : '';
      context += `【${doc.title}】\n${snippet}\n\n`;
    }
  }

  const messages = [{ role: 'system', content: buildRagSystemPrompt(context) }];
  messages.push(...normalizeHistoryMessages(history));
  messages.push({ role: 'user', content: question });
  return messages;
}

// ============================================================
// 生成内容摘要
// ============================================================
export async function generateSummary(env, title, content, options = {}) {
  const { ctx = null } = options;
  const truncated = content.slice(0, 6000);
  const messages = buildSummaryMessages(title, truncated);

  let response;
  try {
    response = await runAIWithLogging(
      env,
      AI_CONFIG.models.chat,
      { messages, max_tokens: 300, temperature: 0.2 },
      GATEWAY_PROFILES.summary,
      'summary',
      ctx
    );
  } catch (err) {
    console.warn('Summary primary model failed, using fallback:', err.message);
    response = await runAIWithLogging(
      env,
      AI_CONFIG.models.chatFallback,
      { messages, max_tokens: 300, temperature: 0.2 },
      GATEWAY_PROFILES.summary,
      'summary',
      ctx
    );
  }

  return extractAIResponse(response);
}

// ============================================================
// IP 限流检查 — 先插入再检查，避免 TOCTOU 竞态
// ============================================================
export async function checkRateLimit(env, ip, action = 'ai_request') {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const dayAgo = now - 86_400_000;

  // 先插入本次请求记录（原子操作）
  await env.DB.prepare(
    'INSERT INTO ai_rate_limits (ip, action, timestamp) VALUES (?, ?, ?)'
  ).bind(ip, action, now).run();

  // 再检查分钟计数（含本次）
  const minuteRow = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM ai_rate_limits
     WHERE ip = ? AND action = ? AND timestamp > ?`
  ).bind(ip, action, minuteAgo).first();

  if (minuteRow.count > AI_CONFIG.rateLimit.maxPerMinute) {
    return { allowed: false, reason: '请求过于频繁，请稍后再试' };
  }

  // 检查每天计数（含本次）
  const dayRow = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM ai_rate_limits
     WHERE ip = ? AND action = ? AND timestamp > ?`
  ).bind(ip, action, dayAgo).first();

  if (dayRow.count > AI_CONFIG.rateLimit.maxPerDay) {
    return { allowed: false, reason: '今日AI请求次数已达上限' };
  }

  return { allowed: true };
}

// ============================================================
// 清理过期限流记录（可定期调用）
// ============================================================
export async function cleanupRateLimits(env) {
  const twoDaysAgo = Date.now() - 172_800_000;
  await env.DB.prepare(
    'DELETE FROM ai_rate_limits WHERE timestamp < ?'
  ).bind(twoDaysAgo).run();
}

// ============================================================
// 恒定时间字符串比较（防时序攻击）
// ============================================================
export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

// ============================================================
// AI 调用日志 — 记录每次 AI Gateway 调用的场景和耗时
// ============================================================
export async function logAICall(env, { scenario, model, durationMs, cached = false, success = true, error = null }) {
  try {
    await env.DB.prepare(
      `INSERT INTO ai_call_logs (scenario, model, duration_ms, cached, success, error, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(scenario, model, Math.round(durationMs), cached ? 1 : 0, success ? 1 : 0, error, Date.now()).run();
  } catch (e) {
    // 日志写入失败不应影响主流程
    console.warn('[logAICall] Failed to log:', e.message);
  }
}

// ============================================================
// AI 调用统计 — 按场景汇总
// ============================================================
export async function getAICallStats(env, { days = 7 } = {}) {
  const since = Date.now() - days * 86_400_000;
  const { results } = await env.DB.prepare(
    `SELECT scenario, model,
            COUNT(*) as total_calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) as cache_hits,
            ROUND(AVG(duration_ms)) as avg_duration_ms,
            MIN(duration_ms) as min_duration_ms,
            MAX(duration_ms) as max_duration_ms
     FROM ai_call_logs
     WHERE timestamp > ?
     GROUP BY scenario, model
     ORDER BY total_calls DESC`
  ).bind(since).all();
  return results;
}

// ============================================================
// 带计时和日志的 AI.run 封装
// ctx 参数可选 — 传入 Pages Function context 以启用 waitUntil 非阻塞日志
// ============================================================
export async function runAIWithLogging(env, model, input, gatewayOptions, scenario, ctx = null) {
  const start = Date.now();
  let success = true;
  let error = null;
  try {
    if (!env?.AI?.run) {
      throw new Error('Workers AI binding is not available');
    }

    let result;
    try {
      result = await env.AI.run(model, input, gatewayOptions ? { gateway: gatewayOptions } : undefined);
    } catch (err) {
      if (!gatewayOptions || !shouldRetryWithoutGateway(err)) throw err;
      console.warn('[AI] Gateway unavailable, retrying without gateway:', err.message);
      result = await env.AI.run(model, input);
    }
    return result;
  } catch (err) {
    success = false;
    error = err.message?.slice(0, 200);
    throw err;
  } finally {
    const durationMs = Date.now() - start;
    const logPromise = logAICall(env, { scenario, model, durationMs, success, error });
    // 使用 waitUntil 非阻塞写入；无 ctx 时直接 fire-and-forget
    if (ctx?.waitUntil) {
      ctx.waitUntil(logPromise);
    } else {
      logPromise.catch(() => { });
    }
  }
}
