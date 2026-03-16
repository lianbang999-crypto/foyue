/* ===== AI API 客户端 ===== */

const AI_BASE = '/api/ai';
const AI_TIMEOUT = 60000; // #19: 60s — AI operations (RAG, summary) need more time

/**
 * 带超时和安全 JSON 解析的 fetch
 */
async function aiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(res.status >= 500 ? '服务暂时不可用，请稍后再试' : '响应解析失败');
    }
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请稍后再试');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AI 问答 — RAG 管线
 */
export async function askQuestion(question, context = {}) {
  return aiFetch(`${AI_BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...context }),
  });
}

/**
 * AI 问答 — SSE 流式输出
 * @param {string} question
 * @param {object} context - { history?, series_id? }
 * @param {function} onToken - 回调，每收到一个 token 调用: onToken(tokenStr)
 * @returns {Promise<{ sources, disclaimer }>} 流结束后返回最终数据
 */
export async function askQuestionStream(question, context = {}, onToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const res = await fetch(`${AI_BASE}/ask-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, ...context }),
      signal: controller.signal,
    });

    // Non-SSE response means an error or non-stream fallback
    if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
      let data;
      try { data = await res.json(); } catch { throw new Error('请求失败'); }
      if (data.error) throw new Error(data.error);
      // Fallback: non-stream response with full answer
      if (data.answer && onToken) onToken(data.answer);
      return { sources: data.sources || [], disclaimer: data.disclaimer || '' };
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = { sources: [], disclaimer: '' };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const payload = line.slice(6);
          try {
            const parsed = JSON.parse(payload);
            if (eventType === 'done') {
              finalData = parsed;
            } else if (eventType === 'error') {
              throw new Error(parsed.error || 'Stream error');
            } else {
              // Default: token event
              if (parsed.token && onToken) onToken(parsed.token);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // JSON parse error — skip malformed SSE data
            } else {
              throw e;
            }
          }
          eventType = '';
        } else if (line === '') {
          eventType = '';
        }
      }
    }

    return finalData;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请稍后再试');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取集摘要
 */
export async function getEpisodeSummary(documentId) {
  return aiFetch(`${AI_BASE}/summary/${encodeURIComponent(documentId)}`);
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
  return aiFetch(`${AI_BASE}/daily-recommend`);
}

/**
 * 语音转文字 — Whisper
 * @param {Blob} audioBlob - 录音音频
 * @returns {{ text: string }}
 */
export async function voiceToText(audioBlob) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const res = await fetch(`${AI_BASE}/voice-to-text`, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
      signal: controller.signal,
    });
    let data;
    try { data = await res.json(); } catch { throw new Error('语音识别失败'); }
    if (!res.ok) throw new Error(data.error || '语音识别失败');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('语音识别超时');
    throw err;
  } finally {
    clearTimeout(timer);
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
