/* ===== Wenku API Client =====
 * 内存缓存 + localStorage 持久化；过期数据先展示（stale-while-revalidate）并后台刷新。
 */

const API_BASE = '/api/wenku';

const _cache = new Map();
const CACHE_TTL = 45 * 60 * 1000; // 会话内内存保留更久，持久化负责跨刷新
const CACHE_MAX = 80;

/** 系列列表：此时间内不发起网络请求 */
const SERIES_SOFT_TTL_MS = 25 * 60 * 1000;
/** 系列列表：超过则丢弃持久化（走网络，失败再回退旧数据） */
const SERIES_HARD_STALE_MS = 10 * 24 * 60 * 60 * 1000;

const DOCS_SOFT_TTL_MS = 25 * 60 * 1000;
const DOCS_HARD_STALE_MS = 10 * 24 * 60 * 60 * 1000;

const DOC_SOFT_TTL_MS = 40 * 60 * 1000;
const DOC_HARD_STALE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_DOC_PERSIST_CHARS = 720_000;

const WK_PERSIST_V = 1;
const WK_PREFIX = `foyue-wk${WK_PERSIST_V}:`;
const MAX_PERSIST_PAYLOAD = 4_500_000;

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  if (_cache.size >= CACHE_MAX) {
    let oldestKey = null; let oldestTs = Infinity;
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

function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── localStorage ─────────────────────────────────────────────

function persistRead(storKey) {
  try {
    const raw = localStorage.getItem(WK_PREFIX + storKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number' || parsed.data == null) return null;
    return { ts: parsed.ts, data: parsed.data };
  } catch {
    return null;
  }
}

function persistWrite(storKey, data) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), data });
    if (payload.length > MAX_PERSIST_PAYLOAD) return;
    localStorage.setItem(WK_PREFIX + storKey, payload);
  } catch { /* quota */ }
}

function persistRemove(storKey) {
  try { localStorage.removeItem(WK_PREFIX + storKey); } catch { /* ignore */ }
}

function loadPersistSeries() {
  const row = persistRead('series');
  if (!row?.data?.series?.length) return null;
  return row;
}

function savePersistSeries(data) {
  if (data?.series?.length) persistWrite('series', data);
}

function loadPersistDocs(seriesName) {
  const sk = `docs:${encodeURIComponent(seriesName)}`;
  const row = persistRead(sk);
  if (!row?.data?.documents?.length) return null;
  return row;
}

function savePersistDocs(seriesName, data) {
  if (data?.documents?.length) persistWrite(`docs:${encodeURIComponent(seriesName)}`, data);
}

function loadPersistDoc(id) {
  const sk = `doc:${encodeURIComponent(id)}`;
  const row = persistRead(sk);
  if (!row?.data?.document) return null;
  return row;
}

function savePersistDoc(id, data) {
  if (!data?.document) return;
  try {
    const payload = JSON.stringify({ ts: Date.now(), data });
    if (payload.length > MAX_DOC_PERSIST_CHARS) return;
    persistWrite(`doc:${encodeURIComponent(id)}`, data);
  } catch { /* ignore */ }
}

/** 同步读取系列列表（供首屏立即渲染，无 await） */
export function peekWenkuSeriesSync() {
  const row = loadPersistSeries();
  if (!row) return null;
  if (Date.now() - row.ts > SERIES_HARD_STALE_MS) {
    persistRemove('series');
    return null;
  }
  return row.data;
}

/** 同步读取某系列讲次列表 */
export function peekWenkuDocumentsSync(seriesName) {
  const row = loadPersistDocs(seriesName);
  if (!row) return null;
  if (Date.now() - row.ts > DOCS_HARD_STALE_MS) {
    persistRemove(`docs:${encodeURIComponent(seriesName)}`);
    return null;
  }
  return row.data;
}

export function wenkuSeriesListSig(data) {
  if (!data?.series?.length) return '';
  return data.series.map(s => `${s.series_name}\t${s.count}`).join('|');
}

export function wenkuDocsListSig(data) {
  if (!data?.documents?.length) return '';
  return data.documents.map(d => `${d.id}\t${d.title}`).join('|');
}

// ── 网络 + 事件 ─────────────────────────────────────────────

async function networkSeriesFetch() {
  const r = await fetchWithTimeout(`${API_BASE}/series`);
  if (!r.ok) return null;
  const data = await r.json();
  if (data?.series?.length) {
    savePersistSeries(data);
    cacheSet('wenku:series', data);
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('wenku:cache-updated', {
        detail: { type: 'series', data },
      }));
    });
  }
  return data;
}

/** 与 dedup 共用：失败时回退到当前磁盘缓存（避免多标签并发时 fetcher 不一致） */
async function fetchSeriesResilient() {
  const data = await networkSeriesFetch();
  if (data?.series?.length) return data;
  const row = loadPersistSeries();
  return row?.data?.series?.length ? row.data : null;
}

async function networkDocsFetch(seriesName) {
  const r = await fetchWithTimeout(
    `${API_BASE}/documents?series=${encodeURIComponent(seriesName)}`
  );
  if (!r.ok) return null;
  const data = await r.json();
  if (data?.documents?.length) {
    savePersistDocs(seriesName, data);
    const key = `wenku:docs:${seriesName}`;
    cacheSet(key, data);
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('wenku:cache-updated', {
        detail: { type: 'docs', seriesName, data },
      }));
    });
  }
  return data;
}

async function networkDocFetch(id) {
  const r = await fetchWithTimeout(`${API_BASE}/documents/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const data = await r.json();
  if (data?.document) {
    cacheSet(`wenku:doc:${id}`, data);
    savePersistDoc(id, data);
  }
  return data;
}

async function fetchDocResilient(id) {
  const data = await networkDocFetch(id);
  if (data?.document) return data;
  const row = loadPersistDoc(id);
  return row?.data?.document ? row.data : null;
}

async function fetchDocsResilient(seriesName) {
  const data = await networkDocsFetch(seriesName);
  if (data?.documents?.length) return data;
  const row = loadPersistDocs(seriesName);
  return row?.data?.documents?.length ? row.data : null;
}

/** Get all series with document counts */
export async function getWenkuSeries() {
  const key = 'wenku:series';
  const mem = cacheGet(key);
  if (mem) return mem;

  const persisted = loadPersistSeries();
  if (persisted) {
    const age = Date.now() - persisted.ts;
    if (age > SERIES_HARD_STALE_MS) {
      persistRemove('series');
    } else {
      cacheSet(key, persisted.data);
      if (age < SERIES_SOFT_TTL_MS) {
        return persisted.data;
      }
      dedupFetch(key, () => fetchSeriesResilient()).catch(() => {});
      return persisted.data;
    }
  }

  return dedupFetch(key, () => fetchSeriesResilient());
}

/** Get documents in a series */
export async function getWenkuDocuments(seriesName) {
  const key = `wenku:docs:${seriesName}`;
  const mem = cacheGet(key);
  if (mem) return mem;

  const persisted = loadPersistDocs(seriesName);
  if (persisted) {
    const age = Date.now() - persisted.ts;
    if (age > DOCS_HARD_STALE_MS) {
      persistRemove(`docs:${encodeURIComponent(seriesName)}`);
    } else {
      cacheSet(key, persisted.data);
      if (age < DOCS_SOFT_TTL_MS) {
        return persisted.data;
      }
      dedupFetch(key, () => fetchDocsResilient(seriesName)).catch(() => {});
      return persisted.data;
    }
  }

  return dedupFetch(key, () => fetchDocsResilient(seriesName));
}

/** Get a single document with full content + prev/next */
export async function getWenkuDocument(id) {
  const key = `wenku:doc:${id}`;
  const mem = cacheGet(key);
  if (mem) return mem;

  const persisted = loadPersistDoc(id);
  if (persisted) {
    const age = Date.now() - persisted.ts;
    if (age > DOC_HARD_STALE_MS) {
      persistRemove(`doc:${encodeURIComponent(id)}`);
    } else {
      cacheSet(key, persisted.data);
      if (age < DOC_SOFT_TTL_MS) {
        return persisted.data;
      }
      dedupFetch(key, () => fetchDocResilient(id)).catch(() => {});
      return persisted.data;
    }
  }

  return dedupFetch(key, () => fetchDocResilient(id));
}

/** Search wenku documents */
export async function searchWenku(q) {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/search?q=${encodeURIComponent(q)}`, {}, 10000);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
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
