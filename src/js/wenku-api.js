/* ===== Wenku API Client ===== */
import { createRequestCache, fetchWithTimeout } from './request-cache.js';

const API_BASE = '/api/wenku';
const requestCache = createRequestCache({ ttlMs: 5 * 60 * 1000, maxEntries: 50 });

/** Get all series with document counts */
export async function getWenkuSeries() {
  const key = 'wenku:series';
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/series`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) requestCache.set(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Get documents in a series */
export async function getWenkuDocuments(seriesName) {
  const key = `wenku:docs:${seriesName}`;
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/documents?series=${encodeURIComponent(seriesName)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) requestCache.set(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Get a single document with full content + prev/next */
export async function getWenkuDocument(id) {
  const key = `wenku:doc:${id}`;
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/documents/${encodeURIComponent(id)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) requestCache.set(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Search wenku documents */
export async function searchWenku(q, signal) {
  try {
    const opts = signal ? { signal } : {};
    const r = await fetchWithTimeout(`${API_BASE}/search?q=${encodeURIComponent(q)}`, opts, 10000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw e; // 允许上层捕获取消事件
    return null;
  }
}

/** Record a read event */
export async function recordWenkuRead(documentId) {
  try {
    await fetchWithTimeout(`${API_BASE}/read-count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    }, 10000);
  } catch (e) { /* silent */ }
}
