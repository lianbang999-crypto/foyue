/* ===== Audio Metadata Cache ===== */
/* 仅持久化数据源里已有的音频元数据，不再运行时主动探测。 */

import { get, patch } from './store.js';
import { toFiniteNumber } from './utils.js';

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
