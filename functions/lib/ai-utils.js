/**
 * AI 工具模块 — 共享的服务端 AI 功能
 * 供 Pages Functions 路由处理器使用
 */

import {
  buildRagSystemPrompt,
  buildRouterMessages,
  buildEvidenceMessages,
  buildPhase3AnswerControlPrompt,
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

  // 问题路由：短输出、低风险，不缓存
  router: {
    ...GATEWAY_BASE,
    skipCache: true,
  },

  // 证据评估：与当前检索结果强绑定，不缓存
  evidence: {
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

const ROUTER_DECISION = Object.freeze({
  QUOTE_LOOKUP: 'quote_lookup',
  GROUNDED_EXPLANATION: 'grounded_explanation',
  PRACTICE_GUIDANCE: 'practice_guidance',
  UNSUPPORTED: 'unsupported',
});

const PHASE3_RESPONSE_MODE = Object.freeze({
  ANSWER: 'answer',
  SEARCH_ONLY: 'search_only',
  NO_RESULT: 'no_result',
});

const EVIDENCE_STRENGTH = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
});

const EVIDENCE_STRENGTH_RANK = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
});

const QUOTE_LOOKUP_RE = /原文|出处|哪一段|哪一讲|哪一篇|哪部|引文|引用|原话|怎么说|有没有说|开示中说/;
const PRACTICE_GUIDANCE_RE = /怎么做|如何做|该怎么办|怎么修|如何修|怎么念佛|如何念佛|怎么落实|如何安住|怎样对治|日常|功课|实修|下手/;
const UNSUPPORTED_RE = /写代码|编程|javascript|typescript|python|sql|bug|报错|天气|股票|彩票|数学|物理|化学|时政|新闻|翻译成英文|旅游攻略/i;

function normalizeProbability(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, Math.round(numeric * 100) / 100));
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(raw);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // continue
    }
  }

  return null;
}

function normalizeRouteKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === ROUTER_DECISION.QUOTE_LOOKUP || /quote|原文|出处|引文/.test(normalized)) {
    return ROUTER_DECISION.QUOTE_LOOKUP;
  }
  if (normalized === ROUTER_DECISION.PRACTICE_GUIDANCE || /practice|guidance|建议|修行|落实/.test(normalized)) {
    return ROUTER_DECISION.PRACTICE_GUIDANCE;
  }
  if (normalized === ROUTER_DECISION.UNSUPPORTED || /unsupported|超出|无关/.test(normalized)) {
    return ROUTER_DECISION.UNSUPPORTED;
  }
  if (normalized === ROUTER_DECISION.GROUNDED_EXPLANATION || /grounded|explanation|解释|义理/.test(normalized)) {
    return ROUTER_DECISION.GROUNDED_EXPLANATION;
  }
  return null;
}

function normalizeEvidenceStrength(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === EVIDENCE_STRENGTH.HIGH || /high|强/.test(normalized)) return EVIDENCE_STRENGTH.HIGH;
  if (normalized === EVIDENCE_STRENGTH.MEDIUM || /medium|中/.test(normalized)) return EVIDENCE_STRENGTH.MEDIUM;
  if (normalized === EVIDENCE_STRENGTH.LOW || /low|弱/.test(normalized)) return EVIDENCE_STRENGTH.LOW;
  return null;
}

function normalizeRecommendedMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === PHASE3_RESPONSE_MODE.ANSWER || /answer|grounded/.test(normalized)) {
    return PHASE3_RESPONSE_MODE.ANSWER;
  }
  if (normalized === PHASE3_RESPONSE_MODE.NO_RESULT || /no_result|noresult|无结果/.test(normalized)) {
    return PHASE3_RESPONSE_MODE.NO_RESULT;
  }
  if (normalized === PHASE3_RESPONSE_MODE.SEARCH_ONLY || /search_only|searchonly|检索/.test(normalized)) {
    return PHASE3_RESPONSE_MODE.SEARCH_ONLY;
  }
  return null;
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

function buildHeuristicRouteDecision(question) {
  const text = String(question || '').trim();
  const unsupported = UNSUPPORTED_RE.test(text);
  const quoteLookup = QUOTE_LOOKUP_RE.test(text);
  const practiceGuidance = PRACTICE_GUIDANCE_RE.test(text);
  const needsClarification = text.length <= 5
    || (/^(这个|那个|这句|那句|这里|那里)/.test(text) && text.length <= 14);

  if (unsupported) {
    return {
      kind: ROUTER_DECISION.UNSUPPORTED,
      needsClarification,
      confidence: 0.93,
      reason: '问题明显超出净土资料问答范围',
      searchHint: '',
      source: 'heuristic',
      modelInfo: null,
    };
  }

  if (quoteLookup) {
    return {
      kind: ROUTER_DECISION.QUOTE_LOOKUP,
      needsClarification,
      confidence: 0.84,
      reason: '问题更像在索要原文出处或直接引文',
      searchHint: '优先检索直接出处与原文片段',
      source: 'heuristic',
      modelInfo: null,
    };
  }

  if (practiceGuidance) {
    return {
      kind: ROUTER_DECISION.PRACTICE_GUIDANCE,
      needsClarification,
      confidence: 0.8,
      reason: '问题更像在询问修行落实或具体做法',
      searchHint: '优先检索可直接支撑做法建议的开示',
      source: 'heuristic',
      modelInfo: null,
    };
  }

  return {
    kind: ROUTER_DECISION.GROUNDED_EXPLANATION,
    needsClarification,
    confidence: 0.66,
    reason: '默认按依据原文解释处理',
    searchHint: '优先检索能直接支撑问题核心概念的原文',
    source: 'heuristic',
    modelInfo: null,
  };
}

function normalizeModeledRouteDecision(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const kind = normalizeRouteKind(payload.route || payload.kind);
  if (!kind) return null;

  return {
    kind,
    needsClarification: Boolean(payload.needsClarification ?? payload.needs_clarification),
    confidence: normalizeProbability(payload.confidence, 0.5),
    reason: String(payload.reason || '').trim().slice(0, 120),
    searchHint: String(payload.searchHint || payload.search_hint || '').trim().slice(0, 80),
  };
}

function mergeRouteDecisions(heuristic, modeled, modelInfo) {
  if (!modeled) return heuristic;

  let kind = modeled.kind || heuristic.kind;
  if (heuristic.kind === ROUTER_DECISION.UNSUPPORTED && kind !== ROUTER_DECISION.UNSUPPORTED) {
    kind = heuristic.kind;
  } else if (
    kind === ROUTER_DECISION.UNSUPPORTED
    && heuristic.kind !== ROUTER_DECISION.UNSUPPORTED
    && normalizeProbability(modeled.confidence, 0) < 0.85
  ) {
    kind = heuristic.kind;
  }

  return {
    kind,
    needsClarification: Boolean(modeled.needsClarification ?? heuristic.needsClarification),
    confidence: normalizeProbability(
      kind === heuristic.kind
        ? Math.max(heuristic.confidence, modeled.confidence || 0)
        : (modeled.confidence || heuristic.confidence),
      heuristic.confidence
    ),
    reason: modeled.reason || heuristic.reason,
    searchHint: modeled.searchHint || heuristic.searchHint || '',
    source: 'hybrid',
    modelInfo,
  };
}

function buildHeuristicEvidenceAssessment(question, options = {}) {
  const {
    routeDecision = null,
    retrieval = {},
    references = [],
    docs = [],
  } = options;

  const routeKind = routeDecision?.kind || ROUTER_DECISION.GROUNDED_EXPLANATION;
  const retrievalConfidence = Number.isFinite(retrieval?.confidence) ? retrieval.confidence : 0;
  const topScore = Number.isFinite(retrieval?.topScore) ? retrieval.topScore : 0;
  const secondScore = Number.isFinite(retrieval?.secondScore) ? retrieval.secondScore : 0;
  const referenceCount = Array.isArray(references) ? references.length : 0;
  const signals = {
    routeKind,
    retrievalConfidence: normalizeProbability(retrievalConfidence, 0),
    topScore: normalizeProbability(topScore, 0),
    secondScore: normalizeProbability(secondScore, 0),
    referenceCount,
    docCount: Array.isArray(docs) ? docs.length : 0,
    strongMatchCount: Number(retrieval?.strongMatchCount || 0),
    supportMatchCount: Number(retrieval?.supportMatchCount || 0),
    uniqueMatchedDocCount: Number(retrieval?.uniqueMatchedDocCount || 0),
  };

  if (!signals.docCount) {
    return {
      strength: EVIDENCE_STRENGTH.LOW,
      recommendedMode: PHASE3_RESPONSE_MODE.NO_RESULT,
      confidence: 0,
      reason: '未检索到可用文档',
      reasonCode: 'no_documents',
      missing: '缺少相关文库原文',
      source: 'heuristic',
      signals,
      modelInfo: null,
    };
  }

  if (routeKind === ROUTER_DECISION.UNSUPPORTED) {
    return {
      strength: EVIDENCE_STRENGTH.LOW,
      recommendedMode: PHASE3_RESPONSE_MODE.SEARCH_ONLY,
      confidence: normalizeProbability(Math.min(retrievalConfidence || 0.35, 0.45), 0.35),
      reason: '问题超出产品资料边界，不进入 grounded answer',
      reasonCode: 'unsupported_request',
      missing: '缺少与净土资料直接相关的提问边界',
      source: 'heuristic',
      signals,
      modelInfo: null,
    };
  }

  let strength = EVIDENCE_STRENGTH.LOW;
  let recommendedMode = PHASE3_RESPONSE_MODE.SEARCH_ONLY;
  let reason = '证据偏弱，先返回检索结果更稳妥';

  if (retrievalConfidence >= 0.82 && topScore >= 0.72 && referenceCount >= 2) {
    strength = EVIDENCE_STRENGTH.HIGH;
    recommendedMode = PHASE3_RESPONSE_MODE.ANSWER;
    reason = '已有多条较强证据，可进入 grounded answer';
  } else if (retrievalConfidence >= 0.63 && topScore >= 0.58 && referenceCount >= 1) {
    strength = EVIDENCE_STRENGTH.MEDIUM;
    reason = '已有部分相关证据，但仍需谨慎';
  }

  if (
    routeKind === ROUTER_DECISION.QUOTE_LOOKUP
    && strength === EVIDENCE_STRENGTH.MEDIUM
    && topScore >= 0.68
    && referenceCount >= 1
  ) {
    recommendedMode = PHASE3_RESPONSE_MODE.ANSWER;
    reason = '用户主要在找出处，单条强相关证据可支持简短作答';
  }

  if (
    routeKind === ROUTER_DECISION.PRACTICE_GUIDANCE
    && recommendedMode === PHASE3_RESPONSE_MODE.ANSWER
    && (referenceCount < 2 || retrievalConfidence < 0.86)
  ) {
    strength = EVIDENCE_STRENGTH.MEDIUM;
    recommendedMode = PHASE3_RESPONSE_MODE.SEARCH_ONLY;
    reason = '修行建议需要更高证据门槛，当前先返回原文更稳妥';
  }

  return {
    strength,
    recommendedMode,
    confidence: normalizeProbability(
      Math.max(
        retrievalConfidence,
        strength === EVIDENCE_STRENGTH.HIGH ? 0.84 : (strength === EVIDENCE_STRENGTH.MEDIUM ? 0.64 : 0.34)
      ),
      retrievalConfidence
    ),
    reason,
    reasonCode: recommendedMode === PHASE3_RESPONSE_MODE.ANSWER ? null : 'insufficient_evidence',
    missing: strength === EVIDENCE_STRENGTH.HIGH
      ? ''
      : (routeKind === ROUTER_DECISION.PRACTICE_GUIDANCE
        ? '缺少足够直接支撑做法建议的原文'
        : '还缺少更直接、更多条的原文支撑'),
    source: 'heuristic',
    signals,
    modelInfo: null,
  };
}

function normalizeModeledEvidenceAssessment(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const strength = normalizeEvidenceStrength(payload.strength || payload.evidenceStrength || payload.evidence_strength);
  const recommendedMode = normalizeRecommendedMode(payload.recommendedMode || payload.recommended_mode);
  if (!strength && !recommendedMode) return null;

  return {
    strength: strength || EVIDENCE_STRENGTH.MEDIUM,
    recommendedMode: recommendedMode || PHASE3_RESPONSE_MODE.SEARCH_ONLY,
    confidence: normalizeProbability(payload.confidence, 0.5),
    reason: String(payload.reason || '').trim().slice(0, 120),
    missing: String(payload.missing || '').trim().slice(0, 120),
  };
}

function mergeEvidenceAssessments(heuristic, modeled, modelInfo) {
  if (!modeled) return heuristic;

  const heuristicRank = EVIDENCE_STRENGTH_RANK[heuristic.strength] ?? 0;
  const modeledRank = EVIDENCE_STRENGTH_RANK[modeled.strength] ?? heuristicRank;
  const strength = modeledRank < heuristicRank ? modeled.strength : heuristic.strength;

  let recommendedMode = heuristic.recommendedMode;
  if (modeled.recommendedMode === PHASE3_RESPONSE_MODE.NO_RESULT) {
    recommendedMode = PHASE3_RESPONSE_MODE.NO_RESULT;
  } else if (
    heuristic.recommendedMode === PHASE3_RESPONSE_MODE.ANSWER
    && modeled.recommendedMode
    && modeled.recommendedMode !== PHASE3_RESPONSE_MODE.ANSWER
  ) {
    recommendedMode = modeled.recommendedMode;
  }

  if (strength === EVIDENCE_STRENGTH.LOW && recommendedMode === PHASE3_RESPONSE_MODE.ANSWER) {
    recommendedMode = PHASE3_RESPONSE_MODE.SEARCH_ONLY;
  }

  return {
    strength,
    recommendedMode,
    confidence: normalizeProbability(
      recommendedMode === heuristic.recommendedMode
        ? Math.max(heuristic.confidence, modeled.confidence || 0)
        : Math.min(heuristic.confidence, modeled.confidence || heuristic.confidence),
      heuristic.confidence
    ),
    reason: modeled.reason || heuristic.reason,
    reasonCode: recommendedMode === PHASE3_RESPONSE_MODE.NO_RESULT
      ? 'no_documents'
      : (recommendedMode === heuristic.recommendedMode ? heuristic.reasonCode : 'insufficient_evidence'),
    missing: modeled.missing || heuristic.missing || '',
    source: 'hybrid',
    signals: { ...heuristic.signals },
    modelInfo,
  };
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

export async function routeQuestion(env, question, options = {}) {
  const heuristic = buildHeuristicRouteDecision(question);
  if (!isEnvFlagEnabled(env, 'AI_PHASE3_ROUTER_ENABLED', true) || !getPreferredChatProvider(env)) {
    return heuristic;
  }

  try {
    const result = await generateChatText(env, buildRouterMessages(question, {
      history: options.history,
    }), {
      maxTokens: 120,
      temperature: 0,
      gatewayProfile: GATEWAY_PROFILES.router,
      scenario: 'router',
      ctx: options.ctx || null,
      via: 'router',
    });
    const modeled = normalizeModeledRouteDecision(extractJsonObject(result.response));
    return mergeRouteDecisions(heuristic, modeled, result.modelInfo);
  } catch (err) {
    console.warn('[AI] routeQuestion fallback to heuristic:', err.message);
    return heuristic;
  }
}

export async function assessEvidence(env, question, options = {}) {
  const heuristic = buildHeuristicEvidenceAssessment(question, options);
  if (
    !isEnvFlagEnabled(env, 'AI_PHASE3_EVIDENCE_ENABLED', true)
    || !getPreferredChatProvider(env)
    || heuristic.recommendedMode === PHASE3_RESPONSE_MODE.NO_RESULT
  ) {
    return heuristic;
  }

  try {
    const result = await generateChatText(env, buildEvidenceMessages(question, {
      routeDecision: options.routeDecision,
      references: options.references,
      retrieval: options.retrieval,
    }), {
      maxTokens: 160,
      temperature: 0,
      gatewayProfile: GATEWAY_PROFILES.evidence,
      scenario: 'evidence',
      ctx: options.ctx || null,
      via: 'evidence',
    });
    const modeled = normalizeModeledEvidenceAssessment(extractJsonObject(result.response));
    return mergeEvidenceAssessments(heuristic, modeled, result.modelInfo);
  } catch (err) {
    console.warn('[AI] assessEvidence fallback to heuristic:', err.message);
    return heuristic;
  }
}

// ============================================================
// RAG 问答 — 检索增强生成
// ============================================================
export async function ragAnswer(env, question, contextDocs, options = {}) {
  const {
    history = [],
    vectorMatches = [],
    ctx = null,
    routeDecision = null,
    evidenceAssessment = null,
  } = options;
  const messages = buildRAGMessages(question, contextDocs, {
    history,
    vectorMatches,
    routeDecision,
    evidenceAssessment,
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

export function buildRAGContext(contextDocs, options = {}) {
  const { maxContextLength = 10000, vectorMatches = [] } = options;

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
      references.push({
        id: citationId,
        refIndex,
        doc_id: docId,
        title,
        category: doc?.category || match.metadata?.category || '',
        series_name: seriesName,
        audio_series_id: doc?.audio_series_id || match.metadata?.audio_series_id || '',
        audio_episode_num: doc?.audio_episode_num || null,
        score: typeof match.score === 'number' ? Math.round(match.score * 100) / 100 : null,
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
      references.push({
        id: citationId,
        refIndex,
        doc_id: doc.id,
        title,
        category: doc.category || '',
        series_name: seriesName,
        audio_series_id: doc.audio_series_id || '',
        audio_episode_num: doc.audio_episode_num || null,
        score: null,
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
    routeDecision = null,
    evidenceAssessment = null,
  } = options;
  const { context } = buildRAGContext(contextDocs, { maxContextLength, vectorMatches });

  const messages = [{ role: 'system', content: buildRagSystemPrompt(context) }];
  if (routeDecision || evidenceAssessment) {
    messages.push({
      role: 'system',
      content: buildPhase3AnswerControlPrompt(routeDecision, evidenceAssessment),
    });
  }
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
