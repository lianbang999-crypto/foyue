import {
  AI_CONFIG,
  GATEWAY_PROFILES,
  buildRAGMessages,
  consumeOpenAICompatibleStream,
  generateEmbeddings,
  getPreferredChatProvider,
  isUnsupportedQuestion,
  semanticSearch,
  retrieveDocuments,
  rerankResults,
  expandContextFromDocs,
  ragAnswer,
  buildRAGContext,
  generateSummary,
  checkRateLimit,
  cleanupRateLimits,
  extractAIResponse,
  runAIWithLogging,
  resolveAIModel,
  streamExternalLLM,
} from './ai-utils.js';
import {
  AI_NO_RESULT_ANSWER,
  AI_PROMPT_METADATA,
  AI_RESPONSE_DISCLAIMER,
  AI_SEARCH_ONLY_ANSWER,
  AI_UNSUPPORTED_ANSWER,
  STOP_WORDS_RE,
  buildRecommendMessages,
  buildRewriteSuggestions,
  buildSourceFollowUps,
  buildFallbackFollowUps,
  normalizeAiAnswerContract,
} from './ai-prompts.js';
import { getTodayBeijing } from './crypto-utils.js';

const AI_RESPONSE_MODE = Object.freeze({
  ANSWER: 'answer',
  SEARCH_ONLY: 'search_only',
  NO_RESULT: 'no_result',
});

function roundConfidence(value) {
  const normalized = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, Math.round(normalized * 100) / 100));
}

function buildPromptVersionInfo() {
  return { ...AI_PROMPT_METADATA };
}

function buildIdleModelInfo(stage = 'retrieval_only') {
  return {
    provider: 'none',
    model: null,
    used: false,
    stage,
  };
}

function buildStreamModelInfo(provider) {
  if (!provider) return buildIdleModelInfo('stream_unavailable');
  return {
    provider: provider.provider,
    model: provider.model,
    used: true,
    stage: provider.stage || 'primary',
    via: 'stream',
    supportsNativeStream: provider.supportsNativeStream === true,
  };
}

function hasAnswerGenerationCapability(env) {
  return !!(env?.AI?.run || env?.EXTERNAL_LLM_KEY || env?.GROQ_API_KEY);
}


function buildSourceList(matches, docs, keywords = [], options = {}) {
  const { includeKnowledge = true } = options;
  const seenDocIds = new Set();
  const sources = [];
  for (const match of matches) {
    const docId = match.metadata?.doc_id || '';
    if (!includeKnowledge && match.metadata?.category === 'knowledge') continue;
    if (!docId || seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);
    const doc = docs.find(item => item.id === docId);
    // 优先使用关键词定位的摘要，回退到 chunk 前 300 字
    const chunkText = (match.metadata?.text || '').replace(/\s+/g, ' ').trim();
    const snippet = keywords.length > 0
      ? buildKeywordSnippet(chunkText, keywords) || chunkText.slice(0, 300)
      : chunkText.slice(0, 300);
    sources.push({
      title: doc?.title || match.metadata.title || '',
      doc_id: docId,
      score: typeof match.score === 'number' ? Math.round(match.score * 100) / 100 : null,
      category: doc?.category || match.metadata.category || '',
      series_name: doc?.series_name || match.metadata.series_name || '',
      audio_series_id: doc?.audio_series_id || match.metadata.audio_series_id || '',
      audio_episode_num: doc?.audio_episode_num || null,
      snippet,
    });
    if (sources.length >= 3) break;
  }
  return sources;
}

function buildDocFallbackSources(docs, keywords = []) {
  return (docs || [])
    .slice(0, 3)
    .map(doc => {
      const content = String(doc.content || '').replace(/\s+/g, ' ').trim();
      return {
        title: doc.title || '',
        doc_id: doc.id,
        score: null,
        category: doc.category || '',
        series_name: doc.series_name || '',
        audio_series_id: doc.audio_series_id || '',
        audio_episode_num: doc.audio_episode_num || null,
        snippet: keywords.length > 0
          ? buildKeywordSnippet(content, keywords) || content.slice(0, 300)
          : content.slice(0, 300),
      };
    })
    .filter(item => item.doc_id && item.snippet);
}

function buildSearchSourceList(matches, docs, keywords = []) {
  const merged = [];
  const seenDocIds = new Set();
  const primary = buildSourceList(matches, docs, keywords, { includeKnowledge: false });
  const secondary = primary.length ? primary : buildSourceList(matches, docs, keywords);

  for (const source of secondary) {
    if (!source.doc_id || seenDocIds.has(source.doc_id)) continue;
    seenDocIds.add(source.doc_id);
    merged.push(source);
    if (merged.length >= 3) return merged;
  }

  for (const source of buildDocFallbackSources(docs, keywords)) {
    if (!source.doc_id || seenDocIds.has(source.doc_id)) continue;
    seenDocIds.add(source.doc_id);
    merged.push(source);
    if (merged.length >= 3) break;
  }

  return merged;
}

function buildAiAnswerPayload(rawText, question, options = {}) {
  const {
    mode = AI_RESPONSE_MODE.ANSWER,
    sources = [],
    forceNoResult = false,
    docs = [],
    confidence = mode === AI_RESPONSE_MODE.NO_RESULT ? 0 : 0.75,
    rewriteSuggestions = [],
    downgradeReason = null,
    modelInfo = buildIdleModelInfo(mode === AI_RESPONSE_MODE.NO_RESULT ? 'retrieval_only' : 'not_invoked'),
  } = options;

  const normalized = mode === AI_RESPONSE_MODE.SEARCH_ONLY
    ? {
      answer: String(rawText || AI_SEARCH_ONLY_ANSWER).trim(),
      followUps: [],
    }
    : normalizeAiAnswerContract(rawText, question, {
      forceNoResult: mode === AI_RESPONSE_MODE.NO_RESULT || forceNoResult,
      docs,
    });

  return {
    contractVersion: AI_PROMPT_METADATA.contract,
    mode,
    confidence: mode === AI_RESPONSE_MODE.NO_RESULT ? 0 : roundConfidence(confidence),
    rewriteSuggestions,
    answer: normalized.answer,
    followUps: normalized.followUps,
    sources,
    citations: [],
    claimMap: [],
    uncertainty: null,
    route: null,
    evidence: null,
    downgradeReason,
    promptVersion: buildPromptVersionInfo(),
    modelInfo: { ...modelInfo },
    disclaimer: AI_RESPONSE_DISCLAIMER,
  };
}

function buildSearchOnlyPayload(question, options = {}) {
  const {
    matches = [],
    docs = [],
    keywords = [],
    confidence = 0.52,
    sources = [],
    rewriteSuggestions = [],
    answer = AI_SEARCH_ONLY_ANSWER,
    downgradeReason = 'insufficient_evidence',
    modelInfo = buildIdleModelInfo('retrieval_only'),
  } = options;
  const finalSources = Array.isArray(sources) && sources.length > 0
    ? sources.slice(0, 3)
    : buildSearchSourceList(matches, docs, keywords);

  return buildAiAnswerPayload(answer, question, {
    mode: AI_RESPONSE_MODE.SEARCH_ONLY,
    sources: finalSources,
    docs,
    confidence: Math.min(roundConfidence(confidence), 0.74),
    rewriteSuggestions: buildRewriteSuggestions(question, { keywords, docs }),
    downgradeReason,
    modelInfo,
  });
}

function buildNoResultPayload(question, options = {}) {
  const {
    keywords = [],
    docs = [],
    rewriteSuggestions = [],
    modelInfo = buildIdleModelInfo('retrieval_only'),
  } = options;
  return buildAiAnswerPayload(AI_NO_RESULT_ANSWER, question, {
    mode: AI_RESPONSE_MODE.NO_RESULT,
    sources: [],
    docs,
    confidence: 0,
    rewriteSuggestions: buildRewriteSuggestions(question, { keywords, docs }),
    downgradeReason: 'no_documents',
    modelInfo,
  });
}

function splitAnswerIntoChunks(answer, chunkSize = 48) {
  const text = String(answer || '');
  if (!text) return [];

  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + chunkSize, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('。', end),
        text.lastIndexOf('！', end),
        text.lastIndexOf('？', end),
        text.lastIndexOf('；', end),
        text.lastIndexOf('\n', end)
      );
      if (boundary >= cursor + 12) end = boundary + 1;
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

function normalizeSummaryKey(documentId) {
  try {
    return decodeURIComponent(String(documentId || '').trim());
  } catch {
    return String(documentId || '').trim();
  }
}

function buildSeriesSummaryContent(seriesName, documents) {
  const outline = documents
    .slice(0, 12)
    .map((doc, index) => `${index + 1}. ${doc.title || `第${doc.episode_num || index + 1}讲`}`)
    .join(' / ');

  const parts = [];
  if (seriesName) parts.push(`书名：${seriesName}`);
  if (outline) parts.push(`目录概览：${outline}`);

  let totalLength = parts.join('\n\n').length;
  for (const [index, doc] of documents.slice(0, 8).entries()) {
    const content = String(doc.content || '').replace(/\s+/g, ' ').trim();
    if (!content) continue;
    const chapterNum = doc.episode_num || index + 1;
    const block = `【第${chapterNum}讲 ${doc.title || ''}】\n${content.slice(0, 700)}`;
    if (totalLength + block.length > 5600) break;
    parts.push(block);
    totalLength += block.length + 2;
  }

  return parts.join('\n\n');
}

// ============================================================
// 从 ai_qa_pairs 知识库检索精华问答对，作为高优先级资料注入 RAG 上下文
// brain-cron-worker 每日提炼后存入此表，回答质量随时间持续提升
// ============================================================
async function loadKnowledgeQAPseudoMatches(env, question, keywords, seriesId) {
  if (!env?.DB) return [];
  try {
    const kw = (keywords[0] && keywords[0].length >= 2) ? keywords[0] : question.slice(0, 15);
    const like = `%${kw}%`;
    let rows;
    if (seriesId) {
      const { results } = await env.DB.prepare(
        `SELECT q.id, q.question, q.answer_quote, q.importance, q.doc_id,
                d.title, d.series_name, d.audio_series_id
         FROM ai_qa_pairs q
         LEFT JOIN documents d ON q.doc_id = d.id
         WHERE d.audio_series_id = ?
           AND (q.question LIKE ? OR q.answer_quote LIKE ?)
         ORDER BY CASE q.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
         LIMIT 3`
      ).bind(seriesId, like, like).all();
      rows = results;
    } else {
      const { results } = await env.DB.prepare(
        `SELECT q.id, q.question, q.answer_quote, q.importance, q.doc_id,
                d.title, d.series_name, d.audio_series_id
         FROM ai_qa_pairs q
         LEFT JOIN documents d ON q.doc_id = d.id
         WHERE q.question LIKE ? OR q.answer_quote LIKE ?
         ORDER BY CASE q.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
         LIMIT 3`
      ).bind(like, like).all();
      rows = results;
    }
    return (rows || [])
      .filter(item => item.doc_id && item.answer_quote)
      .map(item => ({
        score: item.importance === 'high' ? 0.88 : 0.74,
        metadata: {
          doc_id: item.doc_id,
          title: item.title || '法音文库',
          text: `【精华解析】\n问：${item.question}\n\n${item.answer_quote}`,
          series_name: item.series_name || '',
          category: 'knowledge',
          audio_series_id: item.audio_series_id || '',
        },
      }));
  } catch (err) {
    console.warn('Knowledge QA lookup failed:', err.message);
    return [];
  }
}

async function keywordSearchDocs(env, query, { seriesId = null, limit = 10 } = {}) {
  const keyword = String(query || '').trim().slice(0, 20);
  if (!keyword) return [];

  if (seriesId) {
    const like = `%${keyword}%`;
    const { results } = await env.DB.prepare(
      `SELECT id, title, content, category, series_name, audio_series_id
       FROM documents
       WHERE audio_series_id = ? AND content IS NOT NULL AND (title LIKE ? OR content LIKE ?)
       ORDER BY audio_episode_num ASC
       LIMIT ?`
    ).bind(seriesId, like, like, limit).all();
    return results || [];
  }

  const like = `%${keyword}%`;
  const { results } = await env.DB.prepare(
    `SELECT id, title, content, category, series_name, audio_series_id
     FROM documents
     WHERE content IS NOT NULL AND (title LIKE ? OR content LIKE ?)
     LIMIT ?`
  ).bind(like, like, limit).all();
  return results || [];
}

function mapKeywordDocsToSearchResults(docs) {
  return (docs || []).map(doc => ({
    doc_id: doc.id,
    title: doc.title || '',
    snippet: (doc.content || '').slice(0, 200).trim() + ((doc.content || '').length > 200 ? '...' : ''),
    score: null,
    series_name: doc.series_name || '',
    category: doc.category || '',
    audio_series_id: doc.audio_series_id || '',
  }));
}

function extractSearchKeywords(question) {
  return String(question || '')
    .replace(STOP_WORDS_RE, ' ')
    .split(/[\s，。！？、；：,.!?()[\]【】《》“”"'‘’/\\|+-]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
    .slice(0, 4);
}

function buildKeywordSnippet(content, keywords) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const hitIndex = keywords.reduce((best, keyword) => {
    const index = text.indexOf(keyword);
    if (index === -1) return best;
    if (best === -1) return index;
    return Math.min(best, index);
  }, -1);

  if (hitIndex === -1) return text.slice(0, 300);

  // 扩大窗口，保留更完整的段落
  let start = Math.max(0, hitIndex - 120);
  let end = Math.min(text.length, hitIndex + 200);

  // 向前找句子边界（句号、问号、感叹号之后）
  if (start > 0) {
    const sentStart = text.lastIndexOf('。', start);
    const sentStart2 = text.lastIndexOf('？', start);
    const sentStart3 = text.lastIndexOf('！', start);
    const boundary = Math.max(sentStart, sentStart2, sentStart3);
    if (boundary > start - 60) start = boundary + 1;
  }

  // 向后找句子边界
  if (end < text.length) {
    const sentEnd = text.indexOf('。', end);
    const sentEnd2 = text.indexOf('？', end);
    const sentEnd3 = text.indexOf('！', end);
    const candidates = [sentEnd, sentEnd2, sentEnd3].filter(i => i !== -1 && i < end + 60);
    if (candidates.length) end = Math.min(...candidates) + 1;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

function mergeDocs(primaryDocs, extraDocs) {
  const merged = [...primaryDocs];
  for (const doc of extraDocs) {
    if (!doc?.id || merged.some(item => item.id === doc.id)) continue;
    merged.push(doc);
  }
  return merged;
}

function appendPseudoMatch(matches, doc, snippet, score = 0.58) {
  if (!doc?.id || !snippet) return matches;
  if (matches.some(item => item.metadata?.doc_id === doc.id)) return matches;
  return [
    ...matches,
    {
      score,
      metadata: {
        doc_id: doc.id,
        title: doc.title || '',
        text: snippet,
        category: doc.category || '',
        series_name: doc.series_name || '',
      },
    },
  ];
}

function parseAskInput(body) {
  const { question, series_id, episode_id, episode_num, history } = body || {};
  const normalizedQuestion = typeof question === 'string' ? question.trim() : '';
  if (!normalizedQuestion || normalizedQuestion.length > 500) {
    return { error: '问题不能为空且不超过500字' };
  }

  return {
    question: normalizedQuestion,
    seriesId: series_id,
    episodeNum: Number.parseInt(episode_num ?? episode_id, 10),
    history: Array.isArray(history) ? history : [],
  };
}

async function loadAiDocs(env, question, seriesId, episodeNum, ctx) {
  const filter = {};
  if (seriesId && typeof seriesId === 'string') filter.audio_series_id = seriesId.slice(0, 100);
  const keywords = extractSearchKeywords(question);

  let matches = [];
  try {
    matches = await semanticSearch(env, question, {
      topK: 6,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      ctx,
    });
    // 系列内语义搜索无结果时，退避到全局搜索
    if (!matches.length && Object.keys(filter).length > 0) {
      matches = await semanticSearch(env, question, { topK: 6, ctx });
    }
  } catch (err) {
    console.warn('Vectorize search failed, falling back to D1:', err.message);
  }

  let docs = await retrieveDocuments(env, matches);
  let exactDoc = null;

  if (seriesId && Number.isInteger(episodeNum) && episodeNum > 0) {
    exactDoc = await env.DB.prepare(
      `SELECT id, title, content, category, series_name, audio_series_id, audio_episode_num
       FROM documents
       WHERE audio_series_id = ? AND audio_episode_num = ? AND content IS NOT NULL AND content != ''
       LIMIT 1`
    ).bind(seriesId, episodeNum).first();
    if (exactDoc && !docs.some(doc => doc.id === exactDoc.id)) {
      docs = [exactDoc, ...docs];
    }
  }

  let keywordDocs = [];
  try {
    keywordDocs = await keywordSearchDocs(env, question, { seriesId, limit: seriesId ? 8 : 5 });
    // 系列内关键词搜索无结果时，退避到全局搜索
    if (!keywordDocs.length && seriesId) {
      keywordDocs = await keywordSearchDocs(env, question, { seriesId: null, limit: 5 });
    }
  } catch (err) {
    console.warn('Keyword search supplement failed:', err.message);
  }

  docs = mergeDocs(docs, keywordDocs);

  if (exactDoc) {
    matches = appendPseudoMatch(matches, exactDoc, buildKeywordSnippet(exactDoc.content, keywords), 0.78);
  }

  for (const doc of keywordDocs.slice(0, 3)) {
    matches = appendPseudoMatch(matches, doc, buildKeywordSnippet(doc.content, keywords), 0.56);
  }

  if (matches.length >= 2) {
    matches = await rerankResults(env, question, matches, { topK: 6, ctx });
  }

  if (matches.length > 0 && docs.length > 0) {
    matches = expandContextFromDocs(matches, docs);
  }

  // 知识库精华 Q&A：brain 每日提炼的高质量问答对，置于最前以优先被引用
  try {
    const knowledgeMatches = await loadKnowledgeQAPseudoMatches(env, question, keywords, seriesId);
    if (knowledgeMatches.length > 0) {
      matches = [...knowledgeMatches, ...matches];
    }
  } catch (err) {
    console.warn('Knowledge QA integration failed:', err.message);
  }

  if (!docs.length) {
    try {
      // 第一轮退避：如果有 seriesId，先在该系列内搜索
      if (seriesId) {
        const seriesFallback = await env.DB.prepare(
          `SELECT id, title, content, category, series_name FROM documents
           WHERE audio_series_id = ? AND content IS NOT NULL
           ORDER BY audio_episode_num ASC LIMIT 5`
        ).bind(seriesId).all();
        if (seriesFallback.results?.length > 0) docs = seriesFallback.results;
      }

      // 第二轮退避：系列内无结果（或无 seriesId），用关键词做全局搜索
      if (!docs.length) {
        const kws = extractSearchKeywords(question).filter(k => k.length >= 2).slice(0, 3);
        if (kws.length > 0) {
          const conditions = kws.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
          const params = kws.flatMap(k => [`%${k}%`, `%${k}%`]);
          const kwFallback = await env.DB.prepare(
            `SELECT id, title, content, category, series_name FROM documents
             WHERE content IS NOT NULL AND (${conditions})
             LIMIT 5`
          ).bind(...params).all();
          if (kwFallback.results?.length > 0) docs = kwFallback.results;
        }
      }
    } catch (err) {
      console.warn('D1 fallback search failed:', err.message);
    }
  }

  return { matches, docs };
}

export async function handleAiAsk(env, request, cors, ctx, json) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_ask');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

  const askInput = parseAskInput(body);
  if (askInput.error) return json({ error: askInput.error }, cors, 400);

  // 不支持的问题直接返回
  if (isUnsupportedQuestion(askInput.question)) {
    return json(buildAiAnswerPayload(AI_UNSUPPORTED_ANSWER, askInput.question, {
      mode: AI_RESPONSE_MODE.NO_RESULT,
      confidence: 0,
      downgradeReason: 'unsupported_question',
      modelInfo: buildIdleModelInfo('retrieval_only'),
    }), cors, 200, 'no-store');
  }

  const keywords = extractSearchKeywords(askInput.question);
  const { matches, docs } = await loadAiDocs(env, askInput.question, askInput.seriesId, askInput.episodeNum, ctx);

  // Fast path: 高匹配知识库 QA（score >= 0.85），0 次 LLM 调用
  const topMatch = matches[0];
  if (
    topMatch?.score >= 0.85
    && topMatch?.metadata?.category === 'knowledge'
    && topMatch?.metadata?.text
  ) {
    const text = topMatch.metadata.text;
    const answerStart = text.indexOf('\n\n');
    const precompiledAnswer = answerStart >= 0 ? text.slice(answerStart + 2).trim() : text.trim();
    if (precompiledAnswer) {
      const sources = buildSearchSourceList(matches, docs, keywords);
      return json(buildAiAnswerPayload(precompiledAnswer, askInput.question, {
        mode: AI_RESPONSE_MODE.ANSWER,
        sources,
        docs,
        confidence: 0.92,
        rewriteSuggestions: buildRewriteSuggestions(askInput.question, { keywords, docs }),
        modelInfo: buildIdleModelInfo('knowledge_qa_direct'),
      }), cors, 200, 'no-store');
    }
  }

  // 无文档 → 无结果
  if (!docs.length) {
    return json(buildNoResultPayload(askInput.question, { keywords, docs }), cors, 200, 'no-store');
  }

  // 需要 LLM 但不可用 → 搜索模式
  if (!hasAnswerGenerationCapability(env)) {
    return json(buildSearchOnlyPayload(askInput.question, {
      matches, docs, keywords,
      downgradeReason: 'answer_generation_unavailable',
      modelInfo: buildIdleModelInfo('answer_generation_unavailable'),
    }), cors, 200, 'no-store');
  }

  // RAG path: 1 次 LLM 调用
  let result;
  try {
    result = await ragAnswer(env, askInput.question, docs, {
      history: askInput.history,
      vectorMatches: matches,
      ctx,
    });
  } catch (err) {
    console.error('RAG answer failed:', err.message);
    return json(buildSearchOnlyPayload(askInput.question, {
      matches, docs, keywords,
      downgradeReason: 'answer_generation_failed',
      modelInfo: buildIdleModelInfo('answer_generation_failed'),
    }), cors, 200, 'no-store');
  }

  const answer = result?.response?.trim();
  if (!answer) {
    return json(buildSearchOnlyPayload(askInput.question, {
      matches, docs, keywords,
      downgradeReason: 'answer_generation_empty',
      modelInfo: result?.modelInfo || buildIdleModelInfo('answer_generation_empty'),
    }), cors, 200, 'no-store');
  }

  const sources = buildSearchSourceList(matches, docs, keywords);
  return json(buildAiAnswerPayload(answer, askInput.question, {
    mode: AI_RESPONSE_MODE.ANSWER,
    sources,
    docs,
    confidence: 0.82,
    rewriteSuggestions: buildRewriteSuggestions(askInput.question, { keywords, docs }),
    modelInfo: result?.modelInfo || buildIdleModelInfo('not_invoked'),
  }), cors, 200, 'no-store');
}

function buildAskStreamDoneResponse(payload, cors) {
  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': retrieving\n\n'));

      for (const token of splitAnswerIntoChunks(payload?.answer)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
      }

      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(payload)}\n\n`));
      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      ...cors,
    },
  });
}

export async function handleAiAskStream(env, request, cors, ctx, json) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_ask');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

  const askInput = parseAskInput(body);
  if (askInput.error) return json({ error: askInput.error }, cors, 400);

  // 不支持的问题
  if (isUnsupportedQuestion(askInput.question)) {
    return buildAskStreamDoneResponse(buildAiAnswerPayload(AI_UNSUPPORTED_ANSWER, askInput.question, {
      mode: AI_RESPONSE_MODE.NO_RESULT,
      confidence: 0,
      downgradeReason: 'unsupported_question',
      modelInfo: buildIdleModelInfo('retrieval_only'),
    }), cors);
  }

  const keywords = extractSearchKeywords(askInput.question);
  const { matches, docs } = await loadAiDocs(env, askInput.question, askInput.seriesId, askInput.episodeNum, ctx);

  // Fast path: 知识库直答
  const topMatch = matches[0];
  if (
    topMatch?.score >= 0.85
    && topMatch?.metadata?.category === 'knowledge'
    && topMatch?.metadata?.text
  ) {
    const text = topMatch.metadata.text;
    const answerStart = text.indexOf('\n\n');
    const precompiledAnswer = answerStart >= 0 ? text.slice(answerStart + 2).trim() : text.trim();
    if (precompiledAnswer) {
      const sources = buildSearchSourceList(matches, docs, keywords);
      return buildAskStreamDoneResponse(buildAiAnswerPayload(precompiledAnswer, askInput.question, {
        mode: AI_RESPONSE_MODE.ANSWER,
        sources,
        docs,
        confidence: 0.92,
        rewriteSuggestions: buildRewriteSuggestions(askInput.question, { keywords, docs }),
        modelInfo: buildIdleModelInfo('knowledge_qa_direct'),
      }), cors);
    }
  }

  // 无文档
  if (!docs.length) {
    return buildAskStreamDoneResponse(buildNoResultPayload(askInput.question, { keywords, docs }), cors);
  }

  // 无 LLM 能力
  if (!hasAnswerGenerationCapability(env)) {
    return buildAskStreamDoneResponse(buildSearchOnlyPayload(askInput.question, {
      matches, docs, keywords,
      downgradeReason: 'answer_generation_unavailable',
      modelInfo: buildIdleModelInfo('answer_generation_unavailable'),
    }), cors);
  }

  // 流式 RAG
  const preferredProvider = getPreferredChatProvider(env);
  const hasTrueStreamProvider = preferredProvider?.supportsNativeStream === true;
  const streamModelInfo = buildStreamModelInfo(preferredProvider);
  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': retrieving\n\n'));

      let emittedChunks = 0;
      let streamedAnswer = '';
      const emitToken = (token) => {
        const value = String(token || '');
        if (!value) return;
        streamedAnswer += value;
        emittedChunks += 1;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: value })}\n\n`));
      };

      let finalPayload;
      try {
        if (hasTrueStreamProvider) {
          const messages = buildRAGMessages(askInput.question, docs, {
            history: askInput.history,
            vectorMatches: matches,
          });
          try {
            const llmStream = await streamExternalLLM(env, messages, {
              maxTokens: 500,
              temperature: 0.2,
              ...(preferredProvider?.config ? { config: preferredProvider.config } : {}),
            });

            await consumeOpenAICompatibleStream(llmStream, {
              onToken(token) {
                emitToken(token);
              },
            });

            if (streamedAnswer.trim()) {
              const sources = buildSearchSourceList(matches, docs, keywords);
              finalPayload = buildAiAnswerPayload(streamedAnswer, askInput.question, {
                mode: AI_RESPONSE_MODE.ANSWER,
                sources,
                docs,
                confidence: 0.82,
                rewriteSuggestions: buildRewriteSuggestions(askInput.question, { keywords, docs }),
                modelInfo: streamModelInfo,
              });
            }
          } catch (err) {
            console.error('Ask stream external streaming failed:', err.message);
          }
        }

        // 流式失败或不支持流式 → 非流式 RAG 回退
        if (!finalPayload) {
          try {
            const result = await ragAnswer(env, askInput.question, docs, {
              history: askInput.history,
              vectorMatches: matches,
              ctx,
            });
            const answer = result?.response?.trim();
            if (answer) {
              const sources = buildSearchSourceList(matches, docs, keywords);
              finalPayload = buildAiAnswerPayload(answer, askInput.question, {
                mode: AI_RESPONSE_MODE.ANSWER,
                sources,
                docs,
                confidence: 0.82,
                rewriteSuggestions: buildRewriteSuggestions(askInput.question, { keywords, docs }),
                modelInfo: result?.modelInfo || streamModelInfo,
              });
            } else {
              finalPayload = buildSearchOnlyPayload(askInput.question, {
                matches, docs, keywords,
                downgradeReason: 'answer_generation_empty',
                modelInfo: result?.modelInfo || buildIdleModelInfo('answer_generation_empty'),
              });
            }
          } catch (err) {
            console.error('Ask stream fallback RAG failed:', err.message);
            finalPayload = buildSearchOnlyPayload(askInput.question, {
              matches, docs, keywords,
              downgradeReason: 'answer_generation_failed',
              modelInfo: buildIdleModelInfo('answer_generation_failed'),
            });
          }
        }
      } catch (err) {
        console.error('Ask stream answer failed:', err.message);
        finalPayload = buildSearchOnlyPayload(askInput.question, {
          matches, docs, keywords,
          downgradeReason: 'answer_generation_failed',
          modelInfo: buildIdleModelInfo('answer_generation_failed'),
        });
      }

      if (!emittedChunks) {
        for (const token of splitAnswerIntoChunks(finalPayload.answer)) {
          emitToken(token);
        }
      }

      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(finalPayload)}\n\n`));
      controller.close();
    }
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      ...cors,
    },
  });
}

export async function handleAiSummary(env, documentId, request, cors, ctx, json) {
  if (!env?.AI?.run) {
    return json({ error: 'AI 摘要服务暂未配置' }, cors, 503);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_summary');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  const summaryKey = normalizeSummaryKey(documentId);

  const cached = await env.DB.prepare(
    'SELECT summary FROM ai_summaries WHERE document_id = ?'
  ).bind(summaryKey).first();

  if (cached) {
    return json({
      summary: cached.summary,
      cached: true,
      disclaimer: 'AI生成摘要，仅供参考',
    }, cors);
  }

  let doc = null;
  if (summaryKey.startsWith('wenku-series:')) {
    const seriesName = summaryKey.slice('wenku-series:'.length).trim();
    if (!seriesName) {
      return json({ error: '未找到该系列或系列名无效' }, cors, 400);
    }

    const seriesDocs = await env.DB.prepare(
      `SELECT id, title, content, series_name, episode_num
       FROM documents
       WHERE series_name = ? AND content IS NOT NULL AND content != ''
       ORDER BY episode_num ASC, id ASC LIMIT 12`
    ).bind(seriesName).all();

    if (seriesDocs.results?.length > 0) {
      doc = {
        id: summaryKey,
        title: `${seriesName}（文库导读）`,
        content: buildSeriesSummaryContent(seriesName, seriesDocs.results),
      };
    }
  } else {
    doc = await env.DB.prepare('SELECT id, title, content FROM documents WHERE id = ?').bind(summaryKey).first();
    if (!doc || !doc.content) {
      const seriesDocs = await env.DB.prepare(
        `SELECT id, title, content, series_name FROM documents
         WHERE audio_series_id = ? AND content IS NOT NULL
         ORDER BY audio_episode_num ASC LIMIT 10`
      ).bind(summaryKey).all();

      if (seriesDocs.results?.length > 0) {
        const combinedTitle = seriesDocs.results[0].series_name || summaryKey;
        const combinedContent = seriesDocs.results
          .map(item => `【${item.title}】\n${(item.content || '').slice(0, 2000)}`)
          .join('\n\n');
        doc = { id: summaryKey, title: combinedTitle, content: combinedContent };
      }
    }
  }

  if (!doc || !doc.content) {
    return json({ error: '未找到该文档或文档无文本内容' }, cors, 404);
  }

  let summary;
  try {
    summary = await generateSummary(env, doc.title, doc.content, { ctx });
  } catch (err) {
    console.error('generateSummary failed:', err.message);
    return json({ error: 'AI摘要服务暂时不可用，请稍后再试' }, cors, 503);
  }

  if (!summary || !summary.trim()) {
    return json({ error: 'AI未能生成有效摘要，请稍后再试' }, cors, 503);
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO ai_summaries (document_id, summary, model)
     VALUES (?, ?, ?)`
  ).bind(summaryKey, summary, resolveAIModel(env, 'chat')).run();

  return json({
    summary,
    cached: false,
    disclaimer: 'AI生成摘要，仅供参考',
  }, cors);
}

export async function handleAiSearch(env, request, query, cors, ctx, json) {
  if (!query || query.length < 2 || query.length > 200) {
    return json({ error: '搜索词长度应为2-200个字符' }, cors, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_search');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  if (!env?.AI?.run || !env?.VECTORIZE) {
    const fallbackDocs = await keywordSearchDocs(env, query, { limit: 10 });
    const results = mapKeywordDocsToSearchResults(fallbackDocs);
    return json({ results, query, fallback: true }, cors);
  }

  let matches = [];
  try {
    matches = await semanticSearch(env, query, { topK: 10, ctx });
  } catch (err) {
    console.warn('AI search semantic lookup failed, using D1 fallback:', err.message);
  }

  if (!matches.length) {
    const fallbackDocs = await keywordSearchDocs(env, query, { limit: 10 });
    const results = mapKeywordDocsToSearchResults(fallbackDocs);
    return json({ results, query, fallback: true }, cors);
  }

  if (matches.length >= 2) {
    matches = await rerankResults(env, query, matches, { topK: 10, ctx });
  }

  const docs = await retrieveDocuments(env, matches);
  const results = matches.map(match => {
    const doc = docs.find(item => item.id === match.metadata.doc_id);
    let snippet = '';
    if (doc?.content) {
      const ql = query.toLowerCase();
      const idx = doc.content.toLowerCase().indexOf(ql);
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(doc.content.length, idx + ql.length + 140);
        snippet = (start > 0 ? '...' : '') + doc.content.slice(start, end).trim() + (end < doc.content.length ? '...' : '');
      } else {
        snippet = doc.content.slice(0, 200).trim() + (doc.content.length > 200 ? '...' : '');
      }
    }
    return {
      doc_id: match.metadata.doc_id,
      title: doc ? doc.title : match.metadata.title || '',
      snippet,
      score: Math.round(match.score * 100) / 100,
      series_name: doc ? doc.series_name : '',
      category: doc ? doc.category : match.metadata.category || '',
      audio_series_id: doc ? doc.audio_series_id : '',
    };
  });

  return json({ results, query }, cors);
}

function dateSeed(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) - h + dateKey.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

async function selectDailyEpisodes(db, dateKey) {
  const seed = dateSeed(dateKey);
  const { results: allSeries } = await db.prepare(
    `SELECT s.id, s.title, s.title_en, s.speaker, s.speaker_en,
            s.category_id, s.total_episodes, s.intro
     FROM series s
     WHERE s.total_episodes > 0 AND s.category_id != 'fohao'
     ORDER BY s.sort_order`
  ).all();
  if (!allSeries.length) return [];

  const shuffled = [...allSeries].sort((a, b) => {
    const ha = ((seed * 31 + a.id.charCodeAt(0) * 17) >>> 0) % 10000;
    const hb = ((seed * 31 + b.id.charCodeAt(0) * 17) >>> 0) % 10000;
    return ha - hb;
  });

  const picks = [];
  const usedCats = new Set();
  const usedSeries = new Set();

  for (const series of shuffled) {
    if (picks.length >= 3) break;
    if (usedCats.has(series.category_id)) continue;
    const epNum = (seed + series.id.charCodeAt(0) * 7) % series.total_episodes + 1;
    picks.push({ series, episodeNum: epNum });
    usedCats.add(series.category_id);
    usedSeries.add(series.id);
  }

  for (const series of shuffled) {
    if (picks.length >= 3) break;
    if (usedSeries.has(series.id)) continue;
    const ci = Math.min(series.id.length - 1, 2);
    const epNum = (seed + series.id.charCodeAt(ci) * 13) % series.total_episodes + 1;
    picks.push({ series, episodeNum: epNum });
    usedSeries.add(series.id);
  }

  const results = [];
  for (const pick of picks) {
    const ep = await db.prepare(
      `SELECT episode_num, title, file_name, url
       FROM episodes WHERE series_id = ? AND episode_num = ?`
    ).bind(pick.series.id, pick.episodeNum).first();

    if (ep) {
      results.push({
        series_id: pick.series.id,
        episode_num: ep.episode_num,
        episode_title: ep.title,
        series_title: pick.series.title,
        series_title_en: pick.series.title_en || '',
        series_intro: pick.series.intro || '',
        category_id: pick.series.category_id,
        speaker: pick.series.speaker,
        speaker_en: pick.series.speaker_en || '',
        play_url: ep.url,
        total_episodes: pick.series.total_episodes,
      });
    }
  }
  return results;
}

async function getEpisodeContext(db, seriesId, episodeNum) {
  const doc = await db.prepare(
    `SELECT content FROM documents
     WHERE audio_series_id = ? AND audio_episode_num = ?
       AND content IS NOT NULL AND content != ''
     LIMIT 1`
  ).bind(seriesId, episodeNum).first();
  return doc?.content ? doc.content.slice(0, 800) : null;
}

async function generateRecommendIntros(env, episodes, contexts, ctx) {
  const messages = buildRecommendMessages(episodes, contexts);
  const chatModel = resolveAIModel(env, 'chat');
  const fallbackChatModel = resolveAIModel(env, 'chatFallback');

  let response;
  try {
    response = await runAIWithLogging(
      env,
      chatModel,
      { messages, max_tokens: 500, temperature: 0.6 },
      GATEWAY_PROFILES.recommend,
      'recommend',
      ctx
    );
  } catch (err) {
    console.warn('[DailyRec] Primary model failed, trying fallback:', err.message);
    response = await runAIWithLogging(
      env,
      fallbackChatModel,
      { messages, max_tokens: 500, temperature: 0.6 },
      GATEWAY_PROFILES.recommend,
      'recommend',
      ctx
    );
  }

  const text = extractAIResponse(response);
  if (!text) return null;
  const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn('[DailyRec] Failed to parse AI JSON:', cleaned.slice(0, 200));
    return null;
  }
}

export async function handleDailyRecommend(env, cors, ctx, json) {
  const dateKey = getTodayBeijing();
  if (!env?.AI?.run) {
    return json({
      date: dateKey,
      recommendations: null,
      error: 'ai_unavailable',
      fallback: true,
    }, cors, 503, 'no-store');
  }

  const db = env.DB;
  const startMs = Date.now();

  const cached = await db.prepare(
    `SELECT recommendations, status, created_at FROM ai_daily_recommendations WHERE date_key = ?`
  ).bind(dateKey).first();

  if (cached && cached.status === 'ready') {
    return json({
      date: dateKey,
      recommendations: JSON.parse(cached.recommendations),
      cached: true,
    }, cors, 200, 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
  }

  if (cached && cached.status === 'generating') {
    // 检查僵尸锁：超过 5 分钟视为失败，删除后允许重新生成
    const createdAt = cached.created_at ? new Date(cached.created_at + 'Z').getTime() : 0;
    if (Date.now() - createdAt < 300_000) {
      return json({ date: dateKey, recommendations: null, generating: true }, cors, 200, 'no-store');
    }
    console.warn('[DailyRec] Stale generating lock detected, clearing for retry');
    await db.prepare(
      `DELETE FROM ai_daily_recommendations WHERE date_key = ? AND status = 'generating'`
    ).bind(dateKey).run();
  }

  try {
    await db.prepare(
      `INSERT INTO ai_daily_recommendations (date_key, recommendations, model, status)
       VALUES (?, '[]', 'pending', 'generating')`
    ).bind(dateKey).run();
  } catch {
    return json({ date: dateKey, recommendations: null, generating: true }, cors, 200, 'no-store');
  }

  try {
    const episodes = await selectDailyEpisodes(db, dateKey);
    if (!episodes.length) throw new Error('No episodes selected');

    const contexts = await Promise.all(
      episodes.map(ep => getEpisodeContext(db, ep.series_id, ep.episode_num))
    );
    const intros = await generateRecommendIntros(env, episodes, contexts, ctx);
    const recommendations = episodes.map((ep, i) => ({
      ...ep,
      ai_intro: intros && intros[i] ? intros[i].intro : ep.series_intro,
    }));
    const genMs = Date.now() - startMs;

    await db.prepare(
      `UPDATE ai_daily_recommendations
       SET recommendations = ?, model = ?, generation_ms = ?, status = 'ready'
       WHERE date_key = ?`
    ).bind(JSON.stringify(recommendations), resolveAIModel(env, 'chat'), genMs, dateKey).run();

    // 非阻塞清理过期限流记录
    if (ctx?.waitUntil) ctx.waitUntil(cleanupRateLimits(env));

    return json({
      date: dateKey,
      recommendations,
      cached: false,
      generation_ms: genMs,
    }, cors, 200, 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
  } catch (err) {
    console.error('[DailyRec] Generation failed:', err);
    await db.prepare(
      `UPDATE ai_daily_recommendations SET status = 'failed', error = ? WHERE date_key = ?`
    ).bind(err.message || 'unknown', dateKey).run();
    return json({
      date: dateKey,
      recommendations: null,
      error: 'generation_failed',
      fallback: true,
    }, cors, 500, 'no-store');
  }
}

export async function handleVoiceToText(env, request, cors, json) {
  if (!env?.AI?.run) {
    return json({ error: '语音识别服务暂未配置' }, cors, 503);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_voice');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('audio/') && !contentType.includes('application/octet-stream') && !contentType.includes('video/webm')) {
    return json({ error: 'Expected audio content' }, cors, 400);
  }

  const audioBuffer = await request.arrayBuffer();
  if (audioBuffer.byteLength > 5 * 1024 * 1024) {
    return json({ error: '音频文件过大，请控制在5MB以内' }, cors, 400);
  }
  if (audioBuffer.byteLength < 100) {
    return json({ error: '音频数据过短' }, cors, 400);
  }

  try {
    const result = await runAIWithLogging(
      env,
      resolveAIModel(env, 'whisper'),
      { audio: new Uint8Array(audioBuffer) },
      GATEWAY_PROFILES.whisper,
      'voice_to_text',
      null
    );
    const text = result?.text?.trim() || '';
    if (!text) return json({ error: '未识别到语音内容' }, cors);
    return json({ text }, cors, 200, 'no-store');
  } catch (err) {
    console.error('Whisper failed:', err.message);
    return json({ error: '语音识别失败，请稍后重试' }, cors, 503);
  }
}

export async function handlePersonalizedRecommend(env, request, url, cors, json) {
  if (!env?.AI?.run || !env?.VECTORIZE) {
    return json({ recommendations: [], fallback: true }, cors);
  }

  const seriesIds = (url.searchParams.get('series') || '').split(',').filter(Boolean).slice(0, 5);
  if (!seriesIds.length) return json({ recommendations: [] }, cors);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_recommend');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  const placeholders = seriesIds.map(() => '?').join(',');
  const { results: docs } = await env.DB.prepare(
    `SELECT id, title, content FROM documents
     WHERE audio_series_id IN (${placeholders})
     AND content IS NOT NULL
     LIMIT 5`
  ).bind(...seriesIds).all();

  if (!docs.length) return json({ recommendations: [] }, cors);

  const combinedText = docs
    .map(doc => doc.title + ' ' + (doc.content || '').slice(0, 500))
    .join('\n')
    .slice(0, 2000);
  const [queryVector] = await generateEmbeddings(env, [combinedText], { gatewayProfile: 'searchEmbedding' });
  const results = await env.VECTORIZE.query(queryVector, { topK: 15, returnMetadata: 'all' });
  const filtered = results.matches
    .filter(match => match.score >= 0.4 && !seriesIds.includes(match.metadata?.audio_series_id || match.metadata?.series_name))
    .slice(0, 10);

  const recommendations = [];
  const seenSeries = new Set();
  const candidateSids = [];
  for (const match of filtered) {
    const sid = match.metadata?.audio_series_id || match.metadata?.series_name;
    if (!sid || seenSeries.has(sid)) continue;
    seenSeries.add(sid);
    candidateSids.push({ sid, score: match.score });
  }

  if (candidateSids.length) {
    const sids = candidateSids.map(c => c.sid);
    const ph = sids.map(() => '?').join(',');
    const { results: seriesList } = await env.DB.prepare(
      `SELECT id, title, speaker, total_episodes, category_id FROM series WHERE id IN (${ph})`
    ).bind(...sids).all();

    const seriesMap = new Map((seriesList || []).map(s => [s.id, s]));
    for (const { sid, score } of candidateSids) {
      const series = seriesMap.get(sid);
      if (series) {
        recommendations.push({
          series_id: series.id,
          series_title: series.title,
          speaker: series.speaker,
          category_id: series.category_id,
          total_episodes: series.total_episodes,
          relevance_score: Math.round(score * 100) / 100,
        });
      }
      if (recommendations.length >= 3) break;
    }
  }

  return json({ recommendations }, cors, 200, 'private, max-age=3600');
}

// ============================================================
// 法音智搜 — 搜索法师讲记原文片段（无 LLM 生成）
// ============================================================
export async function handleSearchQuotes(env, request, cors, ctx, json) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_search');
  if (!limit.allowed) return json({ error: limit.reason }, cors, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 500) {
    return json({ error: '问题不能为空且不超过500字' }, cors, 400);
  }

  const seriesId = typeof body?.series_id === 'string' ? body.series_id.trim().slice(0, 100) : null;
  const keywords = extractSearchKeywords(question);

  // 0a. 知识库优先匹配（预提取的问答对）
  let knowledgeResults = [];
  if (env?.DB && keywords.length > 0) {
    try {
      const likeQ = keywords.slice(0, 3).map(k => `%${k}%`);
      const whereQ = likeQ.map(() => 'q.question LIKE ?').join(' OR ');
      const kbSql = `SELECT q.id, q.question, q.answer_quote, q.answer_position, q.importance,
        q.doc_id, d.title, d.series_name, d.audio_series_id, d.audio_episode_num
        FROM ai_qa_pairs q LEFT JOIN documents d ON q.doc_id = d.id
        WHERE (${whereQ}) ORDER BY q.importance DESC, q.confidence DESC LIMIT 5`;
      const kbRows = await env.DB.prepare(kbSql).bind(...likeQ).all();
      for (const r of (kbRows.results || [])) {
        knowledgeResults.push({
          doc_id: r.doc_id,
          title: r.title || '',
          series_name: r.series_name || '',
          audio_series_id: r.audio_series_id || '',
          audio_episode_num: r.audio_episode_num || null,
          snippet: r.answer_quote || '',
          score: r.importance === 'high' ? 0.95 : 0.85,
          source: 'knowledge',
          question_match: r.question,
        });
      }
    } catch (err) {
      console.warn('Knowledge base query failed:', err.message);
    }
  }

  // 0b. 音频标题搜索（series + episodes）
  let audioResults = [];
  if (env?.DB && keywords.length > 0) {
    try {
      const likePatterns = keywords.slice(0, 3).map(k => `%${k}%`);
      const whereClauses = likePatterns.map(() => 's.title LIKE ?').join(' OR ');
      const sql = `SELECT s.id, s.title, s.total_episodes, s.speaker, c.name as category_name
        FROM series s LEFT JOIN categories c ON s.category_id = c.id
        WHERE ${whereClauses} ORDER BY s.play_count DESC LIMIT 5`;
      const seriesRows = await env.DB.prepare(sql).bind(...likePatterns).all();
      for (const row of (seriesRows.results || [])) {
        audioResults.push({
          type: 'series',
          series_id: row.id,
          title: row.title,
          total_episodes: row.total_episodes,
          speaker: row.speaker,
          category: row.category_name || '',
        });
      }
    } catch (err) {
      console.warn('Audio title search failed:', err.message);
    }
  }

  // 1. 语义搜索
  let matches = [];
  if (env?.VECTORIZE) {
    try {
      const filter = seriesId ? { audio_series_id: seriesId } : undefined;
      matches = await semanticSearch(env, question, { topK: 8, filter, ctx });
      if (!matches.length && seriesId) {
        matches = await semanticSearch(env, question, { topK: 8, ctx });
      }
    } catch (err) {
      console.warn('Vectorize search failed:', err.message);
    }
  }

  // 2. 关键词搜索补充
  let keywordDocs = [];
  try {
    keywordDocs = await keywordSearchDocs(env, question, { seriesId, limit: 8 });
    if (!keywordDocs.length && seriesId) {
      keywordDocs = await keywordSearchDocs(env, question, { seriesId: null, limit: 6 });
    }
  } catch (err) {
    console.warn('Keyword search failed:', err.message);
  }

  // 3. 合并文档
  let docs = await retrieveDocuments(env, matches);
  docs = mergeDocs(docs, keywordDocs);

  // 为关键词命中补充 pseudo match
  for (const doc of keywordDocs.slice(0, 4)) {
    matches = appendPseudoMatch(matches, doc, buildKeywordSnippet(doc.content, keywords), 0.56);
  }

  // 4. 重排序
  if (matches.length >= 2) {
    matches = await rerankResults(env, question, matches, { topK: 8, ctx });
  }

  // 5. 上下文扩展
  if (matches.length > 0 && docs.length > 0) {
    matches = expandContextFromDocs(matches, docs);
  }

  // 6. 构建搜索结果（知识库优先、然后向量+关键词结果，去重、最多 5 条）
  const seenDocIds = new Set();
  const results = [];

  // 知识库结果优先（来自预提取的问答对）
  for (const kr of knowledgeResults) {
    if (!kr.doc_id || seenDocIds.has(kr.doc_id)) continue;
    seenDocIds.add(kr.doc_id);
    results.push({
      doc_id: kr.doc_id,
      title: kr.title,
      series_name: kr.series_name,
      category: '',
      audio_series_id: kr.audio_series_id,
      audio_episode_num: kr.audio_episode_num,
      snippet: kr.snippet,
      score: kr.score,
    });
    if (results.length >= 5) break;
  }

  // 向量/关键词结果补充
  for (const match of matches) {
    const docId = match.metadata?.doc_id;
    if (!docId || seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);

    const doc = docs.find(d => d.id === docId);
    if (!doc) continue;

    const chunkText = (match.metadata?.text || '').replace(/\s+/g, ' ').trim();
    // 当 Vectorize metadata.text 缺失时，从源文档内容提取片段
    let snippet = '';
    const textSource = chunkText || (doc.content || '').replace(/\s+/g, ' ').trim();
    if (textSource) {
      snippet = keywords.length > 0
        ? buildKeywordSnippet(textSource, keywords) || textSource.slice(0, 400)
        : textSource.slice(0, 400);
    }

    results.push({
      doc_id: docId,
      title: doc.title || '',
      series_name: doc.series_name || '',
      category: doc.category || '',
      audio_series_id: doc.audio_series_id || '',
      audio_episode_num: doc.audio_episode_num || null,
      snippet,
      score: typeof match.score === 'number' ? Math.round(match.score * 100) / 100 : null,
    });

    if (results.length >= 5) break;
  }

  // 无语义结果时用关键词文档兜底
  if (!results.length && keywordDocs.length) {
    for (const doc of keywordDocs.slice(0, 5)) {
      if (seenDocIds.has(doc.id)) continue;
      seenDocIds.add(doc.id);
      const snippet = keywords.length > 0
        ? buildKeywordSnippet(doc.content || '', keywords) || (doc.content || '').slice(0, 400)
        : (doc.content || '').slice(0, 400);
      results.push({
        doc_id: doc.id,
        title: doc.title || '',
        series_name: doc.series_name || '',
        category: doc.category || '',
        audio_series_id: doc.audio_series_id || '',
        audio_episode_num: doc.audio_episode_num || null,
        snippet,
        score: null,
      });
    }
  }

  return json({
    results,
    audioResults,
    keywords,
    disclaimer: results.length ? '以上开示摘录均出自法师讲记原文' : '',
  }, cors, 200, 'no-store');
}
