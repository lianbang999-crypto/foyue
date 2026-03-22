/* ===== Unified App Store ===== */
/* Single localStorage key ('foyue_store') manages all lightweight persisted data.
 * Structure: { player, history, durations, appreciated, cachedUrls, ... }
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
  profile: {
    dharmaName: '',
    messageNickname: '',
  },
  preferences: {
    counterCustomGoal: 0,
    huixiangAnotherVow: '',
    wakeLockEnabled: true,
  },
  gongxiu: {
    submittedDate: '',
  },
  monitor: {
    visitorId: '',
    summary: null,
  },
  counter:    {
    practice: '南无阿弥陀佛',
    customPractice: '',
    practices: {
      '南无阿弥陀佛': { total: 0, daily: 0, dailyDate: '', goal: 108 },
      '阿弥陀佛':     { total: 0, daily: 0, dailyDate: '', goal: 108 },
      '__custom__':   { total: 0, daily: 0, dailyDate: '', goal: 108 },
    },
    dailyLog: {},
  },
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
    }
  } catch {
    _data = _defaults();
  }
  _migrateLegacyKeys();
  return _data;
}

function _migrateLegacyKeys() {
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

  // gongxiu-nickname → profile.dharmaName
  try {
    const nickname = localStorage.getItem('gongxiu-nickname') || '';
    if (nickname && !_data.profile?.dharmaName) {
      _data.profile = { ..._data.profile, dharmaName: nickname.slice(0, 20) };
    }
  } catch {}

  // msg-nickname → profile.messageNickname
  try {
    const nickname = localStorage.getItem('msg-nickname') || '';
    if (nickname && !_data.profile?.messageNickname) {
      _data.profile = { ..._data.profile, messageNickname: nickname.slice(0, 20) };
    }
  } catch {}

  // Legacy lightweight settings
  try {
    const goal = parseInt(localStorage.getItem('counter-custom-goal') || '0', 10) || 0;
    if (goal > 0 && !_data.preferences?.counterCustomGoal) {
      _data.preferences = { ..._data.preferences, counterCustomGoal: goal };
    }
  } catch {}

  try {
    const vow = localStorage.getItem('hx-another-vow') || '';
    if (vow && !_data.preferences?.huixiangAnotherVow) {
      _data.preferences = { ..._data.preferences, huixiangAnotherVow: vow };
    }
  } catch {}

  try {
    const wakeLockPref = localStorage.getItem('counter-wakelock-pref');
    if (wakeLockPref != null) {
      _data.preferences = { ..._data.preferences, wakeLockEnabled: wakeLockPref !== 'off' };
    }
  } catch {}

  try {
    const submittedDate = localStorage.getItem('gongxiu-submitted-date') || '';
    if (submittedDate && !_data.gongxiu?.submittedDate) {
      _data.gongxiu = { ..._data.gongxiu, submittedDate };
    }
  } catch {}

  try {
    const summary = JSON.parse(localStorage.getItem('site-monitor') || 'null');
    if (summary && !_data.monitor?.summary) {
      _data.monitor = { ..._data.monitor, summary };
    }
  } catch {}

  try {
    const visitorId = localStorage.getItem('visitor-id') || '';
    if (visitorId && !_data.monitor?.visitorId) {
      _data.monitor = { ..._data.monitor, visitorId };
    }
  } catch {}

  // Remove old keys
  for (const k of [
    'pl-state',
    'pl-history',
    'foyue_duration_cache',
    'appreciated',
    'gongxiu-nickname',
    'msg-nickname',
    'counter-custom-goal',
    'hx-another-vow',
    'counter-wakelock-pref',
    'gongxiu-submitted-date',
    'site-monitor',
    'visitor-id',
  ]) {
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
