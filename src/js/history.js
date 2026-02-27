/* ===== Play History ===== */
import { state } from './state.js';

export function getHistory() {
  try {
    const h = JSON.parse(localStorage.getItem('pl-history')) || [];
    return h.filter(x => x.seriesTitle && x.epTitle && x.timestamp);
  } catch (e) {
    return [];
  }
}

export function addHistory(tr, audio) {
  if (!tr || !tr.seriesId) return;
  try {
    let h = getHistory();
    // Remove duplicate (same series + same episode)
    h = h.filter(x => !(x.seriesId === tr.seriesId && x.epIdx === state.epIdx));
    // Find catId for this series
    let catId = '';
    for (let ci = 0; ci < state.data.categories.length; ci++) {
      if (state.data.categories[ci].series.some(s => s.id === tr.seriesId)) {
        catId = state.data.categories[ci].id;
        break;
      }
    }
    h.unshift({
      seriesId: tr.seriesId, seriesTitle: tr.seriesTitle || '', speaker: tr.speaker || '',
      catId, epIdx: state.epIdx, epTitle: tr.title || tr.fileName || '',
      time: audio.currentTime || 0, duration: audio.duration || 0, timestamp: Date.now()
    });
    if (h.length > 20) h = h.slice(0, 20);
    localStorage.setItem('pl-history', JSON.stringify(h));
  } catch (e) { /* ignore */ }
}

export function syncHistoryProgress(audio) {
  if (state.epIdx < 0 || !state.playlist[state.epIdx]) return;
  try {
    const h = getHistory();
    const tr = state.playlist[state.epIdx];
    for (let i = 0; i < h.length; i++) {
      if (h[i].seriesId === tr.seriesId && h[i].epIdx === state.epIdx) {
        h[i].time = audio.currentTime || 0;
        h[i].duration = audio.duration || 0;
        break;
      }
    }
    localStorage.setItem('pl-history', JSON.stringify(h));
  } catch (e) { /* ignore */ }
}
