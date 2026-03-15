/* ===== Unified App Store ===== */
/* Single localStorage key ('foyue_store') manages all lightweight persisted data.
 * Structure: { player, history, durations, appreciated, cachedUrls }
 * All modules should import from this file instead of touching localStorage directly.
 */

const STORE_KEY = 'foyue_store';
const SAVE_DEBOUNCE_MS = 300;

const _defaults = () => ({
  player:     { seriesId: null, epIdx: 0, time: 0, speed: 1, loop: 'all' },
  history:    [],
  durations:  {},
  appreciated: [],
  cachedUrls: [],
  counter:    { total: 0, daily: 0, dailyDate: '', loops: 0, goal: 108 },
});

let _data = null;
let _saveTimer = null;

/* ===== Internal helpers ===== */

function _load() {
  if (_data) return _data;
  _data = _defaults();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge each known key individually to guard against partial/corrupt data
      const defs = _defaults();
      for (const k of Object.keys(defs)) {
        if (parsed[k] !== undefined) {
          _data[k] = parsed[k];
        }
      }
    } else {
      // First run: migrate old isolated keys
      _migrate();
    }
  } catch {
    _data = _defaults();
    _migrate();
  }
  return _data;
}

function _migrate() {
  // pl-state → player
  try {
    const s = JSON.parse(localStorage.getItem('pl-state') || 'null');
    if (s && s.seriesId) {
      _data.player = {
        seriesId: s.seriesId,
        epIdx:    s.idx   || 0,
        time:     s.time  || 0,
        speed:    s.speed || 1,
        // Old code used 'none' for "no-loop" which was later renamed to 'all' (loop-all)
        loop:     s.loop === 'none' ? 'all' : (s.loop || 'all'),
      };
    }
  } catch {}

  // pl-history → history
  try {
    const h = JSON.parse(localStorage.getItem('pl-history') || '[]');
    if (Array.isArray(h) && h.length) _data.history = h;
  } catch {}

  // foyue_duration_cache → durations
  try {
    const d = JSON.parse(localStorage.getItem('foyue_duration_cache') || '{}');
    if (d && typeof d === 'object') _data.durations = d;
  } catch {}

  // appreciated → appreciated
  try {
    const a = JSON.parse(localStorage.getItem('appreciated') || '[]');
    if (Array.isArray(a)) _data.appreciated = a;
  } catch {}

  // Remove old keys
  for (const k of ['pl-state', 'pl-history', 'foyue_duration_cache', 'appreciated']) {
    try { localStorage.removeItem(k); } catch {}
  }

  // Persist migrated data immediately
  _flush();
}

function _flush() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(_data)); } catch {}
}

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flush, SAVE_DEBOUNCE_MS);
}

/* ===== Public API ===== */

/**
 * Get a top-level section of the store.
 * @param {string} key  e.g. 'player' | 'history' | 'durations' | 'appreciated' | 'cachedUrls'
 * @returns {*}
 */
export function get(key) {
  return _load()[key];
}

/**
 * Replace a top-level section and schedule a debounced save.
 * @param {string} key
 * @param {*} value
 */
export function set(key, value) {
  _load()[key] = value;
  _scheduleSave();
}

/**
 * Merge a partial object into a top-level section and schedule a save.
 * Only works when the section is a plain object (not an array).
 * @param {string} key
 * @param {Object} partial
 */
export function patch(key, partial) {
  const data = _load();
  if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
    Object.assign(data[key], partial);
  } else {
    data[key] = partial;
  }
  _scheduleSave();
}

/**
 * Persist immediately (e.g. before page unload).
 */
export function saveNow() {
  clearTimeout(_saveTimer);
  _flush();
}

/**
 * Wipe the entire store and reset to defaults (e.g. for clearing user data).
 */
export function reset() {
  _data = _defaults();
  _flush();
}
