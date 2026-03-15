/* ===== D1 API Service with Client-Side Caching ===== */

const API_BASE = '/api';

// ✅ 增强：添加日志记录工具
const API_LOGGER = {
  enabled: true,
  log: (level, method, url, error = null) => {
    if (!API_LOGGER.enabled) return;
    // Only log to localStorage in development; avoid polluting storage in production
    if (import.meta.env.DEV) {
      console.log(`[API ${level}]`, method, url, error || '');
      try {
        const timestamp = new Date().toISOString();
        const logs = JSON.parse(localStorage.getItem('api-logs') || '[]');
        logs.push({ timestamp, level, method, url, error: error ? error.message : null });
        if (logs.length > 100) logs.shift();
        localStorage.setItem('api-logs', JSON.stringify(logs));
      } catch (e) {
        // ignore quota errors
      }
    }
  }
};

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
 * #21: Circuit breaker — stop sending after 3 consecutive failures, auto-resets after 5 min
 */
let _recordFailCount = 0;
const RECORD_FAIL_LIMIT = 3;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes
let _circuitBreakerTimer = null;

export async function recordPlay(seriesId, episodeNum) {
  // Circuit breaker: skip if too many consecutive failures
  if (_recordFailCount >= RECORD_FAIL_LIMIT) {
    API_LOGGER.log('warn', 'recordPlay', `${seriesId}/${episodeNum}`, new Error('Circuit breaker triggered'));
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
      // Trip circuit breaker: schedule auto-reset after 5 minutes
      if (_recordFailCount >= RECORD_FAIL_LIMIT && !_circuitBreakerTimer) {
        _circuitBreakerTimer = setTimeout(() => {
          _recordFailCount = 0;
          _circuitBreakerTimer = null;
        }, CIRCUIT_BREAKER_RESET_MS);
      }
      API_LOGGER.log('error', 'recordPlay', `${seriesId}/${episodeNum}`, new Error(`HTTP ${r.status}`));
      return null;
    }
    _recordFailCount = 0; // Reset on success
    clearTimeout(_circuitBreakerTimer);
    _circuitBreakerTimer = null;
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
    API_LOGGER.log('info', 'recordPlay', `${seriesId}/${episodeNum}`);
    return data;
  } catch (e) {
    _recordFailCount++;
    // Trip circuit breaker: schedule auto-reset after 5 minutes
    if (_recordFailCount >= RECORD_FAIL_LIMIT && !_circuitBreakerTimer) {
      _circuitBreakerTimer = setTimeout(() => {
        _recordFailCount = 0;
        _circuitBreakerTimer = null;
      }, CIRCUIT_BREAKER_RESET_MS);
    }
    API_LOGGER.log('error', 'recordPlay', `${seriesId}/${episodeNum}`, e);
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
 * Send appreciation for a series + episode (no daily limit)
 */
export async function appreciate(seriesId, episodeNum) {
  try {
    const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeNum }),
    });
    if (!r.ok) {
      API_LOGGER.log('error', 'appreciate', `${seriesId}/${episodeNum}`, new Error(`HTTP ${r.status}`));
      return null;
    }
    const data = await r.json();
    API_LOGGER.log('info', 'appreciate', `${seriesId}/${episodeNum}`);
    return data;
  } catch (e) {
    API_LOGGER.log('error', 'appreciate', `${seriesId}/${episodeNum}`, e);
    return null;
  }
}

/**
 * Get total appreciation count for a series
 */
export async function getAppreciateCount(seriesId) {
  const key = `ap:${seriesId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupFetch(key, async () => {
    try {
      const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data) cacheSet(key, data);
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
