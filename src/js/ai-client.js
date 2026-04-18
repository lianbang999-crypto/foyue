/* ===== AI API 客户端 ===== */

const AI_BASE = '/api/ai';
const AI_TIMEOUT = 60000; // #19: 60s — AI operations (RAG, summary) need more time
const DAILY_RECOMMENDATION_CACHE_KEY = 'ai-daily-recommend-cache';
const DAILY_RECOMMENDATION_TTL_MS = 6 * 60 * 60 * 1000;
let dailyRecommendationPromise = null;

function isLocalStaticDev() {
  return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '8080';
}

function createAbortContext(timeoutMs, externalSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    controller,
    didTimeout: () => didTimeout,
    clear: () => clearTimeout(timer),
  };
}

function rethrowAbortError(err, didTimeout, timeoutMessage) {
  if (err.name !== 'AbortError') throw err;
  const nextErr = new Error(didTimeout ? timeoutMessage : '请求已取消');
  nextErr.name = didTimeout ? 'TimeoutError' : 'AbortError';
  throw nextErr;
}

/**
 * 带超时和安全 JSON 解析的 fetch
 */
async function aiFetch(url, options = {}) {
  const abortCtx = createAbortContext(AI_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: abortCtx.controller.signal });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(res.status >= 500 ? '服务暂时不可用，请稍后再试' : '响应解析失败');
    }
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  } catch (err) {
    rethrowAbortError(err, abortCtx.didTimeout(), '请求超时，请稍后再试');
    throw err;
  } finally {
    abortCtx.clear();
  }
}

/**
 * 获取欢迎页随机问题
 * @returns {Promise<string[]>}
 */
export async function fetchRandomQuestions() {
  try {
    const data = await aiFetch(`${AI_BASE}/random-questions`);
    return data.questions || [];
  } catch {
    return [];
  }
}

/**
 * 法音智搜 — 搜索法师讲记原文片段
 * @param {string} question
 * @param {object} options - { series_id? }
 * @returns {{ results: Array, keywords: string[], disclaimer: string }}
 */
export async function searchQuotes(question, options = {}) {
  return aiFetch(`${AI_BASE}/search-quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, series_id: options.series_id }),
  });
}

/**
 * 法音 AI 问答（流式）— 逐 token 回调，done 时返回完整结构化 payload
 * @param {string} question
 * @param {object} options - { series_id?, episode_num?, history? }
 * @param {object} callbacks - { onToken(token), onDone({answer,sources,citations,claimMap,uncertainty,downgradeReason,followUps,disclaimer,mode,confidence,rewriteSuggestions,contractVersion,promptVersion,modelInfo}), onError(err) }
 * @returns {AbortController} — 调用 .abort() 可取消
 */
export function askQuestionStream(question, options = {}, callbacks = {}) {
  const { onToken, onDone, onError, onStage } = callbacks;
  const controller = new AbortController();
  let didTimeout = false;
  let completed = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, AI_TIMEOUT);

  function finishWithDone(payload) {
    if (completed) return;
    completed = true;
    onDone?.(payload);
  }

  async function handleJsonResponse(res) {
    let parsed;
    try {
      parsed = await res.json();
    } catch {
      throw new Error('响应解析失败');
    }

    if (parsed?.error) throw new Error(parsed.error);
    finishWithDone(parsed);
  }

  function handleSsePayload(payload, eventType) {
    if (!payload || payload === '[DONE]') return false;

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return false;
    }

    if (parsed?.error) throw new Error(parsed.error);

    if (eventType === 'done') {
      finishWithDone(parsed);
      return true;
    }

    if (parsed.token) {
      onToken?.(parsed.token);
    }

    return false;
  }

  (async () => {
    try {
      const res = await fetch(`${AI_BASE}/ask-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          series_id: options.series_id,
          episode_num: options.episode_num,
          history: options.history || [],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `请求失败 (${res.status})`;
        try { const d = await res.json(); errMsg = d.error || errMsg; } catch { }
        throw new Error(errMsg);
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        await handleJsonResponse(res);
        return;
      }

      if (!res.body) {
        throw new Error('响应流不可用');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let eventType = 'message';

      const processLines = (lines) => {
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            eventType = 'message';
            continue;
          }
          // SSE comment 行，用于阶段提示
          if (trimmed.startsWith(':')) {
            const stage = trimmed.slice(1).trim();
            if (stage) onStage?.(stage);
            continue;
          }
          if (trimmed.startsWith('event:')) {
            eventType = trimmed.slice(6).trim();
            continue;
          }
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.slice(5).trim();
            const isDone = handleSsePayload(payload, eventType);
            eventType = 'message';
            if (isDone) return true;
          }
        }
        return false;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';

        if (processLines(lines)) {
          try {
            await reader.cancel();
          } catch {
            // 忽略取消 reader 的失败，onDone 已经发出
          }
          return;
        }
      }

      buf += decoder.decode();
      if (buf) {
        if (processLines(buf.split(/\r?\n/))) {
          try {
            await reader.cancel();
          } catch {
            // 忽略取消 reader 的失败，onDone 已经发出
          }
          return;
        }
      }

      if (!completed) {
        throw new Error('响应未正常结束');
      }
    } catch (err) {
      if (!completed) {
        if (err.name === 'AbortError') {
          onError?.(new Error(didTimeout ? '请求超时，请稍后再试' : '请求已取消'));
        } else {
          onError?.(err);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  })();

  return controller;
}

/**
 * 获取集摘要
 */
export async function getEpisodeSummary(documentId) {
  return aiFetch(`${AI_BASE}/summary/${encodeURIComponent(documentId)}`);
}

/**
 * 获取文库系列摘要
 */
export async function getSeriesSummary(seriesName) {
  if (isLocalStaticDev()) return null;
  const summaryKey = `wenku-series:${seriesName}`;
  return aiFetch(`${AI_BASE}/summary/${encodeURIComponent(summaryKey)}`);
}

/**
 * AI 语义搜索
 */
export async function aiSearch(query) {
  return aiFetch(`${AI_BASE}/search?q=${encodeURIComponent(query)}`);
}

/**
 * 获取音频对应的讲义文稿
 * @param {string} seriesId - 音频系列 ID
 * @param {number} episodeNum - 集数编号
 */
export async function getTranscript(seriesId, episodeNum) {
  return aiFetch(`/api/transcript/${encodeURIComponent(seriesId)}/${episodeNum}`);
}

/**
 * 查询某系列下有文稿的集数列表
 * @param {string} seriesId - 音频系列 ID
 * @returns {{ seriesId: string, episodes: number[] }}
 */
export async function getTranscriptAvailability(seriesId) {
  return aiFetch(`/api/transcript/available/${encodeURIComponent(seriesId)}`);
}

/**
 * 获取每日 AI 推荐
 * Returns: { date, recommendations: [...], cached, generating? }
 */
export async function getDailyRecommendation() {
  const cached = getCachedDailyRecommendation();
  if (cached) return cached;

  if (dailyRecommendationPromise) return dailyRecommendationPromise;

  dailyRecommendationPromise = aiFetch(`${AI_BASE}/daily-recommend`)
    .then((data) => {
      cacheDailyRecommendation(data);
      return data;
    })
    .finally(() => {
      dailyRecommendationPromise = null;
    });

  return dailyRecommendationPromise;
}

function getCachedDailyRecommendation() {
  try {
    const raw = localStorage.getItem(DAILY_RECOMMENDATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const todayDate = new Date().toISOString().slice(0, 10);
    if (!parsed?.date || parsed.date !== todayDate) return null;
    if (Date.now() - (parsed.timestamp || 0) > DAILY_RECOMMENDATION_TTL_MS) return null;
    if (!parsed.data?.recommendations?.length) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function cacheDailyRecommendation(data) {
  if (!data?.date || !data?.recommendations?.length) return;
  try {
    localStorage.setItem(DAILY_RECOMMENDATION_CACHE_KEY, JSON.stringify({
      date: data.date,
      timestamp: Date.now(),
      data,
    }));
  } catch {
    // Ignore storage failures and continue serving the fresh response.
  }
}

/**
 * 语音转文字 — Whisper
 * @param {Blob} audioBlob - 录音音频
 * @returns {{ text: string }}
 */
export async function voiceToText(audioBlob) {
  const abortCtx = createAbortContext(AI_TIMEOUT);
  try {
    const res = await fetch(`${AI_BASE}/voice-to-text`, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
      signal: abortCtx.controller.signal,
    });
    let data;
    try { data = await res.json(); } catch { throw new Error('语音识别失败'); }
    if (!res.ok) throw new Error(data.error || '语音识别失败');
    return data;
  } catch (err) {
    rethrowAbortError(err, abortCtx.didTimeout(), '语音识别超时');
    throw err;
  } finally {
    abortCtx.clear();
  }
}

/**
 * 个性化推荐
 * @param {string[]} seriesIds - 最近收听的系列 ID
 * @returns {{ recommendations: [...] }}
 */
export async function getPersonalizedRecommendations(seriesIds) {
  return aiFetch(`${AI_BASE}/personalized-recommend?series=${seriesIds.join(',')}`);
}
