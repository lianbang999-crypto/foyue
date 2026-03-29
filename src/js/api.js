/* ===== D1 API Service with Client-Side Caching ===== */
import { createRequestCache } from './request-cache.js';

const API_BASE = '/api';
const requestCache = createRequestCache({ ttlMs: 5 * 60 * 1000, maxEntries: 50 });

/**
 * Record a play event for a series/episode
 * Called when a new episode starts playing
 * Circuit breaker — stop sending after 3 consecutive failures.
 * Auto-resets after 5 minutes so transient outages self-heal.
 */
let _recordFailCount = 0;
let _circuitResetTimer = null;
const RECORD_FAIL_LIMIT = 3;
const CIRCUIT_RESET_MS = 5 * 60 * 1000; // 5 minutes

function _scheduleCircuitReset() {
  clearTimeout(_circuitResetTimer);
  _circuitResetTimer = setTimeout(() => {
    _recordFailCount = 0;
  }, CIRCUIT_RESET_MS);
}

export async function recordPlay(seriesId, episodeNum) {
  // Circuit breaker: skip if too many consecutive failures
  if (_recordFailCount >= RECORD_FAIL_LIMIT) {
    if (import.meta.env.DEV) console.warn('[API] recordPlay circuit breaker triggered', seriesId, episodeNum);
    return null;
  }
  try {
    const r = await fetch(`${API_BASE}/play-count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesId, episodeNum }),
    });
    if (!r.ok) {
      _recordFailCount++;
      _scheduleCircuitReset();
      if (import.meta.env.DEV) console.error('[API] recordPlay error', r.status, seriesId, episodeNum);
      return null;
    }
    _recordFailCount = 0;
    clearTimeout(_circuitResetTimer);
    const data = await r.json();
    // Update cache with new count
    if (data && data.playCount) {
      const cacheKey = `pc:${seriesId}`;
      const cached = requestCache.get(cacheKey);
      if (cached) {
        cached.totalPlayCount = data.playCount;
        requestCache.set(cacheKey, cached);
      }
    }
    // Notify UI so play count display can refresh without a page reload
    try {
      window.dispatchEvent(new CustomEvent('playcount:updated', {
        detail: { seriesId, episodeNum, playCount: data?.playCount }
      }));
    } catch { }
    if (import.meta.env.DEV) console.log('[API] recordPlay ok', seriesId, episodeNum);
    return data;
  } catch (e) {
    _recordFailCount++;
    _scheduleCircuitReset();
    if (import.meta.env.DEV) console.error('[API] recordPlay exception', e);
    return null; // Silently fail - don't interrupt playback
  }
}

/**
 * Get play counts for a series and its episodes
 * Cached for 5 minutes, with request deduplication
 */
export async function getPlayCount(seriesId) {
  const key = `pc:${seriesId}`;
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/play-count/${encodeURIComponent(seriesId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data && !data.error) requestCache.set(key, data);
      return data;
    } catch (e) {
      return null;
    }
  });
}

/**
 * Send appreciation for a series + episode (no daily limit)
 */
export async function appreciate(seriesId, episodeNum) {
  try {
    const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeNum }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Get total appreciation count for a series
 */
export async function getAppreciateCount(seriesId) {
  const key = `ap:${seriesId}`;
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) requestCache.set(key, data);
      return data;
    } catch (e) {
      return null;
    }
  });
}

/**
 * Get global stats (cached for 5 minutes)
 */
export async function getStats() {
  const key = 'stats';
  const cached = requestCache.get(key);
  if (cached) return cached;

  return requestCache.dedupe(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/stats`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) requestCache.set(key, data);
      return data;
    } catch (e) {
      return null;
    }
  });
}
