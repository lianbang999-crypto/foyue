/* ===== D1 API Service with Client-Side Caching ===== */

const API_BASE = '/api';

/* Simple cache: { key: { data, ts } } */
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

/* Deduplication: prevent duplicate in-flight requests */
const _pending = new Map();

function dedupFetch(key, fetcher) {
  if (_pending.has(key)) return _pending.get(key);
  const p = fetcher().finally(() => _pending.delete(key));
  _pending.set(key, p);
  return p;
}

/**
 * Record a play event for a series/episode
 * Called when a new episode starts playing
 */
export async function recordPlay(seriesId, episodeNum) {
  try {
    const r = await fetch(`${API_BASE}/play-count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesId, episodeNum }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    // Update cache with new count
    if (data && data.playCount) {
      const cacheKey = `pc:${seriesId}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        cached.totalPlayCount = data.playCount;
        cacheSet(cacheKey, cached);
      }
    }
    return data;
  } catch (e) {
    return null; // Silently fail - don't interrupt playback
  }
}

/**
 * Get play counts for a series and its episodes
 * Cached for 5 minutes, with request deduplication
 */
export async function getPlayCount(seriesId) {
  const key = `pc:${seriesId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/play-count/${encodeURIComponent(seriesId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data && !data.error) cacheSet(key, data);
      return data;
    } catch (e) {
      return null;
    }
  });
}

/**
 * Send appreciation for a series (1 per day per user)
 */
export async function appreciate(seriesId) {
  try {
    const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Get global stats (cached for 5 minutes)
 */
export async function getStats() {
  const key = 'stats';
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/stats`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) cacheSet(key, data);
      return data;
    } catch (e) {
      return null;
    }
  });
}
