/* ===== Wenku API Client ===== */

const API_BASE = '/api/wenku';

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 50;

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  // Evict oldest entries if cache exceeds max size
  if (_cache.size >= CACHE_MAX) {
    let oldestKey = null, oldestTs = Infinity;
    for (const [k, v] of _cache) {
      if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
    }
    if (oldestKey) _cache.delete(oldestKey);
  }
  _cache.set(key, { data, ts: Date.now() });
}

const _pending = new Map();
function dedupFetch(key, fetcher) {
  if (_pending.has(key)) return _pending.get(key);
  const p = fetcher().finally(() => _pending.delete(key));
  _pending.set(key, p);
  return p;
}

/** Fetch with timeout (default 15s) */
function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/** Get all series with document counts */
export async function getWenkuSeries() {
  const key = 'wenku:series';
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/series`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) cacheSet(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Get documents in a series */
export async function getWenkuDocuments(seriesName) {
  const key = `wenku:docs:${seriesName}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/documents?series=${encodeURIComponent(seriesName)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) cacheSet(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Get a single document with full content + prev/next */
export async function getWenkuDocument(id) {
  const key = `wenku:doc:${id}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/documents/${encodeURIComponent(id)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) cacheSet(key, data);
      return data;
    } catch (e) { return null; }
  });
}

/** Search wenku documents */
export async function searchWenku(q) {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/search?q=${encodeURIComponent(q)}`, {}, 10000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
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
