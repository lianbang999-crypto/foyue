/* ===== D1 API Service with Client-Side Caching ===== */
import { createRequestCache } from './request-cache.js';
import { get as storeGet, patch as storePatch, saveNow as storeSaveNow } from './store.js';

const API_BASE = '/api';
const requestCache = createRequestCache({ ttlMs: 5 * 60 * 1000, maxEntries: 50 });
const VISITOR_ID_PREFIX = 'visitor';

/**
 * 播放上报只在连续失败时短暂冷却，避免长时间吞掉统计。
 */
let _recordFailCount = 0;
const RECORD_FAIL_LIMIT = 3;
const RECORD_FAIL_COOLDOWN_MS = 30 * 1000;
let _recordBlockedUntil = 0;

function createOpaqueId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
  } catch { }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId() {
  const monitorState = storeGet('monitor') || {};
  const existing = typeof monitorState.visitorId === 'string' ? monitorState.visitorId.trim() : '';
  if (existing) return existing;

  const visitorId = createOpaqueId(VISITOR_ID_PREFIX);
  storePatch('monitor', { visitorId });
  storeSaveNow();
  return visitorId;
}

function buildIdentityHeaders(visitorId, requestId) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Visitor-Id': visitorId,
  };

  if (requestId) {
    headers['X-Request-Id'] = requestId;
  }

  return headers;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function emitGlobalEvent(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch { }
}

function syncPlayCountCache(seriesId, playCount) {
  const normalized = normalizeCount(playCount);
  if (normalized == null) return null;

  const cacheKey = `pc:${seriesId}`;
  const cached = requestCache.get(cacheKey);
  const next = cached && typeof cached === 'object' ? { ...cached } : {};
  next.totalPlayCount = normalized;
  requestCache.set(cacheKey, next);
  return normalized;
}

function syncAppreciateCache(seriesId, total, duplicate) {
  const cacheKey = `ap:${seriesId}`;
  const cached = requestCache.get(cacheKey);
  const next = cached && typeof cached === 'object' ? { ...cached } : {};
  const normalized = normalizeCount(total);

  if (normalized != null) {
    next.total = normalized;
  }
  if (duplicate != null) {
    next.duplicate = !!duplicate;
  }

  if (Object.keys(next).length > 0) {
    requestCache.set(cacheKey, next);
  }

  return normalizeCount(next.total);
}

function canRecordPlayNow() {
  if (!_recordBlockedUntil) return true;
  if (Date.now() >= _recordBlockedUntil) {
    _recordBlockedUntil = 0;
    _recordFailCount = 0;
    return true;
  }
  return false;
}

function noteRecordPlayFailure() {
  _recordFailCount += 1;
  if (_recordFailCount >= RECORD_FAIL_LIMIT) {
    _recordBlockedUntil = Date.now() + RECORD_FAIL_COOLDOWN_MS;
  }
}

function noteRecordPlaySuccess() {
  _recordFailCount = 0;
  _recordBlockedUntil = 0;
}

export async function recordPlay(seriesId, episodeNum, requestId) {
  if (!seriesId) return null;
  if (!canRecordPlayNow()) {
    if (import.meta.env.DEV) console.warn('[API] recordPlay cooldown active', seriesId, episodeNum);
    return null;
  }

  const visitorId = getVisitorId();
  const payload = { seriesId, episodeNum, visitorId };
  if (requestId) payload.requestId = requestId;

  try {
    const r = await fetch(`${API_BASE}/play-count`, {
      method: 'POST',
      headers: buildIdentityHeaders(visitorId, requestId),
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      noteRecordPlayFailure();
      if (import.meta.env.DEV) console.error('[API] recordPlay error', r.status, seriesId, episodeNum);
      return null;
    }

    noteRecordPlaySuccess();
    const data = await r.json().catch(() => ({}));
    const playCount = syncPlayCountCache(seriesId, data?.playCount ?? data?.totalPlayCount);

    if (playCount != null) {
      emitGlobalEvent('playcount:updated', {
        seriesId,
        episodeNum,
        playCount,
        requestId: requestId || null,
        visitorId,
      });
    }

    if (import.meta.env.DEV) console.log('[API] recordPlay ok', seriesId, episodeNum);
    return data;
  } catch (e) {
    noteRecordPlayFailure();
    if (import.meta.env.DEV) console.error('[API] recordPlay exception', e);
    return null;
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
 * 系列级随喜；episodeNum 只作为可选上下文传给后端。
 */
export async function appreciate(seriesId, episodeNum) {
  if (!seriesId) return null;

  const visitorId = getVisitorId();
  const payload = { visitorId };
  if (episodeNum != null) payload.episodeNum = episodeNum;

  try {
    const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: buildIdentityHeaders(visitorId),
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;

    const data = await r.json().catch(() => ({}));
    const total = syncAppreciateCache(seriesId, data?.total, data?.duplicate);

    emitGlobalEvent('appreciate:updated', {
      seriesId,
      episodeNum: episodeNum ?? null,
      total,
      duplicate: !!data?.duplicate,
      visitorId,
    });

    return total == null ? data : { ...data, total };
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
