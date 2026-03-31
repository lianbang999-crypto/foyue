/* ===== Play History ===== */
import { state } from './state.js';
import { get, set } from './store.js';

function toEpisodeKey(value) {
  if (value == null || value === '') return '';
  return String(value);
}

function toEpisodeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return 0;
}

function toEpisodeIndex(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return -1;
}

function getTrackEpisodeNumber(track, epIdx) {
  const episodeNumber = toEpisodeNumber(track?.id);
  if (episodeNumber > 0) return episodeNumber;
  return Number.isInteger(epIdx) && epIdx >= 0 ? epIdx + 1 : 0;
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const epIdx = toEpisodeIndex(entry.epIdx);
  const episodeId = toEpisodeKey(entry.episodeId ?? entry.epId ?? '');
  const episodeNum = toEpisodeNumber(entry.episodeNum) || (episodeId && /^\d+$/.test(episodeId) ? parseInt(episodeId, 10) : 0);
  return {
    ...entry,
    catId: typeof entry.catId === 'string' ? entry.catId : '',
    epIdx,
    episodeId,
    episodeNum,
    time: Number.isFinite(entry.time) ? entry.time : 0,
    duration: Number.isFinite(entry.duration) ? entry.duration : 0,
  };
}

function isSameHistoryEpisode(entry, track, epIdx) {
  const trackEpisodeId = toEpisodeKey(track?.id);
  if (entry.episodeId && trackEpisodeId) return entry.episodeId === trackEpisodeId;

  const trackEpisodeNum = getTrackEpisodeNumber(track, epIdx);
  if (entry.episodeNum > 0 && trackEpisodeNum > 0) return entry.episodeNum === trackEpisodeNum;

  return entry.epIdx >= 0 && entry.epIdx === epIdx;
}

function findSeriesCategory(seriesId) {
  const categories = state.data?.categories;
  if (!Array.isArray(categories)) return '';
  for (const category of categories) {
    if (category.series?.some(series => series.id === seriesId)) return category.id;
  }
  return '';
}

export function getHistory() {
  try {
    const h = get('history');
    return Array.isArray(h)
      ? h.map(normalizeHistoryEntry).filter(x => x && x.seriesTitle && x.epTitle && x.timestamp)
      : [];
  } catch {
    return [];
  }
}

export function findHistoryEntryForTrack(history, track, epIdx) {
  if (!track?.seriesId) return null;
  return history.find(entry => entry.seriesId === track.seriesId && isSameHistoryEpisode(entry, track, epIdx)) || null;
}

export function findHistoryEntryForEpisode(history, series, epIdx) {
  if (!series?.id || epIdx < 0 || !series.episodes?.[epIdx]) return null;
  return findHistoryEntryForTrack(history, { ...series.episodes[epIdx], seriesId: series.id }, epIdx);
}

export function resolveHistoryEpisodeIndex(entry, series) {
  if (!entry || !series?.episodes?.length) return -1;

  if (entry.episodeId) {
    const matchById = series.episodes.findIndex(episode => toEpisodeKey(episode.id) === entry.episodeId);
    if (matchById >= 0) return matchById;
  }

  if (entry.episodeNum > 0) {
    const matchByNum = series.episodes.findIndex(episode => toEpisodeNumber(episode.id) === entry.episodeNum);
    if (matchByNum >= 0) return matchByNum;
  }

  if (entry.epTitle) {
    const matchByTitle = series.episodes.findIndex(episode => (episode.title || episode.fileName || '') === entry.epTitle);
    if (matchByTitle >= 0) return matchByTitle;
  }

  if (entry.episodeNum > 0) {
    const zeroBasedIndex = entry.episodeNum - 1;
    if (zeroBasedIndex >= 0 && zeroBasedIndex < series.episodes.length) return zeroBasedIndex;
  }

  return entry.epIdx >= 0 && entry.epIdx < series.episodes.length ? entry.epIdx : -1;
}

export function resolveHistoryTarget(entry) {
  const categories = state.data?.categories;
  if (!entry?.seriesId || !Array.isArray(categories)) return null;

  let category = null;
  let series = null;

  if (entry.catId) {
    category = categories.find(item => item.id === entry.catId) || null;
    series = category?.series?.find(item => item.id === entry.seriesId) || null;
  }

  if (!series) {
    for (const candidate of categories) {
      const foundSeries = candidate.series?.find(item => item.id === entry.seriesId);
      if (foundSeries) {
        category = candidate;
        series = foundSeries;
        break;
      }
    }
  }

  if (!series) return null;

  const epIdx = resolveHistoryEpisodeIndex(entry, series);
  if (epIdx < 0) return null;

  return { category, series, epIdx };
}

export function addHistory(tr, audio) {
  if (!tr || !tr.seriesId) return;
  try {
    let h = getHistory();
    h = h.filter(entry => !(entry.seriesId === tr.seriesId && isSameHistoryEpisode(entry, tr, state.epIdx)));
    h.unshift({
      seriesId: tr.seriesId, seriesTitle: tr.seriesTitle || '', speaker: tr.speaker || '',
      catId: findSeriesCategory(tr.seriesId),
      epIdx: state.epIdx,
      episodeId: toEpisodeKey(tr.id),
      episodeNum: getTrackEpisodeNumber(tr, state.epIdx),
      epTitle: tr.title || tr.fileName || '',
      time: audio.currentTime || 0, duration: audio.duration || 0, timestamp: Date.now()
    });
    if (h.length > 20) h = h.slice(0, 20);
    set('history', h);
  } catch { /* ignore */ }
}

export function clearHistory() {
  set('history', []);
}

export function syncHistoryProgress(audio) {
  if (state.epIdx < 0 || !state.playlist[state.epIdx]) return;
  try {
    const h = getHistory();
    const tr = state.playlist[state.epIdx];
    for (let i = 0; i < h.length; i++) {
      if (h[i].seriesId === tr.seriesId && isSameHistoryEpisode(h[i], tr, state.epIdx)) {
        h[i].time = audio.currentTime || 0;
        h[i].duration = audio.duration || 0;
        if (!h[i].catId) h[i].catId = findSeriesCategory(tr.seriesId);
        break;
      }
    }
    set('history', h);
  } catch { /* ignore */ }
}
