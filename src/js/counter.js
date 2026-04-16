/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { get, patch } from './store.js';
import { haptic, showToast, escapeHtml, formatCount, HUIXIANG_TEXT, localTodayStr, HUIXIANG_DISPLAY_AUTO_MS } from './utils.js';

/* 条件导入：独立页面不加载 player 模块 */
let pausePlaybackForCounter = () => { };
let _standaloneDeps = false;

/** 加载主站依赖（仅非独立页场景调用） */
export async function loadMainAppDeps() {
  if (_standaloneDeps) return;
  try {
    const playerMod = await import('./player.js');
    pausePlaybackForCounter = playerMod.pausePlaybackForCounter;
  } catch { /* standalone mode — deps unavailable */ }
  _standaloneDeps = true;
}
const BEADS_PER_LOOP = 108;
const MAX_RIPPLES = 6;

/** Built-in presets — always present, cannot be removed */
const PRACTICE_PRESETS = ['南无阿弥陀佛', '阿弥陀佛'];

// HUIXIANG_TEXT and formatCount are imported from utils.js

/** Standard daily practice goal presets (all have Buddhist significance) */
const GOAL_PRESETS = [108, 216, 540, 1080, 3000, 10000];

function getSavedCustomGoal() {
  return (get('preferences') || {}).counterCustomGoal || 0;
}
function persistCustomGoal(val) {
  patch('preferences', { counterCustomGoal: Math.max(0, parseInt(val, 10) || 0) });
}

/* ── Helpers ── */
/* Return the per-practice stats object for the current practice */
function getPracticeStats(data) {
  if (!data.practices[data.practice]) {
    data.practices[data.practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
  }
  return data.practices[data.practice];
}

/* Reset daily count if it's a new day; returns true if reset occurred */
function checkAndResetDaily(ps) {
  const today = localTodayStr();
  if (ps.dailyDate !== today) {
    ps.daily = 0;
    ps.dailyDate = today;
    return true;
  }
  return false;
}

/* Return the display name for the current practice (data.practice IS the name now) */
function getPracticeDisplayName(data) {
  return data.practice || '南无阿弥陀佛';
}

/** 供奉区文案：完整「南无阿弥陀佛」不放在计数圆环旁，仅页脚展示；此处用简称 */
function getHonorPracticeText(data) {
  const name = getPracticeDisplayName(data);
  return name === '南无阿弥陀佛' ? t('counter_honor_namo_outside') : name;
}

/* ── Daily log helpers ── */
function recordDailyLog(data, practice, count) {
  if (!data.dailyLog) data.dailyLog = {};
  const today = localTodayStr();
  if (!data.dailyLog[today]) data.dailyLog[today] = {};
  if (!data.dailyLog[today][practice]) data.dailyLog[today][practice] = 0;
  data.dailyLog[today][practice] += count;
}

/* Calculate streak: consecutive days (including today) with any practice logged */
function getStreak(data) {
  if (!data.dailyLog) return 0;
  const today = new Date();
  let streak = 0;
  const keys = Object.keys(data.dailyLog);
  if (keys.length === 0) return 0;
  for (let i = 0; ; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (data.dailyLog[key]) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/* Prune daily log entries older than 90 days to limit localStorage size */
function pruneDailyLog(data) {
  if (!data.dailyLog) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0');
  for (const key of Object.keys(data.dailyLog)) {
    if (key < cutoffStr) delete data.dailyLog[key];
  }
}

/* ── Wake Lock ── */
let _wakeLock = null;

async function requestWakeLock() {
  if (_wakeLock) return;
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    }
  } catch { /* user denied or unsupported */ }
}
function releaseWakeLock() {
  if (_wakeLock) {
    _wakeLock.release().catch(() => { });
    _wakeLock = null;
  }
}

/* ── 木鱼音效 (Muyu Sound) ── */
let _muyuAudioCtx = null;
let _muyuBuffer = null;

function isMuyuEnabled() {
  return (get('preferences') || {}).muyuSound !== false;
}
function setMuyuPref(on) {
  patch('preferences', { muyuSound: !!on });
}

async function _ensureMuyuLoaded() {
  if (_muyuBuffer) return true;
  try {
    if (!_muyuAudioCtx) {
      _muyuAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const resp = await fetch('/audio/muyu.mp3');
    const buf = await resp.arrayBuffer();
    _muyuBuffer = await _muyuAudioCtx.decodeAudioData(buf);
    return true;
  } catch { return false; }
}

function playMuyuSound() {
  if (!isMuyuEnabled() || !_muyuBuffer || !_muyuAudioCtx) return;
  if (_muyuAudioCtx.state === 'suspended') _muyuAudioCtx.resume();
  const src = _muyuAudioCtx.createBufferSource();
  src.buffer = _muyuBuffer;
  src.connect(_muyuAudioCtx.destination);
  src.start(0);
}

/* ── 熄灯模式 (Dimmer / Lights-off) ── */
function isDimmerEnabled() {
  return (get('preferences') || {}).dimmerMode === true;
}
function setDimmerPref(on) {
  patch('preferences', { dimmerMode: !!on });
}

function getCounterData() {
  let data = get('counter');
  let shouldPersist = false;

  // Initialize fresh data structure
  if (!data || !data.practices) {
    const old = data || {};
    data = { practice: '南无阿弥陀佛', customPractice: '', customPractices: [], practices: {}, dailyLog: {} };
    for (const p of PRACTICE_PRESETS) {
      data.practices[p] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    }
    if (old.total !== undefined) {
      const name = PRACTICE_PRESETS.includes(old.practice) ? old.practice : (old.practice || '南无阿弥陀佛');
      data.practice = name;
      if (!PRACTICE_PRESETS.includes(name)) {
        data.customPractice = name;
        data.customPractices = [name];
      }
      data.practices[name] = { total: old.total || 0, daily: old.daily || 0, dailyDate: old.dailyDate || '', goal: old.goal || 108 };
    }
    patch('counter', data);
  }

  // Ensure dailyLog exists
  if (!data.dailyLog) { data.dailyLog = {}; shouldPersist = true; }

  // Ensure customPractices array exists
  if (!Array.isArray(data.customPractices)) { data.customPractices = []; shouldPersist = true; }

  // Ensure the current practice slot exists
  if (!data.practices[data.practice]) {
    data.practices[data.practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    shouldPersist = true;
  }

  // Reset daily count if it's a new day
  const ps = getPracticeStats(data);
  if (checkAndResetDaily(ps)) shouldPersist = true;

  // Prune old log entries
  const beforeLogKeys = Object.keys(data.dailyLog).length;
  pruneDailyLog(data);
  if (Object.keys(data.dailyLog).length !== beforeLogKeys) shouldPersist = true;

  if (shouldPersist) patch('counter', data);
  return data;
}

/** Clear all practices' counts and daily log; keeps per-practice goals */
function resetAllCounterData(data) {
  for (const p of Object.keys(data.practices)) {
    const goal = data.practices[p].goal || 108;
    data.practices[p] = { total: 0, daily: 0, dailyDate: localTodayStr(), goal };
  }
  data.dailyLog = {};
  patch('counter', data);
}

/* ── Main render ── */
export async function openCounter() {
  await loadMainAppDeps();
  // Remove existing counter view if present
  document.querySelectorAll('.counter-view').forEach(el => {
    if (typeof el.__counterCleanup === 'function') {
      el.__counterCleanup({ skipAnimation: true, skipNavigation: true });
    } else {
      el.remove();
    }
  });

  const sourceTab = document.querySelector('.tab.active')?.dataset.tab || 'home';

  // Push browser history state so back button works
  history.pushState({ counter: true }, '');

  const view = document.createElement('div');
  view.className = 'counter-view';

  const data = getCounterData();
  let session = 0;   // counts in current session (not persisted to store until increment)

  view.innerHTML = buildCounterHTML(data, session);
  document.getElementById('app').appendChild(view);

  // Mark counter as active — player.js uses this to block system-initiated
  // MediaSession 'play' events that would override the user's explicit pause.
  document.body.setAttribute('data-counter-active', '1');
  pausePlaybackForCounter();

  // Request wake lock to keep screen on during chanting
  requestWakeLock();

  // Re-acquire wake lock if it was released (e.g. after tab switch)
  const visHandler = () => {
    if (document.visibilityState === 'visible' && view.isConnected) {
      requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', visHandler);

  // Animate in
  requestAnimationFrame(() => view.classList.add('counter-view--visible'));

  // Wire events
  wireCounterEvents(view, data, session);

  // Handle browser back button + Escape key
  const popHandler = (e) => {
    if (e.state && e.state.counter) return;
    closeCounter(view, sourceTab, popHandler, escHandler, visHandler);
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      // If a picker sheet is open (and visible), let it handle the Escape key
      if (view.querySelector('.counter-goal-sheet--visible, .counter-practice-sheet--visible')) return;
      const histOpen = view.querySelector('.counter-history--in');
      if (histOpen) {
        histOpen.classList.remove('counter-history--in');
        setTimeout(() => histOpen.remove(), 320);
        return;
      }
      history.back();
    }
  };
  view.__counterCleanup = (options) => closeCounter(view, sourceTab, popHandler, escHandler, visHandler, options);
  window.addEventListener('popstate', popHandler);
  window.addEventListener('keydown', escHandler);
}

function buildCounterHTML(data, session) {
  const ps = getPracticeStats(data);
  const beadPos = ps.total % BEADS_PER_LOOP;
  const honorPracticeHtml = escapeHtml(getHonorPracticeText(data));

  return `
    <div class="counter-header counter-header--minimal">
      <div class="counter-header-slot counter-header-slot--start">
        <button class="counter-back btn-icon" id="counterBack" aria-label="${t('wenku_back')}">
          <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div class="counter-header-slot counter-header-slot--center">
        <button type="button" class="counter-tool-icon${isMuyuEnabled() ? ' counter-tool-icon--active' : ''}" id="counterMuyuToggle" aria-label="木鱼音效" title="木鱼音效">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3C7 3 3 7.5 3 12c0 3 1.5 5.5 4 7h10c2.5-1.5 4-4 4-7 0-4.5-4-9-9-9z"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <circle cx="12" cy="12" r="2.5"/>
          </svg>
        </button>
        <button type="button" class="counter-tool-icon${isDimmerEnabled() ? ' counter-tool-icon--active' : ''}" id="counterDimmerToggle" aria-label="熄灯模式" title="熄灯模式">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
      <div class="counter-header-slot counter-header-slot--end">
        <button type="button" class="counter-records-entry" id="counterRecordsBtn"
                aria-label="${t('counter_records')}">${t('counter_records')}</button>
      </div>
    </div>

    <div class="counter-shell">
      <div class="counter-body">
        <!-- 圣号仅作供奉展示：不可点、不可选，与计数热区分隔 -->
        <div class="counter-honor-block" aria-live="polite">
          <p class="counter-honor-caption">${t('counter_honor_caption')}</p>
          <p class="counter-practice-name" id="counterPracticeName">${honorPracticeHtml}</p>
        </div>

        <div class="counter-focus">
          <div class="counter-tap-area" id="counterTapArea" role="button" tabindex="0"
               aria-label="${t('counter_tap_hint')}">
            <div class="counter-ring counter-ring--outer"></div>
            <svg class="counter-progress-svg" viewBox="0 0 200 200" id="counterProgressSvg" aria-hidden="true">
              <circle class="counter-progress-bg" cx="100" cy="100" r="88"/>
              <circle class="counter-progress-fill" id="counterProgressFill" cx="100" cy="100" r="88"
                stroke-dasharray="${Math.round(2 * Math.PI * 88)}"
                stroke-dashoffset="${Math.round(2 * Math.PI * 88 * (1 - beadPos / BEADS_PER_LOOP))}"/>
            </svg>
            <div class="counter-lotus-wrap">
              <div class="counter-number" id="counterNumber">${session}</div>
              <div class="counter-hint" id="counterHint">${t('counter_tap_hint')}</div>
            </div>
            <div class="counter-ripples" id="counterRipples"></div>
          </div>
        </div>
      </div>

      <footer class="counter-footer">
        <button type="button" class="counter-huixiang-primary" id="counterHuixiang">
          <span class="counter-huixiang-primary__text">${t('counter_huixiang')}</span>
        </button>
        <p class="counter-namo" aria-hidden="true">${t('counter_namo')}</p>
      </footer>
    </div>
  `;
}

function closeCounter(view, sourceTab, popHandler, escHandler, visHandler, options = {}) {
  if (!view || !view.isConnected) return;
  const { skipAnimation = false, skipNavigation = false } = options;
  if (popHandler) window.removeEventListener('popstate', popHandler);
  if (escHandler) window.removeEventListener('keydown', escHandler);
  if (visHandler) document.removeEventListener('visibilitychange', visHandler);
  delete view.__counterCleanup;
  // Remove counter-active guard so audio can resume normally after counter closes
  document.body.removeAttribute('data-counter-active');
  releaseWakeLock();
  const finishClose = () => {
    view.remove();
    if (skipNavigation) return;
    const targetTab = document.querySelector(`.tab[data-tab="${sourceTab}"]`) || document.querySelector('.tab[data-tab="home"]');
    if (targetTab) targetTab.click();
  };

  if (skipAnimation) {
    finishClose();
    return;
  }

  view.classList.remove('counter-view--visible');
  setTimeout(finishClose, 350);
}

function wireCounterEvents(view, data, _session) {
  let session = _session;

  /* ── Cache all DOM references once ── */
  const els = {
    number: view.querySelector('#counterNumber'),
    progressFill: view.querySelector('#counterProgressFill'),
    hint: view.querySelector('#counterHint'),
    practice: view.querySelector('#counterPracticeName'),
    ripples: view.querySelector('#counterRipples'),
  };

  /* ── Full UI update (settings change, loop complete, goal done, reset) ── */
  function updateUI(bump = false) {
    const dimmerBtn = view.querySelector('#counterDimmerToggle');
    if (dimmerBtn) dimmerBtn.classList.toggle('counter-tool-icon--active', isDimmerEnabled());

    const muyuBtn = view.querySelector('#counterMuyuToggle');
    if (muyuBtn) muyuBtn.classList.toggle('counter-tool-icon--active', isMuyuEnabled());









    const ps = getPracticeStats(data);
    const beadPos = ps.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));
    if (els.number) {
      els.number.textContent = session;
      if (bump) {
        els.number.classList.add('counter-number--bump');
        setTimeout(() => els.number.classList.remove('counter-number--bump'), 180);
      }
    }
    if (els.progressFill) els.progressFill.style.strokeDashoffset = offset;
    if (els.hint) els.hint.style.display = session > 0 ? 'none' : '';
    if (els.practice) els.practice.textContent = getHonorPracticeText(data);
  }

  /* ── Fast tap update — only the minimal DOM writes needed ── */
  function updateUIFast(bump) {
    const ps = getPracticeStats(data);
    const beadPos = ps.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));

    if (els.number) {
      els.number.textContent = session;
      if (bump) {
        els.number.classList.add('counter-number--bump');
        setTimeout(() => els.number.classList.remove('counter-number--bump'), 180);
      }
    }
    if (els.progressFill) els.progressFill.style.strokeDashoffset = offset;
    if (els.hint && session === 1) els.hint.style.display = 'none';
  }

  /* ── Ripple effect (pooled, max count limited) ── */
  function spawnRipple(x, y) {
    if (!els.ripples) return;
    // Limit concurrent ripples
    while (els.ripples.children.length >= MAX_RIPPLES) {
      els.ripples.removeChild(els.ripples.firstChild);
    }
    const r = document.createElement('div');
    r.className = 'counter-ripple';
    const rect = els.ripples.getBoundingClientRect();
    r.style.left = (x - rect.left) + 'px';
    r.style.top = (y - rect.top) + 'px';
    els.ripples.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  }

  /* ── Core count logic (no ripple/position) ── */
  function doCountCore() {
    haptic(30);
    playMuyuSound();
    session++;
    const ps = getPracticeStats(data);
    checkAndResetDaily(ps);
    ps.total++;
    ps.daily++;
    ps.dailyDate = localTodayStr();
    recordDailyLog(data, data.practice, 1);
    patch('counter', data);
    const goalJustDone = ps.goal > 0 && ps.daily === ps.goal;
    if (goalJustDone) {
      haptic(60);
      showToast(t('counter_daily_done'));
      updateUI(true);
      return true;
    }
    updateUIFast(true);
    return false;
  }

  /* ── Tap count (unified pointer handling to prevent double-fire) ── */
  const tapArea = view.querySelector('#counterTapArea');
  if (tapArea) {
    const doCount = (cx, cy) => {
      spawnRipple(cx, cy);
      doCountCore();
    };

    // Use Pointer Events API: single code path for touch, stylus, and mouse.
    // pointerup fires once per interaction; calling preventDefault() suppresses
    // the synthetic click event the browser would otherwise generate on touch,
    // eliminating the touchend→click double-fire race condition entirely.
    let pointerStartX = 0;
    let pointerStartY = 0;
    tapArea.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; // ignore right/middle mouse buttons
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
    }, { passive: true });

    tapArea.addEventListener('pointerup', (e) => {
      if (e.button > 0) return;
      // If the pointer moved more than 20px it's a swipe — skip
      const dx = Math.abs(e.clientX - pointerStartX);
      const dy = Math.abs(e.clientY - pointerStartY);
      if (dx > 20 || dy > 20) return;
      e.preventDefault(); // suppress synthetic click
      doCount(e.clientX, e.clientY);
    });

    tapArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doCount(0, 0);
      }
    });
  }

  /* ── Back button ── */
  view.querySelector('#counterBack').addEventListener('click', () => {
    history.back();
  });

  const resetSessionWithToast = () => {
    session = 0;
    updateUI();
    haptic(20);
    showToast(t('counter_clear'));
  };

  const resetSessionQuiet = () => {
    session = 0;
    updateUI();
  };

  view.querySelector('#counterRecordsBtn').addEventListener('click', () => {
    openHistory(view, data, {
      onDataChange: () => updateUI(),
      resetSessionWithToast,
      resetSessionQuiet,
    });
  });

  /* ── 回向 button ── */
  const huixiangBtn = view.querySelector('#counterHuixiang');
  if (huixiangBtn) {
    huixiangBtn.addEventListener('click', () => {
      showHuixiangSheet(view, data, session);
    });
  }

  /* ── 木鱼音效开关 ── */
  const muyuToggle = view.querySelector('#counterMuyuToggle');
  if (muyuToggle) {
    // 预加载音频
    _ensureMuyuLoaded();
    muyuToggle.addEventListener('click', async () => {
      const nowOn = !isMuyuEnabled();
      setMuyuPref(nowOn);
      muyuToggle.classList.toggle('counter-tool-icon--active', nowOn);
      haptic(15);
      if (nowOn) {
        if (!_muyuBuffer) {
          // First load: disable toggle until decode completes to avoid silent state
          muyuToggle.disabled = true;
          await _ensureMuyuLoaded();
          muyuToggle.disabled = false;
        }
        playMuyuSound();
      }
    });
  }

  /* ── 熄灯模式 ── */
  const dimmerToggle = view.querySelector('#counterDimmerToggle');
  if (dimmerToggle) {
    // 如果上次使用了熄灯模式，自动进入
    if (isDimmerEnabled()) enterDimmerMode(view, () => session, doCountCore);

    dimmerToggle.addEventListener('click', () => {
      setDimmerPref(true);
      dimmerToggle.classList.add('counter-tool-icon--active');
      enterDimmerMode(view, () => session, doCountCore);
    });
  }
}

/**
 * 熄灯模式 — 全黑屏幕，仅响应触摸计数，双指触退出
 */
function enterDimmerMode(counterView, getSession, doCount) {
  // Remove any existing dimmer
  counterView.querySelectorAll('.counter-dimmer').forEach(el => el.remove());

  const dimmer = document.createElement('div');
  dimmer.className = 'counter-dimmer';
  dimmer.innerHTML = `
    <div class="counter-dimmer__hint">双指轻触退出熄灯模式</div>
  `;
  const numDisplay = document.createElement('div');
  numDisplay.className = 'counter-dimmer__num';
  dimmer.appendChild(numDisplay);
  counterView.appendChild(dimmer);

  // Fade in
  requestAnimationFrame(() => dimmer.classList.add('counter-dimmer--active'));

  // Hide hint after 2s
  const hint = dimmer.querySelector('.counter-dimmer__hint');
  setTimeout(() => { if (hint) hint.style.opacity = '0'; }, 3000);

  const exitDimmer = () => {
    setDimmerPref(false);
    const toggle = counterView.querySelector('#counterDimmerToggle');
    if (toggle) toggle.classList.remove('counter-tool-icon--active');
    dimmer.classList.remove('counter-dimmer--active');
    setTimeout(() => dimmer.remove(), 300);
  };

  const spawnDimmerRipple = (x, y) => {
    const r = document.createElement('div');
    r.className = 'counter-dimmer__ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    dimmer.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  };

  // Single-finger tap to count; two-finger touch to exit
  // Use Pointer Events to avoid the touchend→click double-fire race.
  // A Set of active pointer IDs lets us detect multi-touch without touchstart.
  const activePointers = new Set();
  let dimmerStartX = 0;
  let dimmerStartY = 0;

  dimmer.addEventListener('pointerdown', (e) => {
    activePointers.add(e.pointerId);
    // Two or more simultaneous touches → exit dimmer mode
    if (activePointers.size >= 2) {
      e.preventDefault();
      activePointers.clear();
      exitDimmer();
      return;
    }
    dimmerStartX = e.clientX;
    dimmerStartY = e.clientY;
  }, { passive: false });

  dimmer.addEventListener('pointerup', (e) => {
    activePointers.delete(e.pointerId);
    // Skip if another pointer is still down (trailing finger after two-finger gesture)
    if (activePointers.size > 0) return;
    const dx = Math.abs(e.clientX - dimmerStartX);
    const dy = Math.abs(e.clientY - dimmerStartY);
    if (dx > 20 || dy > 20) return;
    e.preventDefault(); // suppress synthetic click
    spawnDimmerRipple(e.clientX, e.clientY);
    doCount();
    numDisplay.textContent = getSession();
    numDisplay.style.opacity = '1';
    clearTimeout(numDisplay.hideTid);
    numDisplay.hideTid = setTimeout(() => { numDisplay.style.opacity = '0'; }, 1000);
  });

  dimmer.addEventListener('pointercancel', (e) => {
    activePointers.delete(e.pointerId);
  });

  // Escape to exit
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      exitDimmer();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);
}

/**
 * 回向文沉浸展示（全屏）
 *
 * 次序：个人回向（若有）→ 莲池大师回向文 → 南无阿弥陀佛 →（可选）参与共修广场
 */
function showHuixiangDisplay(parentView, anotherVow) {
  parentView.querySelectorAll('.huixiang-display').forEach(el => el.remove());

  const display = document.createElement('div');
  display.className = 'huixiang-display';

  const personalLine = anotherVow
    ? `<div class="hd-personal">${escapeHtml(anotherVow)}</div>`
    : '';

  display.innerHTML = `
    <div class="hd-overlay">
      <div class="hd-content">
        <div class="hd-lotus">🪷</div>
        ${personalLine}
        <div class="hd-main-text">${HUIXIANG_TEXT.replace(/\n/g, '<br>')}</div>
        <div class="hd-namo">南无阿弥陀佛</div>
        <div class="hd-hint">点击其他区域关闭</div>
      </div>
    </div>`;
  parentView.appendChild(display);
  requestAnimationFrame(() => display.classList.add('huixiang-display--in'));

  const close = () => {
    display.classList.remove('huixiang-display--in');
    setTimeout(() => display.remove(), 400);
  };
  const autoClose = setTimeout(close, HUIXIANG_DISPLAY_AUTO_MS);

  display.querySelector('.hd-overlay').addEventListener('click', () => {
    clearTimeout(autoClose);
    close();
  });
}

/**
 * 回向 sheet
 *
 * 佛法依据（莲池大师西方发愿文）：
 *   - 回向文是修行的庄严结尾，以"同生极乐国"为最终归宿，不可省略
 *   - "另愿"为行者个人的愿心补充，附于回向文之后
 *     例：愿父母消灾延寿 · 愿XXX早日往生净土 · 愿一切众生皆得解脱
 *   - 回向文不因个人愿文而改变，所有功德仍归于"庄严佛净土，同生极乐国"
 */
function showHuixiangSheet(parentView, data, _session) {
  parentView.querySelectorAll('.huixiang-sheet').forEach(el => el.remove());

  const ps = getPracticeStats(data);
  const practiceName = escapeHtml(getPracticeDisplayName(data));
  const dailyCount = ps.daily;
  const savedVow = (get('preferences') || {}).huixiangAnotherVow || '';

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet huixiang-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="hxBackdrop"></div>
    <div class="counter-goal-panel huixiang-panel">

      <div class="hx-header">
        <div class="hx-title">合掌回向</div>
        <div class="hx-stats">${practiceName} · 今日 <strong>${formatCount(dailyCount)}</strong> 声</div>
      </div>

      <!-- 1. 个人回向（先填写，可选） -->
      <div class="hx-another-section">
        <div class="hx-section-label">
          回向
          <span class="hx-optional">可选</span>
        </div>
        <textarea class="hx-custom-input" id="hxAnotherVow" rows="2" maxlength="80"
                  placeholder="例：愿父母消灾延寿 · 愿XXX早日往生净土">${escapeHtml(savedVow)}</textarea>
      </div>

      <!-- 2. 回向文（固定，莲池大师，以"同生极乐国"作庄严收尾） -->
      <div class="hx-huixiang-preview">
        <div class="hx-section-label">回向文</div>
        <div class="hx-huixiang-text">${HUIXIANG_TEXT.replace(/\n/g, '<br>')}</div>
        <div class="hx-huixiang-attr">— 莲池大师</div>
      </div>

      <button class="hx-confirm-btn" id="hxConfirm">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        ${t('counter_huixiang_confirm')}
      </button>
      <button class="counter-goal-cancel" id="hxCancel">${t('counter_huixiang_skip')}</button>
    </div>`;

  parentView.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    window.removeEventListener('keydown', hxEsc);
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };
  const hxEsc = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', hxEsc);
  sheet.querySelector('#hxBackdrop').addEventListener('click', close);
  sheet.querySelector('#hxCancel').addEventListener('click', close);

  sheet.querySelector('#hxConfirm').addEventListener('click', () => {
    const anotherVow = sheet.querySelector('#hxAnotherVow')?.value.trim() || '';
    patch('preferences', { huixiangAnotherVow: anotherVow });
    close();
    setTimeout(() => showHuixiangDisplay(parentView, anotherVow), 260);
  });
}

/**
 * 每日功课目标选择器
 *
 * - 预设按钮：GOAL_PRESETS 列表（108 / 216 / 540 / 1080 / 3000 / 10000）
 * - 「我的功课」快捷按钮：若用户曾保存过自定义数量且不在预设中，额外显示
 * - 自定义输入框预填充上次保存的数量，便于快速修改
 * - 确认后将自定义数量持久化到统一 store
 */
function showGoalPicker(parentView, data, onDone) {
  parentView.querySelectorAll('.counter-goal-sheet').forEach(el => el.remove());

  const ps = getPracticeStats(data);
  const savedCustom = getSavedCustomGoal();
  const isCustomCurrent = ps.goal > 0 && !GOAL_PRESETS.includes(ps.goal);

  // If user has a saved custom goal not in standard presets, show it as extra button
  const myGoal = isCustomCurrent ? ps.goal : (savedCustom > 0 && !GOAL_PRESETS.includes(savedCustom) ? savedCustom : 0);
  const allBtns = myGoal ? [...GOAL_PRESETS, myGoal] : GOAL_PRESETS;

  // Pre-fill input: current custom goal OR saved custom
  const inputDefault = isCustomCurrent ? ps.goal : (savedCustom > 0 ? savedCustom : '');

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="goalBackdrop"></div>
    <div class="counter-goal-panel">
      <div class="counter-goal-panel-title">${t('counter_goal_hint')}</div>
      <div class="counter-goal-options">
        ${GOAL_PRESETS.map(g => `
          <button class="counter-goal-opt${ps.goal === g ? ' counter-goal-opt--active' : ''}" data-goal="${g}">${g}</button>
        `).join('')}
        ${myGoal ? `
          <button class="counter-goal-opt counter-goal-opt--my${ps.goal === myGoal ? ' counter-goal-opt--active' : ''}" data-goal="${myGoal}" style="grid-column:1/-1" title="我的自定义功课">
            我的：${formatCount(myGoal)} 声
          </button>
        ` : ''}
      </div>
      <div class="counter-goal-section-label">自定义功课数量</div>
      <div class="counter-goal-custom-row">
        <input class="counter-goal-custom-input" id="goalCustomInput" type="number" min="1"
               value="${inputDefault}" placeholder="${t('counter_goal_custom_hint')}">
        <button class="counter-goal-custom-btn" id="goalCustomConfirm">${t('counter_goal_custom_save')}</button>
      </div>
      <button class="counter-goal-cancel" id="goalCancel">${t('cancel')}</button>
    </div>
  `;
  parentView.appendChild(sheet);

  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    window.removeEventListener('keydown', sheetEscHandler);
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#goalBackdrop').addEventListener('click', close);
  sheet.querySelector('#goalCancel').addEventListener('click', close);
  const sheetEscHandler = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', sheetEscHandler);

  // Preset and custom-goal buttons
  sheet.querySelectorAll('.counter-goal-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      ps.goal = parseInt(btn.dataset.goal);
      patch('counter', data);
      haptic(15);
      onDone();
      close();
    });
  });

  // Custom input confirm — save number both to practice data and localStorage
  const confirmCustom = () => {
    const input = sheet.querySelector('#goalCustomInput');
    const val = parseInt(input.value);
    if (isNaN(val) || val < 1 || val > 999999) {
      input.classList.add('counter-goal-custom-input--error');
      showToast(t('counter_goal_invalid'));
      setTimeout(() => input.classList.remove('counter-goal-custom-input--error'), 600);
      return;
    }
    ps.goal = val;
    persistCustomGoal(val); // remember for next time
    patch('counter', data);
    haptic(15);
    onDone();
    close();
  };

  sheet.querySelector('#goalCustomConfirm').addEventListener('click', confirmCustom);
  sheet.querySelector('#goalCustomInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmCustom(); }
  });
}

/** Build a single practice-item row HTML */
function _buildPracticeItemHTML(name, isActive, isPreset) {
  const delBtn = isPreset ? '' :
    `<button class="practice-item-del" data-name="${escapeHtml(name)}" aria-label="删除">
       <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
     </button>`;
  return `
    <div class="practice-item${isActive ? ' practice-item--active' : ''}" data-name="${escapeHtml(name)}">
      <div class="practice-item-body">
        <span class="practice-item-name">${escapeHtml(name)}</span>
        ${isActive ? '<span class="practice-item-badge">当前</span>' : ''}
      </div>
      ${delBtn}
    </div>`;
}

function showPracticePicker(parentView, data, onDone) {
  parentView.querySelectorAll('.counter-practice-sheet').forEach(el => el.remove());

  const sheet = document.createElement('div');
  sheet.className = 'counter-practice-sheet';

  const renderSheetContent = () => {
    const allPractices = [
      ...PRACTICE_PRESETS.map(n => ({ name: n, isPreset: true })),
      ...data.customPractices.map(n => ({ name: n, isPreset: false })),
    ];
    return `
      <div class="counter-practice-backdrop" id="practiceBackdrop"></div>
      <div class="counter-practice-panel practice-picker-panel">
        <div class="counter-practice-panel-title">${t('counter_practice_title')}</div>

        <div class="practice-picker-list" id="practicePickerList">
          ${allPractices.map(({ name, isPreset }) =>
      _buildPracticeItemHTML(name, data.practice === name, isPreset)
    ).join('')}
        </div>

        <div class="practice-add-section" id="practiceAddSection">
          <div class="practice-add-input-row" id="practiceAddRow" style="display:none">
            <input class="counter-goal-custom-input" id="practiceNewInput" type="text"
                   maxlength="20" placeholder="${t('counter_custom_practice_hint')}">
            <button class="counter-goal-custom-btn" id="practiceNewConfirm">${t('counter_practice_custom_save')}</button>
          </div>
          <button class="practice-add-btn" id="practiceAddBtn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加自定义功课
          </button>
        </div>

        <button class="counter-goal-cancel" id="practiceCancel">${t('cancel')}</button>
      </div>`;
  };

  sheet.innerHTML = renderSheetContent();
  parentView.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('counter-practice-sheet--visible'));

  const close = () => {
    window.removeEventListener('keydown', practiceEscHandler);
    sheet.classList.remove('counter-practice-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };
  const practiceEscHandler = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', practiceEscHandler);

  const selectPractice = (name) => {
    data.practice = name;
    if (!data.practices[name]) {
      data.practices[name] = { total: 0, daily: 0, dailyDate: localTodayStr(), goal: 108 };
    }
    checkAndResetDaily(getPracticeStats(data));
    patch('counter', data);
    haptic(15);
    onDone();
    showToast(t('counter_practice_changed').replace('{name}', name));
    close();
  };

  const wireSheet = () => {
    const panel = sheet.querySelector('.counter-practice-panel');

    panel.querySelector('#practiceBackdrop')?.addEventListener('click', close);
    panel.querySelector('#practiceCancel')?.addEventListener('click', close);

    // Select a practice
    panel.querySelectorAll('.practice-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.practice-item-del')) return;
        selectPractice(item.dataset.name);
      });
    });

    // Delete a custom practice
    panel.querySelectorAll('.practice-item-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        if (!window.confirm(`删除「${name}」？其历史数据将保留。`)) return;
        data.customPractices = data.customPractices.filter(n => n !== name);
        if (data.practice === name) data.practice = PRACTICE_PRESETS[0];
        patch('counter', data);
        haptic(15);
        // Re-render sheet
        sheet.innerHTML = renderSheetContent();
        wireSheet();
        requestAnimationFrame(() => sheet.classList.add('counter-practice-sheet--visible'));
      });
    });

    // Add button
    const addBtn = panel.querySelector('#practiceAddBtn');
    const addRow = panel.querySelector('#practiceAddRow');
    if (addBtn && addRow) {
      addBtn.addEventListener('click', () => {
        addBtn.style.display = 'none';
        addRow.style.display = 'flex';
        panel.querySelector('#practiceNewInput')?.focus();
      });
    }

    // Confirm new custom practice
    const confirmNew = () => {
      const input = panel.querySelector('#practiceNewInput');
      if (!input) return;
      const val = input.value.trim();
      if (!val) {
        showToast(t('counter_practice_custom_empty'));
        input.classList.add('counter-goal-custom-input--error');
        setTimeout(() => input.classList.remove('counter-goal-custom-input--error'), 600);
        return;
      }
      if (val.length > 20) {
        showToast(t('counter_practice_custom_too_long'));
        input.classList.add('counter-goal-custom-input--error');
        setTimeout(() => input.classList.remove('counter-goal-custom-input--error'), 600);
        return;
      }
      if ([...PRACTICE_PRESETS, ...data.customPractices].includes(val)) {
        showToast('该功课已存在');
        return;
      }
      data.customPractices.push(val);
      data.customPractice = val; // keep legacy field in sync
      patch('counter', data);
      selectPractice(val);
    };

    panel.querySelector('#practiceNewConfirm')?.addEventListener('click', confirmNew);
    panel.querySelector('#practiceNewInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmNew(); }
    });
  };

  wireSheet();
}

/* ===== History View — 日历视图 ===== */
// formatCount is imported from utils.js

const WDS = ['日', '一', '二', '三', '四', '五', '六'];

function mkDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function todayDateStr() { return mkDateStr(new Date()); }

/** 日历格中声数的紧凑格式（需在小格子里显示） */
function fmtCalCount(n) {
  if (!n || n <= 0) return '';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/** 计算某月的总声数 */
function calcMonthTotal(log, year, month) {
  let total = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = log[ds] || {};
    total += Object.values(dayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }
  return total;
}

/** 构建某年月的日历格 HTML */
function buildCalendarGrid(data, year, month) {
  const log = data.dailyLog || {};
  const goal = (data.practices?.[data.practice]?.goal) || 108;
  const todayStr = todayDateStr();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun

  const cells = [];
  // Leading empty cells
  for (let i = 0; i < startDow; i++) cells.push({ type: 'pad' });

  for (let d = 1; d <= totalDays; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isFuture = ds > todayStr;
    const isToday = ds === todayStr;
    const dayData = log[ds] || {};
    const total = Object.values(dayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    cells.push({ type: 'day', d, ds, total, isFuture, isToday, goalDone: goal > 0 && total >= goal });
  }

  return cells.map(c => {
    if (c.type === 'pad') return `<div class="chi-cal-pad"></div>`;
    const cls = ['chi-cal-cell'];
    if (c.total > 0) cls.push('chi-cal-cell--active');
    if (c.goalDone) cls.push('chi-cal-cell--goal');
    if (c.isToday) cls.push('chi-cal-cell--today');
    if (c.isFuture) cls.push('chi-cal-cell--future');
    return `<div class="${cls.join(' ')}" data-date="${c.ds}">
      <span class="chi-cal-day">${c.d}</span>
      ${c.total > 0 ? `<span class="chi-cal-count">${fmtCalCount(c.total)}</span>` : ''}
    </div>`;
  }).join('');
}

const CHI_CHEVRON = '<svg class="chi-tool-chevron" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

/** 构建完整历史面板 HTML（日历视图） */
function buildHistoryHTML(data, year, month) {
  const todayStr = todayDateStr();
  const log = data.dailyLog || {};
  const streak = getStreak(data);

  // 累计总声数
  let grandTotal = 0;
  for (const dd of Object.values(log)) {
    grandTotal += Object.values(dd).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }
  const todayData = log[todayStr] || {};
  const todayTotal = Object.values(todayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  const monthTotal = calcMonthTotal(log, year, month);
  const monthLabel = `${year}年${month}月`;

  const now = new Date();
  const canGoNext = !(year === now.getFullYear() && month === now.getMonth() + 1);

  const gridHtml = buildCalendarGrid(data, year, month);
  const dayHdrs = WDS.map(w => `<div class="chi-cal-wday">${w}</div>`).join('');

  const psProg = getPracticeStats(data);
  const progGoal = psProg.goal > 0 ? psProg.goal : 108;
  const progPct = progGoal > 0 ? Math.min(100, Math.round(psProg.daily / progGoal * 100)) : 0;
  const progDone = progGoal > 0 && psProg.daily >= progGoal;
  const progName = escapeHtml(getPracticeDisplayName(data));

  return `
    <div class="ch-header">
      <button class="btn-icon" id="chBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="ch-title">${t('counter_records')}</span>
      <button class="btn-icon" id="chBuluBtn" title="补录" aria-label="补录过去的念佛声数">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="ch-body">
      <!-- 三格统计 -->
      <div class="chi-top-stats">
        <div class="chi-top-item">
          <div class="chi-top-val" id="chiGrand">${formatCount(grandTotal)}</div>
          <div class="chi-top-lbl">${t('counter_total')}</div>
        </div>
        <div class="chi-top-divider"></div>
        <div class="chi-top-item">
          <div class="chi-top-val" id="chiToday">${formatCount(todayTotal)}</div>
          <div class="chi-top-lbl">${t('counter_daily')}</div>
        </div>
        <div class="chi-top-divider"></div>
        <div class="chi-top-item">
          <div class="chi-top-val" id="chiStreak">${streak}</div>
          <div class="chi-top-lbl">${t('counter_consecutive_label')}</div>
        </div>
      </div>

      <!-- 当前法门 · 今日功课进度（仅在此面板展示，首页保持极简） -->
      <div class="chi-practice-card" id="chiPracticeProgress">
        <div class="chi-practice-card-label">${t('counter_honor_caption')}</div>
        <div class="chi-practice-card-name" id="chiProgName">${progName}</div>
        <div class="chi-practice-card-stats">
          <span class="chi-practice-stat">${t('counter_daily')} <strong id="chiProgDaily">${formatCount(psProg.daily)}</strong></span>
          <span class="chi-practice-stat chi-practice-stat--goal">
            <span id="chiProgCheck" class="chi-practice-check" aria-hidden="true">${progDone ? '\u2713 ' : ''}</span>
            ${t('counter_goal')} <strong id="chiProgGoal">${formatCount(progGoal)}</strong>
          </span>
        </div>
        <div class="chi-practice-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progPct}" aria-label="${t('counter_tool_goal')}">
          <div class="chi-practice-bar-fill${progDone ? ' chi-practice-bar-fill--done' : ''}" id="chiProgBar" style="width:${progPct}%"></div>
        </div>
      </div>

      <!-- 月导航 -->
      <div class="chi-month-nav">
        <button class="chi-nav-btn" id="chPrevMonth" aria-label="上月">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div class="chi-month-info">
          <span class="chi-month-nav-lbl" id="chiMonthLabel">${monthLabel}</span>
          ${monthTotal > 0 ? `<span class="chi-month-nav-total" id="chiMonthTotal">${formatCount(monthTotal)} 声</span>` : `<span class="chi-month-nav-total" id="chiMonthTotal"></span>`}
        </div>
        <button class="chi-nav-btn${canGoNext ? '' : ' chi-nav-btn--disabled'}" id="chNextMonth" aria-label="下月" ${canGoNext ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9,18 15,12 9,6"/></svg>
        </button>
      </div>

      <!-- 日历格 -->
      <div class="chi-cal-wrap">
        <div class="chi-cal-wdays">${dayHdrs}</div>
        <div class="chi-cal-grid" id="chiCalGrid">${gridHtml}</div>
      </div>

      <!-- 图例 -->
      <div class="chi-legend">
        <span class="chi-legend-dot chi-legend-dot--none"></span><span class="chi-legend-lbl">${t('counter_cal_legend_none')}</span>
        <span class="chi-legend-dot chi-legend-dot--partial"></span><span class="chi-legend-lbl">${t('counter_cal_legend_partial')}</span>
        <span class="chi-legend-dot chi-legend-dot--goal"></span><span class="chi-legend-lbl">${t('counter_cal_legend_goal')}</span>
      </div>

      <section class="chi-tools-section" aria-label="${t('counter_tools_heading')}">
        <h3 class="chi-tools-heading">${t('counter_tools_heading')}</h3>
        <div class="chi-tools-list">
          <button type="button" class="chi-tool-row" id="chToolGoal">
            <span class="chi-tool-label">${t('counter_tool_goal')}</span>
            ${CHI_CHEVRON}
          </button>
          <button type="button" class="chi-tool-row" id="chToolPractice">
            <span class="chi-tool-label">${t('counter_tool_practice')}</span>
            ${CHI_CHEVRON}
          </button>
          <button type="button" class="chi-tool-row" id="chToolShare">
            <span class="chi-tool-label">${t('counter_tool_share')}</span>
            ${CHI_CHEVRON}
          </button>
          <button type="button" class="chi-tool-row" id="chToolClear">
            <span class="chi-tool-label">${t('counter_tool_clear_session')}</span>
            ${CHI_CHEVRON}
          </button>
          <button type="button" class="chi-tool-row chi-tool-row--danger" id="chToolReset">
            <span class="chi-tool-label">${t('counter_tool_reset_all')}</span>
            ${CHI_CHEVRON}
          </button>
        </div>
      </section>
    </div>`;
}

/**
 * 补录 sheet — 为某日追加念佛声数
 *
 * @param {HTMLElement} parentView
 * @param {Object}      data       counter 数据
 * @param {Function}    onDone     保存后刷新回调
 * @param {string|null} fixedDate  YYYY-MM-DD；有值时直接显示该日期，无需选择；
 *                                  null 时显示日期下拉选择（最近30天）
 */
function showBuluSheet(parentView, data, onDone, fixedDate = null) {
  parentView.querySelectorAll('.bulu-sheet').forEach(el => el.remove());

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const practices = [...PRACTICE_PRESETS, ...(data.customPractices || [])];

  // 当 fixedDate 有值时，计算该日已有的记录（显示为提示）
  let existingInfo = '';
  let dateLabel = '';
  if (fixedDate) {
    const existing = data.dailyLog?.[fixedDate] || {};
    const parts = Object.entries(existing).filter(([, v]) => v > 0);
    if (parts.length > 0) {
      existingInfo = parts.map(([k, v]) => `${k} ${formatCount(v)}声`).join('、');
    }
    const [y, m, d] = fixedDate.split('-').map(Number);
    const diff = Math.round((today - new Date(y, m - 1, d)) / 86400000);
    dateLabel = diff === 0 ? '今天' : diff === 1 ? '昨天' : `${m}月${d}日`;
  }

  // 日期选项（fixedDate 为 null 时使用）
  const dateOptions = fixedDate ? [] : Array.from({ length: 31 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = mkDateStr(d);
    const label = i === 0 ? '今天' : i === 1 ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日`;
    return { dateStr: ds, label };
  });

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet bulu-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="buluBackdrop"></div>
    <div class="counter-goal-panel" style="gap:14px">
      <div class="counter-goal-panel-title">记录念佛</div>

      ${fixedDate ? `
        <!-- 固定日期展示 -->
        <div class="bulu-date-badge">
          <span class="bulu-date-name">${dateLabel}</span>
          <span class="bulu-date-existing">${existingInfo ? '已记录：' + escapeHtml(existingInfo) : '尚无记录'}</span>
        </div>
      ` : `
        <div>
          <div class="counter-goal-section-label">日期</div>
          <select class="counter-goal-custom-input" id="buluDate" style="cursor:pointer">
            ${dateOptions.map(o => `<option value="${o.dateStr}">${o.label}</option>`).join('')}
          </select>
        </div>
      `}

      <div>
        <div class="counter-goal-section-label">功课</div>
        <select class="counter-goal-custom-input" id="buluPractice" style="cursor:pointer">
          ${practices.map(p => `<option value="${escapeHtml(p)}"${p === data.practice ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
      </div>

      <div>
        <div class="counter-goal-section-label">${existingInfo ? '追加声数' : '声数'}</div>
        <div class="counter-goal-custom-row">
          <input class="counter-goal-custom-input" id="buluCount" type="number" min="1"
                 placeholder="请输入声数" inputmode="numeric">
          <button class="counter-goal-custom-btn" id="buluConfirm">保存</button>
        </div>
      </div>

      <button class="counter-goal-cancel" id="buluCancel">${t('cancel')}</button>
    </div>`;

  parentView.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#buluBackdrop').addEventListener('click', close);
  sheet.querySelector('#buluCancel').addEventListener('click', close);
  setTimeout(() => sheet.querySelector('#buluCount').focus(), 300);

  const confirm = () => {
    const dateStr = fixedDate || sheet.querySelector('#buluDate').value;
    const practice = sheet.querySelector('#buluPractice').value;
    const count = parseInt(sheet.querySelector('#buluCount').value);
    if (isNaN(count) || count < 1) {
      sheet.querySelector('#buluCount').classList.add('counter-goal-custom-input--error');
      showToast('请输入有效的正整数');
      setTimeout(() => sheet.querySelector('#buluCount').classList.remove('counter-goal-custom-input--error'), 600);
      return;
    }

    if (!data.dailyLog) data.dailyLog = {};
    if (!data.dailyLog[dateStr]) data.dailyLog[dateStr] = {};
    data.dailyLog[dateStr][practice] = (data.dailyLog[dateStr][practice] || 0) + count;

    if (!data.practices[practice]) {
      data.practices[practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    }
    data.practices[practice].total += count;

    if (dateStr === todayDateStr()) {
      data.practices[practice].daily = (data.practices[practice].daily || 0) + count;
      data.practices[practice].dailyDate = dateStr;
    }

    patch('counter', data);
    haptic(15);
    showToast(`${escapeHtml(practice)} ${formatCount(count)}声 已记录`);
    close();
    onDone();
  };

  sheet.querySelector('#buluConfirm').addEventListener('click', confirm);
  sheet.querySelector('#buluCount').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
  });
}

/** Open / refresh the history slide-in panel (calendar view) */
export function openHistory(counterView, data, hooks = {}) {
  const onDataChange = typeof hooks.onDataChange === 'function' ? hooks.onDataChange : () => { };
  const resetSessionWithToast = typeof hooks.resetSessionWithToast === 'function' ? hooks.resetSessionWithToast : () => { };
  const resetSessionQuiet = typeof hooks.resetSessionQuiet === 'function' ? hooks.resetSessionQuiet : () => { };

  counterView.querySelectorAll('.counter-history').forEach(el => el.remove());

  const now = new Date();
  let curYear = now.getFullYear();
  let curMonth = now.getMonth() + 1;

  const hist = document.createElement('div');
  hist.className = 'counter-history';
  hist.innerHTML = buildHistoryHTML(data, curYear, curMonth);
  counterView.appendChild(hist);
  requestAnimationFrame(() => hist.classList.add('counter-history--in'));

  /** Re-render just the calendar grid + month header after data changes */
  const refreshCalendar = () => {
    const grid = hist.querySelector('#chiCalGrid');
    if (grid) grid.innerHTML = buildCalendarGrid(data, curYear, curMonth);

    const monthTotal = calcMonthTotal(data.dailyLog || {}, curYear, curMonth);
    const totalEl = hist.querySelector('#chiMonthTotal');
    if (totalEl) totalEl.textContent = monthTotal > 0 ? `${formatCount(monthTotal)} 声` : '';

    // Refresh top stats
    const log = data.dailyLog || {};
    let grand = 0;
    for (const dd of Object.values(log)) {
      grand += Object.values(dd).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    }
    const ts = todayDateStr();
    const td = Object.values(log[ts] || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    const gEl = hist.querySelector('#chiGrand'); if (gEl) gEl.textContent = formatCount(grand);
    const tEl = hist.querySelector('#chiToday'); if (tEl) tEl.textContent = formatCount(td);
    const sEl = hist.querySelector('#chiStreak'); if (sEl) sEl.textContent = getStreak(data);

    const ps = getPracticeStats(data);
    const g = ps.goal > 0 ? ps.goal : 108;
    const pct = g > 0 ? Math.min(100, Math.round(ps.daily / g * 100)) : 0;
    const done = g > 0 && ps.daily >= g;
    const nEl = hist.querySelector('#chiProgName');
    if (nEl) nEl.textContent = getPracticeDisplayName(data);
    const dEl = hist.querySelector('#chiProgDaily');
    if (dEl) dEl.textContent = formatCount(ps.daily);
    const goalEl = hist.querySelector('#chiProgGoal');
    if (goalEl) goalEl.textContent = formatCount(g);
    const chk = hist.querySelector('#chiProgCheck');
    if (chk) chk.textContent = done ? '\u2713 ' : '';
    const bar = hist.querySelector('#chiProgBar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.classList.toggle('chi-practice-bar-fill--done', done);
    }
    const barWrap = hist.querySelector('#chiPracticeProgress .chi-practice-bar');
    if (barWrap) {
      barWrap.setAttribute('aria-valuenow', String(pct));
    }
  };

  /** Navigate to a different month and re-render */
  const goToMonth = (y, m) => {
    curYear = y; curMonth = m;
    const now2 = new Date();
    const canNext = !(y === now2.getFullYear() && m === now2.getMonth() + 1);
    const lbl = hist.querySelector('#chiMonthLabel');
    if (lbl) lbl.textContent = `${y}年${m}月`;
    const nextBtn = hist.querySelector('#chNextMonth');
    if (nextBtn) { nextBtn.disabled = !canNext; nextBtn.classList.toggle('chi-nav-btn--disabled', !canNext); }
    refreshCalendar();
  };

  hist.querySelector('#chBack').addEventListener('click', () => {
    hist.classList.remove('counter-history--in');
    setTimeout(() => hist.remove(), 320);
  });

  // [+] 按钮：通用补录（带日期选择）
  hist.querySelector('#chBuluBtn').addEventListener('click', () => {
    showBuluSheet(hist, data, refreshCalendar, null);
  });

  // 日历格点击 → 直接为该日补录（过去/今天有效，未来忽略）
  hist.querySelector('#chiCalGrid').addEventListener('click', e => {
    const cell = e.target.closest('.chi-cal-cell');
    if (!cell || cell.classList.contains('chi-cal-cell--future')) return;
    const dateStr = cell.dataset.date;
    if (dateStr) showBuluSheet(hist, data, refreshCalendar, dateStr);
  });

  hist.querySelector('#chPrevMonth').addEventListener('click', () => {
    let y = curYear, m = curMonth - 1;
    if (m < 1) { m = 12; y--; }
    goToMonth(y, m);
  });

  hist.querySelector('#chNextMonth').addEventListener('click', () => {
    const now2 = new Date();
    if (curYear === now2.getFullYear() && curMonth === now2.getMonth() + 1) return;
    let y = curYear, m = curMonth + 1;
    if (m > 12) { m = 1; y++; }
    goToMonth(y, m);
  });

  hist.querySelector('#chToolGoal')?.addEventListener('click', () => {
    showGoalPicker(counterView, data, () => {
      onDataChange();
      refreshCalendar();
    });
  });

  hist.querySelector('#chToolPractice')?.addEventListener('click', () => {
    showPracticePicker(counterView, data, () => {
      resetSessionQuiet();
      onDataChange();
      refreshCalendar();
    });
  });

  hist.querySelector('#chToolShare')?.addEventListener('click', () => {
    const ps = getPracticeStats(data);
    import('./share-panel.js').then(mod => {
      mod.showSharePanel({
        type: 'practice',
        title: getPracticeDisplayName(data),
        url: window.location.href.split('#')[0] + '#nianfo',
        count: ps.daily || 0,
        totalCount: ps.total || 0,
        practice: getPracticeDisplayName(data),
      });
    });
  });

  hist.querySelector('#chToolClear')?.addEventListener('click', () => {
    resetSessionWithToast();
  });

  hist.querySelector('#chToolReset')?.addEventListener('click', () => {
    if (!window.confirm(t('counter_reset_confirm'))) return;
    resetAllCounterData(data);
    haptic(30);
    resetSessionQuiet();
    onDataChange();
    refreshCalendar();
    showToast(t('counter_reset_all'));
  });
}

/* ── 独立页面模式初始化 ── */
export function initCounterStandalone(container) {
  const data = getCounterData();

  // 构建页面内容（直接渲染，不使用覆盖层）
  container.innerHTML = buildCounterHTML(data, 0);
  container.classList.add('counter-view', 'counter-view--visible');
  document.body.setAttribute('data-counter-active', '');

  // Wake Lock
  requestWakeLock();

  const visHandler = () => {
    if (document.visibilityState === 'visible') requestWakeLock();
    else if (document.visibilityState === 'hidden') releaseWakeLock();
  };
  document.addEventListener('visibilitychange', visHandler);

  // wireCounterEvents 会绑定 #counterBack (history.back)
  // 和 #counterRecordsBtn (openHistory) 及 #counterHuixiang 等全部按钮
  wireCounterEvents(container, data, 0);
}
