/**
 * AI 工具模块 — 共享的服务端 AI 功能
 * 供 Pages Functions 路由处理器使用
 */

import {
  buildRagSystemPrompt,
  buildSummaryMessages,
  normalizeHistoryMessages,
  UNSUPPORTED_RE,
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
    scoreThreshold: 0.28,
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

const AI_MODEL_ENV_KEYS = {
  embedding: 'AI_EMBEDDING_MODEL',
  chat: 'AI_CHAT_MODEL',
  chatFallback: 'AI_CHAT_FALLBACK_MODEL',
  whisper: 'AI_WHISPER_MODEL',
};

export function resolveAIModel(env, modelKey) {
  const envKey = AI_MODEL_ENV_KEYS[modelKey];
  const configured = envKey && typeof env?.[envKey] === 'string'
    ? env[envKey].trim()
    : '';
  return configured || AI_CONFIG.models[modelKey];
}

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
// 外部 LLM API（OpenAI 兼容格式 — 智谱 GLM/DeepSeek 等）
// 不消耗 Workers AI neuron 配额
// ============================================================
const DEFAULT_EXTERNAL_LLM_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_EXTERNAL_LLM_MODEL = 'glm-4.7-flash';

export function getExternalLLMConfig(env) {
  const apiKey = env?.EXTERNAL_LLM_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env?.EXTERNAL_LLM_BASE || DEFAULT_EXTERNAL_LLM_BASE).replace(/\/+$/, ''),
    model: env?.EXTERNAL_LLM_MODEL || DEFAULT_EXTERNAL_LLM_MODEL,
  };
}

// Groq 备用 LLM（OpenAI 兼容格式，免费 LLaMA 3.3 70B）
const DEFAULT_GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export function getGroqConfig(env) {
  const apiKey = env?.GROQ_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env?.GROQ_BASE || DEFAULT_GROQ_BASE).replace(/\/+$/, ''),
    model: env?.GROQ_MODEL || DEFAULT_GROQ_MODEL,
  };
}

export function isEnvFlagEnabled(env, envKey, defaultValue = true) {
  const rawValue = env?.[envKey];
  if (rawValue === undefined || rawValue === null) return defaultValue;
  const normalized = String(rawValue).trim();
  if (!normalized) return defaultValue;
  return !/^(false|0|off|no)$/i.test(normalized);
}

// ============================================================
// 超出范围检测（简版，由 ai-prompts.js 提供 UNSUPPORTED_RE）
// ============================================================
export function isUnsupportedQuestion(question) {
  return UNSUPPORTED_RE.test(String(question || ''));
}

function buildWorkersAiProviderDescriptors(env) {
  if (!env?.AI?.run) return [];

  const primaryModel = resolveAIModel(env, 'chat');
  const fallbackModel = resolveAIModel(env, 'chatFallback');
  const providers = [
    {
      provider: 'workers_ai',
      model: primaryModel,
      stage: 'primary',
      supportsNativeStream: false,
      type: 'workers_ai',
    },
  ];

  if (fallbackModel && fallbackModel !== primaryModel) {
    providers.push({
      provider: 'workers_ai',
      model: fallbackModel,
      stage: 'fallback',
      supportsNativeStream: false,
      type: 'workers_ai',
    });
  }

  return providers;
}

export function getChatProviderPriority(env) {
  const providers = [...buildWorkersAiProviderDescriptors(env)];
  const hasWorkersAi = providers.length > 0;
  const externalConfig = getExternalLLMConfig(env);
  const groqConfig = getGroqConfig(env);

  if (externalConfig) {
    providers.push({
      provider: 'external_openai_compatible',
      model: externalConfig.model,
      stage: hasWorkersAi ? 'fallback' : 'primary',
      supportsNativeStream: true,
      type: 'external',
      config: externalConfig,
    });
  }

  if (groqConfig) {
    providers.push({
      provider: 'groq',
      model: groqConfig.model,
      stage: hasWorkersAi || externalConfig ? 'fallback' : 'primary',
      supportsNativeStream: true,
      type: 'external',
      config: groqConfig,
    });
  }

  return providers;
}

export function getPreferredChatProvider(env) {
  return getChatProviderPriority(env)[0] || null;
}

// 非流式调用外部 LLM（支持 config 注入，用于 Groq 等备用提供商）
export async function callExternalLLM(env, messages, options = {}) {
  const config = options.config || getExternalLLMConfig(env);
  if (!config) throw new Error('External LLM not configured');
  const { maxTokens = 500, temperature = 0.2 } = options;
  const url = `${config.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`External LLM ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

// 流式调用外部 LLM（返回 ReadableStream of SSE，支持 config 注入）
export async function streamExternalLLM(env, messages, options = {}) {
  const config = options.config || getExternalLLMConfig(env);
  if (!config) throw new Error('External LLM not configured');
  const { maxTokens = 500, temperature = 0.2 } = options;
  const url = `${config.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`External LLM stream ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.body;
}

function extractOpenAICompatibleStreamText(event) {
  const delta = event?.choices?.[0]?.delta;

  if (typeof delta?.content === 'string' && delta.content) {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }

  const fallback = extractAIResponse(event);
  return typeof fallback === 'string' ? fallback : '';
}

async function consumeSseBlock(block, handlers = {}) {
  const lines = String(block || '').split('\n');
  let eventType = 'message';
  const dataLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return false;

  const data = dataLines.join('\n').trim();
  if (!data) return false;
  if (data === '[DONE]') return true;

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return false;
  }

  await handlers.onEvent?.(parsed, eventType);

  const token = extractOpenAICompatibleStreamText(parsed);
  if (token) {
    await handlers.onToken?.(token, parsed, eventType);
  }

  return false;
}

export async function consumeOpenAICompatibleStream(stream, handlers = {}) {
  if (!stream?.getReader) {
    throw new Error('OpenAI compatible stream body is not readable');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const shouldStop = await consumeSseBlock(block, handlers);
      if (shouldStop) {
        await reader.cancel().catch(() => { });
        return;
      }
    }

    if (done) break;
  }

  if (buffer.trim()) {
    await consumeSseBlock(buffer, handlers);
  }
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
    resolveAIModel(env, 'embedding'),
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

function buildAnswerModelInfo(provider, model, options = {}) {
  return {
    provider,
    model: model || null,
    used: true,
    stage: options.stage || 'primary',
    via: options.via || 'rag',
    supportsNativeStream: options.supportsNativeStream === true,
  };
}

async function invokeChatProvider(env, descriptor, messages, options = {}) {
  const {
    maxTokens = 500,
    temperature = 0.2,
    gatewayProfile = GATEWAY_PROFILES.ragChat,
    scenario = 'chat',
    ctx = null,
  } = options;

  if (descriptor.type === 'workers_ai') {
    const response = await runAIWithLogging(
      env,
      descriptor.model,
      {
        messages,
        max_tokens: maxTokens,
        temperature,
      },
      gatewayProfile,
      scenario,
      ctx
    );

    return stripThinkTags(extractAIResponse(response));
  }

  return stripThinkTags(await callExternalLLM(env, messages, {
    maxTokens,
    temperature,
    config: descriptor.config,
  }));
}

export async function generateChatText(env, messages, options = {}) {
  const providers = getChatProviderPriority(env);
  if (!providers.length) {
    throw new Error('No chat provider configured');
  }

  let lastError = null;
  for (const descriptor of providers) {
    try {
      const text = await invokeChatProvider(env, descriptor, messages, options);
      const normalized = String(text || '').trim();
      if (!normalized) {
        lastError = new Error(`${descriptor.provider} returned empty response`);
        continue;
      }

      return {
        response: normalized,
        modelInfo: buildAnswerModelInfo(descriptor.provider, descriptor.model, {
          stage: descriptor.stage,
          via: options.via || 'chat',
          supportsNativeStream: descriptor.supportsNativeStream,
        }),
      };
    } catch (err) {
      lastError = err;
      console.warn(`[AI] ${descriptor.provider} ${options.scenario || 'chat'} failed:`, err.message);
    }
  }

  throw lastError || new Error('No chat provider succeeded');
}

// ============================================================
// RAG 问答 — 检索增强生成（简化版：无 router/evidence）
// ============================================================
export async function ragAnswer(env, question, contextDocs, options = {}) {
  const {
    history = [],
    vectorMatches = [],
    ctx = null,
  } = options;
  const messages = buildRAGMessages(question, contextDocs, {
    history,
    vectorMatches,
  });

  return generateChatText(env, messages, {
    maxTokens: 500,
    temperature: 0.2,
    gatewayProfile: GATEWAY_PROFILES.ragChat,
    scenario: 'ragChat',
    ctx,
    via: 'rag',
  });
}

function normalizeEvidenceText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripSnippetEllipsis(value) {
  return normalizeEvidenceText(value).replace(/^[.…\s]+|[.…\s]+$/g, '').trim();
}

function buildAnchorText(value) {
  const clean = stripSnippetEllipsis(value);
  if (!clean) return '';
  if (clean.length <= 36) return clean;
  const anchorLength = Math.min(36, Math.max(12, Math.floor(clean.length * 0.45)));
  const anchorStart = Math.max(0, Math.floor((clean.length - anchorLength) / 2));
  return clean.slice(anchorStart, anchorStart + anchorLength).trim();
}

function collapseWhitespaceWithMap(text) {
  let normalized = '';
  const map = [];
  let sawNonSpace = false;
  let pendingSpace = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      pendingSpace = sawNonSpace;
      continue;
    }

    if (pendingSpace && normalized) {
      normalized += ' ';
      map.push(index);
      pendingSpace = false;
    }

    normalized += char;
    map.push(index);
    sawNonSpace = true;
  }

  return { normalized, map };
}

function splitParagraphRanges(content) {
  const text = String(content || '');
  if (!text) return [];

  const segments = text.split(/\n\s*\n/);
  const paragraphs = [];
  let cursor = 0;

  for (const segment of segments) {
    const segmentStart = text.indexOf(segment, cursor);
    if (segmentStart === -1) continue;
    cursor = segmentStart + segment.length;

    const trimmed = segment.trim();
    if (!trimmed) continue;

    const trimmedOffset = segment.indexOf(trimmed);
    const start = segmentStart + Math.max(trimmedOffset, 0);
    const end = start + trimmed.length;
    paragraphs.push({ text: trimmed, start, end });
  }

  return paragraphs;
}

function locateSnippet(content, snippet) {
  const source = String(content || '');
  const cleanSnippet = stripSnippetEllipsis(snippet);
  if (!source || !cleanSnippet) {
    return {
      rawOffset: null,
      normalizedOffset: null,
      matchText: cleanSnippet || null,
      anchorText: buildAnchorText(cleanSnippet) || null,
      matchMode: 'missing',
    };
  }

  const exactOffset = source.indexOf(cleanSnippet);
  if (exactOffset !== -1) {
    return {
      rawOffset: exactOffset,
      normalizedOffset: null,
      matchText: cleanSnippet,
      anchorText: buildAnchorText(cleanSnippet) || cleanSnippet,
      matchMode: 'exact',
    };
  }

  const normalizedSource = collapseWhitespaceWithMap(source);
  const normalizedSnippet = collapseWhitespaceWithMap(cleanSnippet).normalized;
  if (normalizedSnippet) {
    const normalizedOffset = normalizedSource.normalized.indexOf(normalizedSnippet);
    if (normalizedOffset !== -1) {
      return {
        rawOffset: normalizedSource.map[normalizedOffset] ?? null,
        normalizedOffset,
        matchText: normalizedSnippet,
        anchorText: buildAnchorText(normalizedSnippet) || normalizedSnippet,
        matchMode: 'normalized',
      };
    }

    const anchorText = buildAnchorText(normalizedSnippet);
    if (anchorText) {
      const anchorOffset = normalizedSource.normalized.indexOf(anchorText);
      if (anchorOffset !== -1) {
        return {
          rawOffset: normalizedSource.map[anchorOffset] ?? null,
          normalizedOffset: anchorOffset,
          matchText: anchorText,
          anchorText,
          matchMode: 'anchor',
        };
      }
    }
  }

  return {
    rawOffset: null,
    normalizedOffset: null,
    matchText: cleanSnippet,
    anchorText: buildAnchorText(cleanSnippet) || null,
    matchMode: 'snippet_only',
  };
}

export function buildEvidenceLocation(doc, snippet, options = {}) {
  const content = String(doc?.content || '');
  const docId = String(doc?.id || options.docId || '').trim();
  const cleanSnippet = stripSnippetEllipsis(snippet || options.matchText || '');
  const located = locateSnippet(content, options.matchText || cleanSnippet);
  const paragraphs = splitParagraphRanges(content);

  let paragraphIndex = null;
  let paragraphOffset = null;
  if (located.rawOffset !== null) {
    const paragraph = paragraphs.find((item, index) => {
      if (located.rawOffset < item.start || located.rawOffset > item.end) return false;
      paragraphIndex = index;
      paragraphOffset = located.rawOffset - item.start;
      return true;
    });
    if (!paragraph) {
      paragraphIndex = null;
      paragraphOffset = null;
    }
  }

  const resolvedPreviewQuery = normalizeEvidenceText(
    options.previewQuery || located.anchorText || cleanSnippet.slice(0, 24)
  );
  let href = null;
  if (docId) {
    const params = new URLSearchParams({ doc: docId });
    if (resolvedPreviewQuery) params.set('q', resolvedPreviewQuery);
    params.set('from', 'ai');
    href = `/wenku?${params.toString()}`;
  }

  return {
    locator: located.matchMode,
    href,
    paragraphIndex,
    paragraph_index: paragraphIndex,
    paragraphOffset,
    paragraph_offset: paragraphOffset,
    offset: located.rawOffset,
    normalizedOffset: located.normalizedOffset,
    normalized_offset: located.normalizedOffset,
    matchText: located.matchText || cleanSnippet || null,
    match_text: located.matchText || cleanSnippet || null,
    snippet: cleanSnippet || null,
    anchorText: located.anchorText || null,
    anchor_text: located.anchorText || null,
    previewQuery: resolvedPreviewQuery || null,
    preview_query: resolvedPreviewQuery || null,
    chunkIndex: Number.isInteger(options.chunkIndex) ? options.chunkIndex : null,
    chunk_index: Number.isInteger(options.chunkIndex) ? options.chunkIndex : null,
  };
}

export function buildRAGContext(contextDocs, options = {}) {
  const { maxContextLength = 10000, vectorMatches = [], previewQuery = '' } = options;

  let context = '';
  let refIndex = 1;
  const references = [];

  if (vectorMatches.length > 0) {
    const seen = new Set();
    for (const match of vectorMatches) {
      const docId = match.metadata?.doc_id;
      const chunkText = String(match.metadata?.text || '').trim();
      const doc = contextDocs.find(item => item.id === docId);
      const title = doc?.title || match.metadata?.title || '未知';
      const seriesName = doc?.series_name || match.metadata?.series_name || '';
      const citationId = `S${refIndex}`;
      const header = `【${citationId}】出处：${title}${seriesName ? `｜${seriesName}` : ''}\n`;
      if (!docId || !chunkText) continue;
      if (context.length + header.length + chunkText.length + 2 >= maxContextLength) continue;

      const key = `${docId}:${match.metadata?.chunk_index ?? references.length}`;
      if (seen.has(key)) continue;
      seen.add(key);

      context += `${header}${chunkText}\n\n`;
      const location = buildEvidenceLocation(doc, chunkText, {
        docId,
        chunkIndex: match.metadata?.chunk_index,
        matchText: chunkText,
        previewQuery,
      });
      references.push({
        id: citationId,
        citation_id: citationId,
        refIndex,
        ref_index: refIndex,
        doc_id: docId,
        title,
        category: doc?.category || match.metadata?.category || '',
        series_name: seriesName,
        audio_series_id: doc?.audio_series_id || match.metadata?.audio_series_id || '',
        audio_episode_num: doc?.audio_episode_num || null,
        score: typeof match.score === 'number' ? Math.round(match.score * 100) / 100 : null,
        snippet: chunkText,
        quote: chunkText,
        preview_query: location.previewQuery || previewQuery || '',
        location,
        text: chunkText,
      });
      refIndex += 1;
    }
  }

  if (!context) {
    const perDocLimit = Math.floor(maxContextLength / Math.max(contextDocs.length, 1));
    for (const doc of contextDocs) {
      const snippet = String(doc.content || '').slice(0, perDocLimit).trim();
      const title = doc.title || '未知';
      const seriesName = doc.series_name || '';
      const citationId = `S${refIndex}`;
      if (!snippet) continue;
      context += `【${citationId}】出处：${title}${seriesName ? `｜${seriesName}` : ''}\n${snippet}\n\n`;
      const location = buildEvidenceLocation(doc, snippet, {
        docId: doc.id,
        previewQuery,
      });
      references.push({
        id: citationId,
        citation_id: citationId,
        refIndex,
        ref_index: refIndex,
        doc_id: doc.id,
        title,
        category: doc.category || '',
        series_name: seriesName,
        audio_series_id: doc.audio_series_id || '',
        audio_episode_num: doc.audio_episode_num || null,
        score: null,
        snippet,
        quote: snippet,
        preview_query: location.previewQuery || previewQuery || '',
        location,
        text: snippet,
      });
      refIndex += 1;
    }
  }

  return { context, references };
}

// ============================================================
// Build RAG messages (shared by ragAnswer and streaming endpoint)
// ============================================================
export function buildRAGMessages(question, contextDocs, options = {}) {
  const {
    maxContextLength = 10000,
    history = [],
    vectorMatches = [],
  } = options;
  const { context } = buildRAGContext(contextDocs, { maxContextLength, vectorMatches });

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

  const result = await generateChatText(env, messages, {
    maxTokens: 300,
    temperature: 0.2,
    gatewayProfile: GATEWAY_PROFILES.summary,
    scenario: 'summary',
    ctx,
    via: 'summary',
  });

  return result.response;
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

function normalizeAiAskResultText(value, maxLength = 160) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeAiAskResultCount(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeAiAskResultConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, Math.round(numeric * 100) / 100));
}

function roundStat(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function buildRatio(count, total) {
  const normalizedCount = Number(count) || 0;
  const normalizedTotal = Number(total) || 0;
  if (!normalizedTotal) return 0;
  return roundStat(normalizedCount / normalizedTotal, 4);
}

function buildEmptyAiAskResultStats(days = 7, available = true) {
  return {
    available,
    days,
    overview: {
      totalRequests: 0,
      totalResults: 0,
      failedRequests: 0,
      answerCount: 0,
      searchOnlyCount: 0,
      noResultCount: 0,
      answerRate: 0,
      searchOnlyRate: 0,
      noResultRate: 0,
      citationHitRate: 0,
      avgCitationCount: 0,
    },
    modeBreakdown: [],
    downgradeBreakdown: [],
    routeBreakdown: [],
    modelBreakdown: [],
  };
}

// ============================================================
// AI 问答结果日志 — 记录 ask / ask-stream 的结果级观测信息
// ============================================================
export async function logAIAskResult(env, {
  route,
  mode = null,
  downgradeReason = null,
  citationCount = 0,
  citationHit = false,
  claimCount = 0,
  confidence = null,
  provider = null,
  model = null,
  success = true,
  error = null,
  timestamp = Date.now(),
} = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO ai_ask_result_logs (
        route,
        mode,
        downgrade_reason,
        citation_count,
        citation_hit,
        claim_count,
        confidence,
        provider,
        model,
        success,
        error,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      normalizeAiAskResultText(route, 64) || 'unknown',
      normalizeAiAskResultText(mode, 32),
      normalizeAiAskResultText(downgradeReason, 120),
      normalizeAiAskResultCount(citationCount),
      citationHit ? 1 : 0,
      normalizeAiAskResultCount(claimCount),
      normalizeAiAskResultConfidence(confidence),
      normalizeAiAskResultText(provider, 80),
      normalizeAiAskResultText(model, 160),
      success ? 1 : 0,
      normalizeAiAskResultText(error, 200),
      Number.isFinite(timestamp) ? Math.round(timestamp) : Date.now(),
    ).run();
  } catch (e) {
    // 日志写入失败不应影响主流程
    console.warn('[logAIAskResult] Failed to log:', e.message);
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
// AI 问答结果统计 — 按 ask / ask-stream 结果日志汇总
// ============================================================
export async function getAIAskResultStats(env, { days = 7 } = {}) {
  const safeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 7, 90));
  const since = Date.now() - safeDays * 86_400_000;

  try {
    const [overviewRow, modeRowsResult, downgradeRowsResult, routeRowsResult, modelRowsResult] = await Promise.all([
      env.DB.prepare(
        `SELECT
            COUNT(*) as total_requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as total_results,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
            SUM(CASE WHEN success = 1 AND mode = 'answer' THEN 1 ELSE 0 END) as answer_count,
            SUM(CASE WHEN success = 1 AND mode = 'search_only' THEN 1 ELSE 0 END) as search_only_count,
            SUM(CASE WHEN success = 1 AND mode = 'no_result' THEN 1 ELSE 0 END) as no_result_count,
            AVG(CASE WHEN success = 1 THEN citation_hit END) as citation_hit_rate,
            AVG(CASE WHEN success = 1 THEN citation_count END) as avg_citation_count
         FROM ai_ask_result_logs
         WHERE timestamp > ?`
      ).bind(since).first(),
      env.DB.prepare(
        `SELECT
            mode,
            COUNT(*) as total,
            SUM(CASE WHEN citation_hit = 1 THEN 1 ELSE 0 END) as citation_hit_count,
            AVG(citation_count) as avg_citation_count,
            AVG(confidence) as avg_confidence
         FROM ai_ask_result_logs
         WHERE timestamp > ?
           AND success = 1
           AND mode IS NOT NULL
         GROUP BY mode
         ORDER BY total DESC, mode ASC`
      ).bind(since).all(),
      env.DB.prepare(
        `SELECT
            downgrade_reason,
            COUNT(*) as total
         FROM ai_ask_result_logs
         WHERE timestamp > ?
           AND success = 1
           AND downgrade_reason IS NOT NULL
           AND downgrade_reason != ''
         GROUP BY downgrade_reason
         ORDER BY total DESC, downgrade_reason ASC`
      ).bind(since).all(),
      env.DB.prepare(
        `SELECT
            route,
            COUNT(*) as total_requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as total_results,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
            SUM(CASE WHEN success = 1 AND mode = 'answer' THEN 1 ELSE 0 END) as answer_count,
            SUM(CASE WHEN success = 1 AND mode = 'search_only' THEN 1 ELSE 0 END) as search_only_count,
            SUM(CASE WHEN success = 1 AND mode = 'no_result' THEN 1 ELSE 0 END) as no_result_count,
            AVG(CASE WHEN success = 1 THEN citation_hit END) as citation_hit_rate,
            AVG(CASE WHEN success = 1 THEN citation_count END) as avg_citation_count
         FROM ai_ask_result_logs
         WHERE timestamp > ?
         GROUP BY route
         ORDER BY total_requests DESC, route ASC`
      ).bind(since).all(),
      env.DB.prepare(
        `SELECT
            provider,
            model,
            COUNT(*) as total,
            SUM(CASE WHEN mode = 'answer' THEN 1 ELSE 0 END) as answer_count,
            SUM(CASE WHEN mode = 'search_only' THEN 1 ELSE 0 END) as search_only_count,
            SUM(CASE WHEN mode = 'no_result' THEN 1 ELSE 0 END) as no_result_count,
            MAX(timestamp) as last_seen_at
         FROM ai_ask_result_logs
         WHERE timestamp > ?
           AND success = 1
         GROUP BY provider, model
         ORDER BY total DESC, last_seen_at DESC
         LIMIT 12`
      ).bind(since).all(),
    ]);

    const totalRequests = Number(overviewRow?.total_requests) || 0;
    const totalResults = Number(overviewRow?.total_results) || 0;
    const failedRequests = Number(overviewRow?.failed_requests) || 0;
    const answerCount = Number(overviewRow?.answer_count) || 0;
    const searchOnlyCount = Number(overviewRow?.search_only_count) || 0;
    const noResultCount = Number(overviewRow?.no_result_count) || 0;
    const modeRows = Array.isArray(modeRowsResult?.results) ? modeRowsResult.results : [];
    const modeMap = new Map(modeRows.map(row => [String(row.mode || ''), row]));
    const downgradeRows = Array.isArray(downgradeRowsResult?.results) ? downgradeRowsResult.results : [];
    const routeRows = Array.isArray(routeRowsResult?.results) ? routeRowsResult.results : [];
    const modelRows = Array.isArray(modelRowsResult?.results) ? modelRowsResult.results : [];

    return {
      available: true,
      days: safeDays,
      overview: {
        totalRequests,
        totalResults,
        failedRequests,
        answerCount,
        searchOnlyCount,
        noResultCount,
        answerRate: buildRatio(answerCount, totalResults),
        searchOnlyRate: buildRatio(searchOnlyCount, totalResults),
        noResultRate: buildRatio(noResultCount, totalResults),
        citationHitRate: roundStat(overviewRow?.citation_hit_rate, 4),
        avgCitationCount: roundStat(overviewRow?.avg_citation_count, 2),
      },
      modeBreakdown: ['answer', 'search_only', 'no_result']
        .map(mode => {
          const row = modeMap.get(mode);
          const total = Number(row?.total) || 0;
          return {
            mode,
            total,
            share: buildRatio(total, totalResults),
            citationHitRate: buildRatio(Number(row?.citation_hit_count) || 0, total),
            avgCitationCount: roundStat(row?.avg_citation_count, 2),
            avgConfidence: roundStat(row?.avg_confidence, 4),
          };
        })
        .filter(row => row.total > 0 || totalResults === 0),
      downgradeBreakdown: downgradeRows.map(row => ({
        downgradeReason: row.downgrade_reason,
        total: Number(row.total) || 0,
        share: buildRatio(Number(row.total) || 0, totalResults),
      })),
      routeBreakdown: routeRows.map(row => ({
        route: row.route || 'unknown',
        totalRequests: Number(row.total_requests) || 0,
        totalResults: Number(row.total_results) || 0,
        failedRequests: Number(row.failed_requests) || 0,
        answerCount: Number(row.answer_count) || 0,
        searchOnlyCount: Number(row.search_only_count) || 0,
        noResultCount: Number(row.no_result_count) || 0,
        citationHitRate: roundStat(row.citation_hit_rate, 4),
        avgCitationCount: roundStat(row.avg_citation_count, 2),
      })),
      modelBreakdown: modelRows.map(row => ({
        provider: row.provider || null,
        model: row.model || null,
        total: Number(row.total) || 0,
        answerCount: Number(row.answer_count) || 0,
        searchOnlyCount: Number(row.search_only_count) || 0,
        noResultCount: Number(row.no_result_count) || 0,
        lastSeenAt: Number(row.last_seen_at) || null,
      })),
    };
  } catch (err) {
    console.warn('[getAIAskResultStats] Failed to load stats:', err.message);
    return buildEmptyAiAskResultStats(safeDays, false);
  }
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
