/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { get, patch } from './store.js';
import { haptic, showToast, escapeHtml, formatCount, HUIXIANG_TEXT } from './utils.js';
const BEADS_PER_LOOP = 108;
/** @deprecated Kept only for data migration from old single-custom format */
const CUSTOM_KEY = '__custom__';
const MAX_RIPPLES = 6;
const MAX_CUSTOM_PRACTICES = 5;

/** Built-in presets — always present, cannot be removed */
const PRACTICE_PRESETS = ['南无阿弥陀佛', '阿弥陀佛'];

// HUIXIANG_TEXT and formatCount are imported from utils.js

/** Standard daily practice goal presets (all have Buddhist significance) */
const GOAL_PRESETS = [108, 216, 540, 1080, 3000, 10000];

/** localStorage key for the user's last saved custom goal */
const CUSTOM_GOAL_KEY = 'counter-custom-goal';

function getSavedCustomGoal() {
  try { return parseInt(localStorage.getItem(CUSTOM_GOAL_KEY)) || 0; } catch { return 0; }
}
function persistCustomGoal(val) {
  try { localStorage.setItem(CUSTOM_GOAL_KEY, String(val)); } catch { }
}

/* ── Helpers ── */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* Return the per-practice stats object for the current practice */
function getPracticeStats(data) {
  if (!data.practices[data.practice]) {
    data.practices[data.practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
  }
  return data.practices[data.practice];
}

/* Reset daily count if it's a new day; returns true if reset occurred */
function checkAndResetDaily(ps) {
  const today = todayStr();
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

/* ── Daily log helpers ── */
function recordDailyLog(data, practice, count) {
  if (!data.dailyLog) data.dailyLog = {};
  const today = todayStr();
  if (!data.dailyLog[today]) data.dailyLog[today] = {};
  if (!data.dailyLog[today][practice]) data.dailyLog[today][practice] = 0;
  data.dailyLog[today][practice] += count;
}

/* Calculate streak: consecutive days (including today) with any practice logged */
function getStreak(data) {
  if (!data.dailyLog) return 0;
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 9999; i++) {
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
const WAKELOCK_PREF_KEY = 'counter-wakelock-pref';

function isWakeLockEnabled() {
  try { return localStorage.getItem(WAKELOCK_PREF_KEY) !== 'off'; } catch { return true; }
}
function setWakeLockPref(on) {
  try { localStorage.setItem(WAKELOCK_PREF_KEY, on ? 'on' : 'off'); } catch { }
}

async function requestWakeLock() {
  if (!isWakeLockEnabled()) return;
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

/**
 * Migrate legacy single-custom-practice format to the new customPractices array.
 * Also upgrades old '自定义' and '__custom__' keys to actual practice names.
 */
function migrateToCustomPractices(data) {
  let changed = false;

  // 1. Migrate very old '自定义' key (pre-CUSTOM_KEY era)
  if (data.practices && data.practices['自定义']) {
    const name = data.customPractice || '自定义';
    if (!data.practices[name] || data.practices[name].total === 0) {
      data.practices[name] = data.practices['自定义'];
    }
    delete data.practices['自定义'];
    if (data.practice === '自定义') data.practice = name;
    changed = true;
  }

  // 2. Migrate CUSTOM_KEY ('__custom__') to actual practice name
  if (data.practices && data.practices[CUSTOM_KEY] && data.customPractice) {
    if (!data.practices[data.customPractice] || data.practices[data.customPractice].total === 0) {
      data.practices[data.customPractice] = data.practices[CUSTOM_KEY];
    }
    delete data.practices[CUSTOM_KEY];
    changed = true;
  } else if (data.practices && data.practices[CUSTOM_KEY]) {
    // No customPractice name saved — just drop the orphan key
    delete data.practices[CUSTOM_KEY];
    changed = true;
  }
  if (data.practice === CUSTOM_KEY) {
    data.practice = data.customPractice || PRACTICE_PRESETS[0];
    changed = true;
  }

  // 3. Migrate from single customPractice string to customPractices array
  if (!Array.isArray(data.customPractices)) {
    data.customPractices = [];
    if (data.customPractice && !PRACTICE_PRESETS.includes(data.customPractice)) {
      data.customPractices.push(data.customPractice);
    }
    changed = true;
  }

  return changed;
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

  // Run all migrations
  if (migrateToCustomPractices(data)) shouldPersist = true;

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

/* ── Main render ── */
export function openCounter() {
  // Remove existing counter view if present
  document.querySelectorAll('.counter-view').forEach(el => {
    if (typeof el.__counterCleanup === 'function') {
      el.__counterCleanup({ skipAnimation: true, skipNavigation: true });
    } else {
      el.remove();
    }
  });

  const sourceTab = document.querySelector('.tab.active')?.dataset.tab || 'mypage';

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
  const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
  const goalDone = ps.goal > 0 && ps.daily >= ps.goal;
  const displayName = escapeHtml(getPracticeDisplayName(data));
  const streak = getStreak(data);

  const wakeLockOn = isWakeLockEnabled();
  return `
    <div class="counter-header">
      <button class="counter-back btn-icon" id="counterBack" aria-label="${t('wenku_back')}">
        <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="counter-header-title">${t('counter_title')}</span>
      <button class="btn-icon counter-wakelock-btn${wakeLockOn ? ' active' : ''}" id="counterWakeLockBtn"
              aria-label="${wakeLockOn ? '屏幕保持点亮（点击关闭）' : '屏幕将按系统设置自动熄灭（点击开启常亮）'}"
              title="${wakeLockOn ? '屏幕常亮' : '屏幕按系统设置自动熄灭'}">
        ${wakeLockOn
          ? `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
          : `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
        }
      </button>
      <button class="btn-icon" id="counterHistoryBtn" aria-label="念佛历史" title="念佛历史">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <polyline points="12,7 12,12 15.5,14"/>
        </svg>
      </button>
      <button class="counter-menu btn-icon" id="counterMenu" aria-label="${t('more')}">
        <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
      </button>
    </div>

    <div class="counter-body">
      <!-- Practice name (outside tap area for reverence) -->
      <div class="counter-practice-name" id="counterPracticeName">${displayName}</div>

      <!-- Main tap button -->
      <div class="counter-tap-area" id="counterTapArea" role="button" tabindex="0"
           aria-label="${t('counter_tap_hint')}">
        <!-- Outer ring glow -->
        <div class="counter-ring counter-ring--outer"></div>
        <!-- Bead progress ring -->
        <svg class="counter-progress-svg" viewBox="0 0 200 200" id="counterProgressSvg">
          <circle class="counter-progress-bg" cx="100" cy="100" r="88"/>
          <circle class="counter-progress-fill" id="counterProgressFill" cx="100" cy="100" r="88"
            stroke-dasharray="${Math.round(2 * Math.PI * 88)}"
            stroke-dashoffset="${Math.round(2 * Math.PI * 88 * (1 - beadPos / BEADS_PER_LOOP))}"/>
        </svg>
        <!-- Inner circle -->
        <div class="counter-lotus-wrap">
          <!-- Count number -->
          <div class="counter-number" id="counterNumber">${session}</div>
          <div class="counter-hint" id="counterHint">${t('counter_tap_hint')}</div>
        </div>
        <!-- Ripple container -->
        <div class="counter-ripples" id="counterRipples"></div>
      </div>

      <!-- Daily progress bar -->
      <div class="counter-daily-wrap">
        <div class="counter-daily-row">
          <span class="counter-daily-lbl">${t('counter_daily')}: <strong id="ctrDaily">${ps.daily}</strong></span>
          <span class="counter-daily-goal" id="ctrGoalLabel">${goalDone ? '&#10003; ' : ''}${t('counter_goal')}: <span id="ctrGoalVal">${ps.goal}</span></span>
        </div>
        <div class="counter-progress-bar">
          <div class="counter-progress-bar-fill${goalDone ? ' counter-progress-bar-fill--done' : ''}"
               id="ctrGoalBar" style="width:${goalPct}%"></div>
        </div>
        ${streak > 1 ? `<div class="counter-streak" id="counterStreak">${t('counter_streak').replace('{n}', streak)}</div>` : '<div class="counter-streak" id="counterStreak" style="display:none"></div>'}
      </div>
    </div>

    <!-- Bottom actions -->
    <div class="counter-actions">
      <button class="counter-action-btn counter-action-btn--clear" id="counterResetSession">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        ${t('counter_clear')}
      </button>
      <button class="counter-action-btn counter-action-btn--huixiang" id="counterHuixiang">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/>
          <path d="M16 12l4 4-4 4"/>
          <path d="M20 16H9a4 4 0 0 1 0-8h2"/>
        </svg>
        ${t('counter_huixiang')}
      </button>
      <button class="counter-action-btn counter-action-btn--goal" id="counterSetGoal">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
        </svg>
        ${t('counter_gongke')}
      </button>
    </div>

    <!-- Namo footer -->
    <div class="counter-namo">${t('counter_namo')}</div>
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
    const targetTab = document.querySelector(`.tab[data-tab="${sourceTab}"]`) || document.querySelector('.tab[data-tab="mypage"]');
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
    daily: view.querySelector('#ctrDaily'),
    bar: view.querySelector('#ctrGoalBar'),
    goalLabel: view.querySelector('#ctrGoalLabel'),
    goalVal: view.querySelector('#ctrGoalVal'),
    progressFill: view.querySelector('#counterProgressFill'),
    hint: view.querySelector('#counterHint'),
    practice: view.querySelector('#counterPracticeName'),
    ripples: view.querySelector('#counterRipples'),
    streak: view.querySelector('#counterStreak'),
  };

  /* ── Full UI update (settings change, loop complete, goal done, reset) ── */
  function updateUI(bump = false) {
    const ps = getPracticeStats(data);
    const beadPos = ps.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));
    const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
    const goalDone = ps.goal > 0 && ps.daily >= ps.goal;

    if (els.number) {
      els.number.textContent = session;
      if (bump) {
        els.number.classList.add('counter-number--bump');
        setTimeout(() => els.number.classList.remove('counter-number--bump'), 180);
      }
    }
    if (els.daily) els.daily.textContent = ps.daily;
    if (els.bar) { els.bar.style.width = goalPct + '%'; els.bar.classList.toggle('counter-progress-bar-fill--done', goalDone); }
    if (els.goalLabel && els.goalVal) { els.goalLabel.firstChild.textContent = (goalDone ? '\u2713 ' : '') + t('counter_goal') + ': '; els.goalVal.textContent = ps.goal; }
    if (els.progressFill) els.progressFill.style.strokeDashoffset = offset;
    if (els.hint) els.hint.style.display = session > 0 ? 'none' : '';
    if (els.practice) els.practice.textContent = getPracticeDisplayName(data);

    // Update streak display
    const streak = getStreak(data);
    if (els.streak) {
      if (streak > 1) {
        els.streak.textContent = t('counter_streak').replace('{n}', streak);
        els.streak.style.display = '';
      } else {
        els.streak.style.display = 'none';
      }
    }
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
    if (els.daily) els.daily.textContent = ps.daily;
    if (els.bar) {
      const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
      els.bar.style.width = goalPct + '%';
    }
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

  /* ── Tap count (unified pointer handling to prevent double-fire) ── */
  const tapArea = view.querySelector('#counterTapArea');
  if (tapArea) {
    let touchHandled = false;

    const doCount = (cx, cy) => {
      haptic(30);
      session++;
      const ps = getPracticeStats(data);
      checkAndResetDaily(ps);
      ps.total++;
      ps.daily++;
      ps.dailyDate = todayStr();

      // Record to daily log — data.practice is now always the actual display name
      recordDailyLog(data, data.practice, 1);

      patch('counter', data);

      // Spawn ripple at tap position
      spawnRipple(cx, cy);

      const goalJustDone = ps.goal > 0 && ps.daily === ps.goal;
      if (goalJustDone) {
        haptic(60);
        showToast(t('counter_daily_done'));
        updateUI(true);
        return;
      }

      updateUIFast(true);
    };

    // Track touch start position to distinguish taps from swipes
    let touchStartX = 0;
    let touchStartY = 0;
    tapArea.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    tapArea.addEventListener('touchend', (e) => {
      // If touch data is unavailable, fall back
      if (!e.changedTouches || !e.changedTouches[0]) {
        e.preventDefault();
        touchHandled = true;
        doCount(0, 0);
        return;
      }
      // If the touch moved more than 20px it's a swipe — let the browser handle it
      const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dx > 20 || dy > 20) return;
      e.preventDefault();
      touchHandled = true;
      doCount(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: false });

    tapArea.addEventListener('click', (e) => {
      // Skip if already handled by touchend (prevents double-count on touch devices)
      if (touchHandled) {
        touchHandled = false;
        return;
      }
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

  /* ── 清零 (reset session) ── */
  view.querySelector('#counterResetSession').addEventListener('click', () => {
    session = 0;
    updateUI();
    haptic(20);
    showToast(t('counter_clear'));
  });

  /* ── 今日功课 (set goal) ── */
  view.querySelector('#counterSetGoal').addEventListener('click', () => {
    showGoalPicker(view, data, () => updateUI());
  });

  /* ── Wake lock toggle ── */
  const wakeLockBtn = view.querySelector('#counterWakeLockBtn');
  if (wakeLockBtn) {
    wakeLockBtn.addEventListener('click', () => {
      const nowOn = !isWakeLockEnabled();
      setWakeLockPref(nowOn);
      if (nowOn) {
        requestWakeLock();
        showToast('屏幕常亮已开启');
      } else {
        releaseWakeLock();
        showToast('屏幕将按系统设置自动熄灭');
      }
      // Update button appearance without full re-render
      wakeLockBtn.classList.toggle('active', nowOn);
      wakeLockBtn.setAttribute('title', nowOn ? '屏幕常亮' : '屏幕自动熄灭');
      wakeLockBtn.innerHTML = nowOn
        ? `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
        : `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      haptic(15);
    });
  }

  /* ── History button ── */
  const histBtn = view.querySelector('#counterHistoryBtn');
  if (histBtn) {
    histBtn.addEventListener('click', () => openHistory(view, data));
  }

  /* ── 回向 button ── */
  const huixiangBtn = view.querySelector('#counterHuixiang');
  if (huixiangBtn) {
    huixiangBtn.addEventListener('click', () => {
      showHuixiangSheet(view, data, session);
    });
  }

  /* ── Menu button → combined sheet: practice picker + reset all ── */
  view.querySelector('#counterMenu').addEventListener('click', () => {
    showCounterMenu(view, data, () => { session = 0; updateUI(); });
  });
}

/* ── Counter menu sheet (practice + reset) ── */
function showCounterMenu(parentView, data, onPracticeChange) {
  parentView.querySelectorAll('.counter-menu-sheet').forEach(el => el.remove());

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet counter-menu-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="menuBackdrop"></div>
    <div class="counter-goal-panel">
      <div class="counter-goal-panel-title">${t('more')}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="counter-action-btn" id="menuSharePoster" style="flex:none;width:100%;padding:14px 16px;border-radius:var(--radius-sm);justify-content:flex-start;gap:12px;font-size:.86rem">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          分享念佛海报
        </button>
        <button class="counter-action-btn" id="menuSwitchPractice" style="flex:none;width:100%;padding:14px 16px;border-radius:var(--radius-sm);justify-content:flex-start;gap:12px;font-size:.86rem">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 3a3 3 0 0 0-3 3l-9 9a3 3 0 0 0 4.24 4.24l9-9A3 3 0 0 0 18 3z"/><line x1="3" y1="21" x2="6" y2="18"/></svg>
          ${t('counter_practice_title')}
        </button>
        <button class="counter-action-btn counter-action-btn--danger" id="menuResetAll" style="flex:none;width:100%;padding:14px 16px;border-radius:var(--radius-sm);justify-content:flex-start;gap:12px;font-size:.86rem">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          ${t('counter_reset_all')}
        </button>
      </div>
      <button class="counter-goal-cancel" id="menuCancel">${t('cancel')}</button>
    </div>`;
  parentView.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#menuBackdrop').addEventListener('click', close);
  sheet.querySelector('#menuCancel').addEventListener('click', close);

  sheet.querySelector('#menuSharePoster').addEventListener('click', () => {
    close();
    setTimeout(() => {
      // Collect stats for this practice
      const ps = getPracticeStats(data);
      const streak = getStreak(data);
      // Lazy-load counter-share.js + qrcode only when user actually wants to share,
      // so counter.js module itself loads quickly (qrcode is ~60 KB gzipped).
      import('./counter-share.js').then(mod => {
        mod.showSharePoster(parentView, {
          practice: getPracticeDisplayName(data),
          daily: ps.daily || 0,
          total: ps.total || 0,
          streak,
        });
      });
    }, 260);
  });

  sheet.querySelector('#menuSwitchPractice').addEventListener('click', () => {
    close();
    setTimeout(() => showPracticePicker(parentView, data, onPracticeChange), 260);
  });

  sheet.querySelector('#menuResetAll').addEventListener('click', () => {
    close();
    setTimeout(() => {
      if (!window.confirm(t('counter_reset_confirm'))) return;
      for (const p of Object.keys(data.practices)) {
        const goal = data.practices[p].goal || 108;
        data.practices[p] = { total: 0, daily: 0, dailyDate: todayStr(), goal };
      }
      data.dailyLog = {};
      patch('counter', data);
      haptic(30);
      onPracticeChange();
      showToast(t('counter_reset_all'));
    }, 260);
  });
}

/**
 * 回向文沉浸展示（全屏）
 *
 * 莲池大师回向文始终完整展示，以"同生极乐国"作为一切功德的最终归宿。
 * 用户的"另愿"附于回向文之后，作为个人愿心的补充。
 */
/**
 * 回向文沉浸展示（全屏）
 *
 * 次序（先个人愿心，再总回向作庄严收尾）：
 *   1. 个人回向（若有）
 *   2. 莲池大师回向文（以"同生极乐国"作总结）
 *   3. 南无阿弥陀佛
 *   4. 「参与共修广场」可选
 */
function showHuixiangDisplay(parentView, anotherVow, counterData, dailyCount) {
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
        <button class="hd-gongxiu-btn" id="hdGongxiuBtn">参与共修广场</button>
        <div class="hd-hint">点击其他区域关闭</div>
      </div>
    </div>`;
  parentView.appendChild(display);
  requestAnimationFrame(() => display.classList.add('huixiang-display--in'));

  const close = () => {
    display.classList.remove('huixiang-display--in');
    setTimeout(() => display.remove(), 400);
  };
  const autoClose = setTimeout(close, 8000);

  display.querySelector('.hd-overlay').addEventListener('click', (e) => {
    if (e.target.closest('#hdGongxiuBtn')) return;
    clearTimeout(autoClose);
    close();
  });

  display.querySelector('#hdGongxiuBtn').addEventListener('click', () => {
    clearTimeout(autoClose);
    if (counterData && dailyCount > 0) {
      submitToGongxiu(counterData, dailyCount, { anotherVow: anotherVow || '' }).catch(() => { });
    }
    close();
    try { sessionStorage.setItem('counter:goto-gongxiu', '1'); } catch { }
    setTimeout(() => history.back(), 420);
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
  const savedVow = (() => { try { return localStorage.getItem('hx-another-vow') || ''; } catch { return ''; } })();

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
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
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
    try { localStorage.setItem('hx-another-vow', anotherVow); } catch { }
    close();
    setTimeout(() => showHuixiangDisplay(parentView, anotherVow, data, dailyCount), 260);
  });
}

/* ── Submit to 共修广场 ── */
async function submitToGongxiu(data, count, vowInfo) {
  const savedNickname = (() => { try { return localStorage.getItem('gongxiu-nickname') || ''; } catch { return ''; } })();
  const practice = getPracticeDisplayName(data);

  const body = {
    practice,
    count: Math.min(count, 150000),
    vow_type: 'universal', // 回向文始终为"法界一切众生"（往生极乐）
    vow_target: '',
    vow_custom: vowInfo?.anotherVow || '', // 另愿（用户个人附加愿心）
    nickname: savedNickname || '莲友',
  };

  const resp = await fetch('/api/gongxiu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'HTTP ' + resp.status);
  }

  // Mark as submitted today
  try {
    localStorage.setItem('gongxiu-submitted-date', new Date().toDateString());
  } catch { /* ignore */ }

  return resp.json();
}

/**
 * 每日功课目标选择器
 *
 * - 预设按钮：GOAL_PRESETS 列表（108 / 216 / 540 / 1080 / 3000 / 10000）
 * - 「我的功课」快捷按钮：若用户曾保存过自定义数量且不在预设中，额外显示
 * - 自定义输入框预填充上次保存的数量，便于快速修改
 * - 确认后将自定义数量持久化到 localStorage（CUSTOM_GOAL_KEY）
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
    if (isNaN(val) || val < 1) {
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
       <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
    const canAdd = data.customPractices.length < MAX_CUSTOM_PRACTICES;
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

        ${canAdd ? `
        <div class="practice-add-section" id="practiceAddSection">
          <div class="practice-add-input-row" id="practiceAddRow" style="display:none">
            <input class="counter-goal-custom-input" id="practiceNewInput" type="text"
                   maxlength="20" placeholder="${t('counter_custom_practice_hint')}">
            <button class="counter-goal-custom-btn" id="practiceNewConfirm">${t('counter_practice_custom_save')}</button>
          </div>
          <button class="practice-add-btn" id="practiceAddBtn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加自定义功课（还可添加 ${MAX_CUSTOM_PRACTICES - data.customPractices.length} 个）
          </button>
        </div>` : `<div class="practice-add-hint">自定义功课已达上限（${MAX_CUSTOM_PRACTICES} 个）</div>`}

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
      data.practices[name] = { total: 0, daily: 0, dailyDate: todayStr(), goal: 108 };
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
      if (data.customPractices.length >= MAX_CUSTOM_PRACTICES) {
        showToast(`自定义功课最多 ${MAX_CUSTOM_PRACTICES} 个`);
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

/* ===== History View — 极简版 ===== */
// formatCount is imported from utils.js

const WDS = ['日', '一', '二', '三', '四', '五', '六'];

function mkDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 获取今天的 YYYY-MM-DD */
function todayDateStr() {
  return mkDateStr(new Date());
}

/** 对日期字符串生成易读标签 */
function fmtHistDate(dateStr, todayStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const diff = Math.round((new Date(todayStr) - date) / 86400000);
  if (diff === 0) return { main: `${m}月${d}日`, sub: '今天' };
  if (diff === 1) return { main: `${m}月${d}日`, sub: '昨天' };
  return { main: `${m}月${d}日`, sub: `周${WDS[date.getDay()]}` };
}

/** 构建 lastDays 天的完整日期列表（含空记录），按从今天往前排 */
function buildDayList(data, lastDays = 180) {
  const log = data.dailyLog || {};
  const goal = (data.practices && data.practices[data.practice] && data.practices[data.practice].goal) || 108;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = mkDateStr(today);
  const days = [];

  for (let i = 0; i < lastDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = mkDateStr(d);
    const dayData = log[dateStr] || {};
    const total = Object.values(dayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    // Breakdown string: "南无阿弥陀佛 1,080 · 阿弥陀佛 200"
    const breakdown = Object.entries(dayData)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${formatCount(v)}`)
      .join(' · ');
    days.push({ dateStr, date: d, total, breakdown, goal });
  }
  return days;
}

/** 按年月分组 */
function groupDaysByMonth(days) {
  const groups = [];
  let cur = null;
  for (const day of days) {
    const mk = day.dateStr.slice(0, 7);
    if (!cur || cur.key !== mk) {
      cur = { key: mk, label: `${day.date.getFullYear()}年${day.date.getMonth() + 1}月`, days: [], total: 0 };
      groups.push(cur);
    }
    cur.days.push(day);
    cur.total += day.total;
  }
  return groups;
}

/** 渲染单日行 */
function renderHistDayRow(day, todayStr) {
  const { main, sub } = fmtHistDate(day.dateStr, todayStr);
  const goalDone = day.goal > 0 && day.total >= day.goal;
  const hasRecord = day.total > 0;
  return `
    <div class="chi-row${hasRecord ? '' : ' chi-row--empty'}">
      <div class="chi-date">
        <span class="chi-date-main">${main}</span>
        <span class="chi-date-sub">${sub}</span>
      </div>
      <div class="chi-content">
        ${hasRecord
          ? `<span class="chi-breakdown">${escapeHtml(day.breakdown)}</span>`
          : `<span class="chi-no-record">─</span>`
        }
      </div>
      <div class="chi-right">
        ${hasRecord
          ? `<span class="chi-count${goalDone ? ' done' : ''}">${formatCount(day.total)}</span>
             <span class="chi-dot${goalDone ? ' done' : ''}"></span>`
          : ''
        }
      </div>
    </div>`;
}

/** 构建完整历史面板 HTML */
function buildHistoryHTML(data) {
  const todayStr = todayDateStr();
  const log = data.dailyLog || {};
  const ps = (data.practices && data.practices[data.practice]) || { total: 0, daily: 0 };
  const streak = getStreak(data);

  // 累计总声数（所有功课）
  let grandTotal = 0;
  for (const dayData of Object.values(log)) {
    grandTotal += Object.values(dayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }
  // 今日
  const todayData = log[todayStr] || {};
  const todayTotal = Object.values(todayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  // 月分组日列表
  const days = buildDayList(data, 180);
  const months = groupDaysByMonth(days);

  const monthsHtml = months.map(month => {
    // 当前月显示全部天，过去月只显示有记录的天（节省空间）
    const isCurrentMonth = month.key === todayStr.slice(0, 7);
    const rowDays = isCurrentMonth ? month.days : month.days.filter(d => d.total > 0);
    if (rowDays.length === 0) return '';
    return `
      <div class="chi-month">
        <div class="chi-month-hdr">
          <span class="chi-month-lbl">${month.label}</span>
          ${month.total > 0 ? `<span class="chi-month-total">${formatCount(month.total)} 声</span>` : ''}
        </div>
        ${rowDays.map(d => renderHistDayRow(d, todayStr)).join('')}
      </div>`;
  }).filter(Boolean).join('');

  const emptyHtml = `<div class="ch-empty">尚无记录<br><span style="font-size:.74rem">开始念佛后，每日功课将展示在这里</span></div>`;

  return `
    <div class="ch-header">
      <button class="btn-icon" id="chBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="ch-title">念佛历史</span>
      <button class="btn-icon" id="chBuluBtn" title="补录" aria-label="补录过去的念佛声数">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="ch-body" id="chBody">
      <!-- 精简三格统计 -->
      <div class="chi-top-stats">
        <div class="chi-top-item">
          <div class="chi-top-val">${formatCount(grandTotal)}</div>
          <div class="chi-top-lbl">累计</div>
        </div>
        <div class="chi-top-divider"></div>
        <div class="chi-top-item">
          <div class="chi-top-val">${formatCount(todayTotal)}</div>
          <div class="chi-top-lbl">今日</div>
        </div>
        <div class="chi-top-divider"></div>
        <div class="chi-top-item">
          <div class="chi-top-val">${streak}</div>
          <div class="chi-top-lbl">连续</div>
        </div>
      </div>

      <!-- 月分组日列表 -->
      <div id="chiMonthList">
        ${months.some(m => m.total > 0) ? monthsHtml : emptyHtml}
      </div>
    </div>`;
}

/** 补录 sheet — 为过去某日追加念佛声数 */
function showBuluSheet(parentView, data, onDone) {
  parentView.querySelectorAll('.bulu-sheet').forEach(el => el.remove());

  const today = new Date(); today.setHours(0, 0, 0, 0);
  // 选项：今天 ~ 30天前
  const dateOptions = Array.from({ length: 31 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = mkDateStr(d);
    const label = i === 0 ? '今天' : i === 1 ? '昨天' : `${d.getMonth()+1}月${d.getDate()}日`;
    return { dateStr: ds, label };
  });

  // All configured practices
  const practices = [...PRACTICE_PRESETS, ...(data.customPractices || [])];

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet bulu-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="buluBackdrop"></div>
    <div class="counter-goal-panel" style="gap:14px">
      <div class="counter-goal-panel-title">补录念佛</div>
      <div style="font-size:.76rem;color:var(--text-muted);margin-bottom:2px">为过去未记录的日子补充声数</div>

      <div>
        <div class="counter-goal-section-label">日期</div>
        <select class="counter-goal-custom-input" id="buluDate" style="cursor:pointer">
          ${dateOptions.map(o => `<option value="${o.dateStr}">${o.label}</option>`).join('')}
        </select>
      </div>

      <div>
        <div class="counter-goal-section-label">功课</div>
        <select class="counter-goal-custom-input" id="buluPractice" style="cursor:pointer">
          ${practices.map(p => `<option value="${escapeHtml(p)}"${p === data.practice ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
      </div>

      <div>
        <div class="counter-goal-section-label">声数</div>
        <div class="counter-goal-custom-row">
          <input class="counter-goal-custom-input" id="buluCount" type="number" min="1"
                 placeholder="请输入声数">
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
  sheet.querySelector('#buluCount').focus();

  const confirm = () => {
    const dateStr = sheet.querySelector('#buluDate').value;
    const practice = sheet.querySelector('#buluPractice').value;
    const count = parseInt(sheet.querySelector('#buluCount').value);
    if (isNaN(count) || count < 1) {
      sheet.querySelector('#buluCount').classList.add('counter-goal-custom-input--error');
      showToast('请输入有效的正整数');
      setTimeout(() => sheet.querySelector('#buluCount').classList.remove('counter-goal-custom-input--error'), 600);
      return;
    }

    // Add to daily log
    if (!data.dailyLog) data.dailyLog = {};
    if (!data.dailyLog[dateStr]) data.dailyLog[dateStr] = {};
    data.dailyLog[dateStr][practice] = (data.dailyLog[dateStr][practice] || 0) + count;

    // Update practice total (all-time cumulative)
    if (!data.practices[practice]) {
      data.practices[practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    }
    data.practices[practice].total += count;

    // If it's today, also update daily count
    if (dateStr === todayDateStr()) {
      data.practices[practice].daily = (data.practices[practice].daily || 0) + count;
      data.practices[practice].dailyDate = dateStr;
    }

    patch('counter', data);
    haptic(15);
    showToast(`${practice} ${formatCount(count)}声 已补录`);
    close();
    onDone();
  };

  sheet.querySelector('#buluConfirm').addEventListener('click', confirm);
  sheet.querySelector('#buluCount').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
  });
}

/** Open / refresh the history slide-in panel inside the counter view */
export function openHistory(counterView, data) {
  counterView.querySelectorAll('.counter-history').forEach(el => el.remove());

  const hist = document.createElement('div');
  hist.className = 'counter-history';
  hist.innerHTML = buildHistoryHTML(data);
  counterView.appendChild(hist);

  requestAnimationFrame(() => hist.classList.add('counter-history--in'));

  const rebuildList = () => {
    const listEl = hist.querySelector('#chiMonthList');
    if (!listEl) return;
    const todayStr = todayDateStr();
    const days = buildDayList(data, 180);
    const months = groupDaysByMonth(days);
    const monthsHtml = months.map(month => {
      const isCurrentMonth = month.key === todayStr.slice(0, 7);
      const rowDays = isCurrentMonth ? month.days : month.days.filter(d => d.total > 0);
      if (rowDays.length === 0) return '';
      return `
        <div class="chi-month">
          <div class="chi-month-hdr">
            <span class="chi-month-lbl">${month.label}</span>
            ${month.total > 0 ? `<span class="chi-month-total">${formatCount(month.total)} 声</span>` : ''}
          </div>
          ${rowDays.map(d => renderHistDayRow(d, todayStr)).join('')}
        </div>`;
    }).filter(Boolean).join('');
    listEl.innerHTML = monthsHtml || `<div class="ch-empty">尚无记录</div>`;

    // Update top stats
    const log = data.dailyLog || {};
    let grand = 0;
    for (const dd of Object.values(log)) {
      grand += Object.values(dd).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    }
    const todayD = log[todayStr] || {};
    const todayT = Object.values(todayD).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    const topVals = hist.querySelectorAll('.chi-top-val');
    if (topVals[0]) topVals[0].textContent = formatCount(grand);
    if (topVals[1]) topVals[1].textContent = formatCount(todayT);
    if (topVals[2]) topVals[2].textContent = getStreak(data);
  };

  hist.querySelector('#chBack').addEventListener('click', () => {
    hist.classList.remove('counter-history--in');
    setTimeout(() => hist.remove(), 320);
  });

  hist.querySelector('#chBuluBtn').addEventListener('click', () => {
    showBuluSheet(hist, data, rebuildList);
  });
}
