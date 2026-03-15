/* ===== Unified App Store ===== */
/* Consolidates: pl-history, foyue_duration_cache, appreciated, pl-state, cachedUrls */
/* Single localStorage key: foyue_store */

const STORE_KEY = 'foyue_store';

let _store = null;
let _saveTimer = null;

/** Load store from localStorage, migrating legacy keys on first run. */
function loadStore() {
  if (_store) return _store;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      _store = JSON.parse(raw);
      // Ensure all sections exist (for forward compat when new sections are added)
      if (!_store.history) _store.history = [];
      if (!_store.durations) _store.durations = {};
      if (!_store.appreciated) _store.appreciated = [];
      if (!_store.cachedUrls) _store.cachedUrls = [];
      return _store;
    }
  } catch { /* fall through to migration */ }

  // First run: migrate from legacy individual keys
  _store = _migrate();
  return _store;
}

function _migrate() {
  const store = { history: [], durations: {}, appreciated: [], playerState: null, cachedUrls: [] };

  try {
    const h = JSON.parse(localStorage.getItem('pl-history') || '[]');
    if (Array.isArray(h)) store.history = h;
  } catch { /* ignore */ }

  try {
    const d = JSON.parse(localStorage.getItem('foyue_duration_cache') || '{}');
    if (d && typeof d === 'object') store.durations = d;
  } catch { /* ignore */ }

  try {
    const a = JSON.parse(localStorage.getItem('appreciated') || '[]');
    if (Array.isArray(a)) store.appreciated = a;
  } catch { /* ignore */ }

  try {
    const s = localStorage.getItem('pl-state');
    if (s) store.playerState = JSON.parse(s);
  } catch { /* ignore */ }

  // Persist the migrated store immediately
  _saveImmediate(store);
  return store;
}

function _saveImmediate(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s || _store)); } catch { /* quota */ }
}

/** Debounced save — coalesces rapid writes (e.g., duration probes). */
function _debouncedSave(ms) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveImmediate, ms || 1000);
}

/* ===== History ===== */

export function getHistory() {
  const s = loadStore();
  const h = s.history || [];
  return h.filter(x => x.seriesTitle && x.epTitle && x.timestamp);
}

export function setHistory(h) {
  loadStore();
  _store.history = h;
  _saveImmediate();
  window.dispatchEvent(new CustomEvent('store:history-changed'));
}

/* ===== Durations ===== */

export function getStoreDuration(url) {
  const s = loadStore();
  return (s.durations || {})[url] ?? null;
}

export function setStoreDuration(url, seconds) {
  loadStore();
  if (!_store.durations) _store.durations = {};
  _store.durations[url] = seconds;
  _debouncedSave(2000);
}

export function saveStoreDurations() {
  clearTimeout(_saveTimer);
  _saveImmediate();
}

/* ===== Appreciated ===== */

export function getStoreAppreciatedSet() {
  const s = loadStore();
  return new Set(s.appreciated || []);
}

export function addStoreAppreciated(seriesId) {
  loadStore();
  const set = getStoreAppreciatedSet();
  if (!set.has(seriesId)) {
    set.add(seriesId);
    _store.appreciated = [...set];
    _saveImmediate();
  }
}

/* ===== Player State ===== */

export function getStorePlayerState() {
  const s = loadStore();
  return s.playerState || null;
}

export function setStorePlayerState(ps) {
  loadStore();
  _store.playerState = ps;
  _saveImmediate();
}

/* ===== Cached Audio URLs ===== */

export function isCachedUrl(url) {
  const s = loadStore();
  return Array.isArray(s.cachedUrls) && s.cachedUrls.includes(url);
}

export function getCachedUrls() {
  const s = loadStore();
  return new Set(s.cachedUrls || []);
}

export function addCachedUrl(url) {
  loadStore();
  if (!_store.cachedUrls) _store.cachedUrls = [];
  if (!_store.cachedUrls.includes(url)) {
    _store.cachedUrls.push(url);
    _saveImmediate();
    window.dispatchEvent(new CustomEvent('store:cache-changed', { detail: { action: 'add', url } }));
  }
}

export function removeCachedUrl(url) {
  loadStore();
  if (!_store.cachedUrls) return;
  const idx = _store.cachedUrls.indexOf(url);
  if (idx >= 0) {
    _store.cachedUrls.splice(idx, 1);
    _saveImmediate();
    window.dispatchEvent(new CustomEvent('store:cache-changed', { detail: { action: 'remove', url } }));
  }
}

export function clearCachedUrls() {
  loadStore();
  _store.cachedUrls = [];
  _saveImmediate();
  window.dispatchEvent(new CustomEvent('store:cache-changed', { detail: { action: 'clear' } }));
}

/**
 * Sync cachedUrls from the real Cache API on startup.
 * Called once at app init so isCachedUrl() works synchronously thereafter.
 */
export async function syncCachedUrlsFromCacheAPI() {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open('audio-v2');
    const keys = await cache.keys();
    loadStore();
    _store.cachedUrls = keys.map(r => r.url);
    _saveImmediate();
  } catch { /* ignore — Cache API unavailable */ }
}
