/* ===== Audio Metadata Cache ===== */
/* 优先使用 HEAD 探测音频元数据，失败时回退极小 Range 请求，并持久化到统一 store。 */

import { state } from './state.js';
import { get, patch } from './store.js';
import { isAppleMobile } from './utils.js';

const META_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const META_TIMEOUT_MS = 5000;
const _inflight = new Map();

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function getConnType() {
  const conn = navigator.connection || navigator.mozConnection;
  if (!conn) return 'unknown';
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'wifi';
  if (conn.type === 'cellular') return 'cellular';
  return 'unknown';
}

function normalizeAudioMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bytes = toFiniteNumber(raw.bytes ?? raw.size ?? raw.fileSize ?? raw.contentLength);
  const mime = typeof raw.mime === 'string' && raw.mime ? raw.mime : '';
  const etag = typeof raw.etag === 'string' && raw.etag ? raw.etag : '';
  const checkedAt = toFiniteNumber(raw.checkedAt ?? raw.at);
  if (!bytes && !mime && !etag) return null;
  return { bytes, mime, etag, checkedAt };
}

function buildPatchValue(meta) {
  return {
    bytes: meta.bytes || 0,
    mime: meta.mime || '',
    etag: meta.etag || '',
    checkedAt: meta.checkedAt || Date.now(),
  };
}

function parseTotalBytes(response) {
  const contentRange = response.headers.get('content-range') || '';
  const match = /\/(\d+)\s*$/.exec(contentRange);
  if (match) return toFiniteNumber(match[1]);
  return toFiniteNumber(response.headers.get('content-length'));
}

function buildMetaFromResponse(response) {
  const bytes = parseTotalBytes(response);
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
  const etag = response.headers.get('etag') || '';
  if (!bytes && !mime && !etag) return null;
  return buildPatchValue({ bytes, mime, etag, checkedAt: Date.now() });
}

function shouldProbeMeta(cachedMeta) {
  if (navigator.onLine === false) return false;
  if (state.networkWeak) return false;

  const conn = navigator.connection || navigator.mozConnection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  if (isAppleMobile() && getConnType() === 'cellular') return false;

  if (!cachedMeta) return true;
  return !cachedMeta.checkedAt || (Date.now() - cachedMeta.checkedAt) > META_CACHE_TTL_MS;
}

function collectKnownAudioMeta(episodes, target) {
  if (!Array.isArray(episodes)) return target;
  episodes.forEach(ep => {
    if (!ep?.url) return;
    const meta = normalizeAudioMeta(ep);
    if (!meta) return;
    target[ep.url] = buildPatchValue(meta);
  });
  return target;
}

async function fetchAudioMeta(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (headResponse.ok) {
      const headMeta = buildMetaFromResponse(headResponse);
      if (headMeta) return headMeta;
    }

    const rangeResponse = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!rangeResponse.ok && rangeResponse.status !== 206) return null;
    return buildMetaFromResponse(rangeResponse);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getCachedAudioMeta(url) {
  const audioMeta = get('audioMeta');
  return normalizeAudioMeta(audioMeta?.[url]);
}

export function getTrackWithCachedAudioMeta(track) {
  if (!track?.url) return track;
  const cachedMeta = getCachedAudioMeta(track.url);
  if (!cachedMeta) return track;
  return {
    ...track,
    bytes: track.bytes || cachedMeta.bytes || 0,
    mime: track.mime || cachedMeta.mime || '',
    etag: track.etag || cachedMeta.etag || '',
  };
}

export function seedCachedAudioMetaFromEpisodes(episodes) {
  const next = collectKnownAudioMeta(episodes, {});
  if (Object.keys(next).length) patch('audioMeta', next);
}

export function seedCachedAudioMetaFromData(data) {
  const next = {};
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  categories.forEach(cat => {
    const seriesList = Array.isArray(cat?.series) ? cat.series : [];
    seriesList.forEach(series => collectKnownAudioMeta(series?.episodes, next));
  });
  if (Object.keys(next).length) patch('audioMeta', next);
}

export function primeAudioMetadata(trackOrUrl) {
  const url = typeof trackOrUrl === 'string' ? trackOrUrl : trackOrUrl?.url;
  if (!url) return Promise.resolve(null);

  const cachedMeta = getCachedAudioMeta(url);
  const trackMeta = typeof trackOrUrl === 'string' ? null : normalizeAudioMeta(trackOrUrl);
  if (trackMeta) {
    patch('audioMeta', { [url]: buildPatchValue(trackMeta) });
    return Promise.resolve(trackMeta);
  }

  if (!shouldProbeMeta(cachedMeta)) return Promise.resolve(cachedMeta);
  if (_inflight.has(url)) return _inflight.get(url);

  const request = fetchAudioMeta(url)
    .then(meta => {
      if (meta) patch('audioMeta', { [url]: meta });
      return meta || cachedMeta;
    })
    .finally(() => {
      _inflight.delete(url);
    });

  _inflight.set(url, request);
  return request;
}
