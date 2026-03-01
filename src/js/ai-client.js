/* ===== AI API 客户端 ===== */

const AI_BASE = '/api/ai';
const AI_TIMEOUT = 30000; // 30s

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
