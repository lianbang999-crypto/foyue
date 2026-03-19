/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { get, patch } from './store.js';
import { haptic, showToast, escapeHtml } from './utils.js';

const BEADS_PER_LOOP = 108;
const MAX_GOAL_VALUE = 99999;
const CUSTOM_KEY = '__custom__';
const MAX_RIPPLES = 6;

const PRACTICE_PRESETS = ['南无阿弥陀佛', '阿弥陀佛'];

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

/* Return the display name for the current practice */
function getPracticeDisplayName(data) {
  if (data.practice === CUSTOM_KEY) {
    return data.customPractice || t('counter_goal_custom');
  }
  return data.practice;
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

/* ── Data migration for CUSTOM_KEY change ── */
function migrateCustomKey(data) {
  // Migrate old '自定义' key to '__custom__'
  const OLD_KEY = '自定义';
  if (data.practices && data.practices[OLD_KEY]) {
    if (!data.practices[CUSTOM_KEY] || data.practices[CUSTOM_KEY].total === 0) {
      data.practices[CUSTOM_KEY] = data.practices[OLD_KEY];
    }
    delete data.practices[OLD_KEY];
  }
  if (data.practice === OLD_KEY) {
    data.practice = CUSTOM_KEY;
  }
  return data;
}

function getCounterData() {
  let data = get('counter');
  let shouldPersist = false;

  // Migrate from old flat structure or initialize fresh
  if (!data || !data.practices) {
    const old = data || {};
    data = { practice: '南无阿弥陀佛', customPractice: '', practices: {}, dailyLog: {} };

    // Initialize all preset practices with empty stats
    for (const p of [...PRACTICE_PRESETS, CUSTOM_KEY]) {
      data.practices[p] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    }

    // Carry over existing data to the matching practice slot
    if (old.total !== undefined) {
      if (PRACTICE_PRESETS.includes(old.practice)) {
        data.practice = old.practice;
        data.practices[old.practice] = {
          total: old.total || 0, daily: old.daily || 0,
          dailyDate: old.dailyDate || '', goal: old.goal || 108,
        };
      } else if (old.practice) {
        // Old practice was a custom preset – migrate to custom slot
        data.practice = CUSTOM_KEY;
        data.customPractice = old.practice;
        data.practices[CUSTOM_KEY] = {
          total: old.total || 0, daily: old.daily || 0,
          dailyDate: old.dailyDate || '', goal: old.goal || 108,
        };
      } else {
        data.practices['南无阿弥陀佛'] = {
          total: old.total || 0, daily: old.daily || 0,
          dailyDate: old.dailyDate || '', goal: old.goal || 108,
        };
      }
    }
    patch('counter', data);
  }

  // Migrate old '自定义' key to '__custom__'
  const beforePractice = data.practice;
  const hadOldCustomKey = !!(data.practices && data.practices['自定义']);
  migrateCustomKey(data);
  if (hadOldCustomKey || beforePractice !== data.practice) shouldPersist = true;

  // Ensure dailyLog exists
  if (!data.dailyLog) {
    data.dailyLog = {};
    shouldPersist = true;
  }

  // Ensure the current practice slot exists
  if (!data.practices[data.practice]) {
    data.practices[data.practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
    shouldPersist = true;
  }

  // Reset daily count if it's a new day
  const ps = getPracticeStats(data);
  if (checkAndResetDaily(ps)) {
    shouldPersist = true;
  }

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

  return `
    <div class="counter-header">
      <button class="counter-back btn-icon" id="counterBack" aria-label="${t('wenku_back')}">
        <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="counter-header-title">${t('counter_title')}</span>
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
      <button class="counter-action-btn" id="counterResetSession">
        <svg viewBox="0 0 24 24" width="18" height="18"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        ${t('counter_reset_session')}
      </button>
      <button class="counter-action-btn counter-action-btn--goal" id="counterSetGoal">
        <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>
        ${t('counter_goal')}
      </button>
      <button class="counter-action-btn counter-action-btn--danger" id="counterResetAll">
        <svg viewBox="0 0 24 24" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        ${t('counter_reset_all')}
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

      // Record to daily log
      const practiceKey = data.practice === CUSTOM_KEY ? (data.customPractice || CUSTOM_KEY) : data.practice;
      recordDailyLog(data, practiceKey, 1);

      patch('counter', data);

      // Spawn ripple at tap position
      spawnRipple(cx, cy);

      const justCompletedLoop = ps.total % BEADS_PER_LOOP === 0;
      if (justCompletedLoop) {
        haptic(60);
        showToast(t('counter_loop_done'));
        updateUI(true);
        return;
      }

      const goalJustDone = ps.goal > 0 && ps.daily === ps.goal;
      if (goalJustDone) {
        haptic(80);
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

  /* ── Reset session ── */
  view.querySelector('#counterResetSession').addEventListener('click', () => {
    session = 0;
    updateUI();
    haptic(20);
    showToast(t('counter_reset_session'));
  });

  /* ── Set goal ── */
  view.querySelector('#counterSetGoal').addEventListener('click', () => {
    const goals = [108, 216, 540, 1080, 3000, 10000];
    // Build a simple picker sheet
    showGoalPicker(view, goals, data, () => updateUI());
  });

  /* ── Reset all ── */
  view.querySelector('#counterResetAll').addEventListener('click', () => {
    if (!window.confirm(t('counter_reset_confirm'))) return;
    // Reset all practices (preserve goals)
    for (const p of Object.keys(data.practices)) {
      const goal = data.practices[p].goal || 108;
      data.practices[p] = { total: 0, daily: 0, dailyDate: todayStr(), goal };
    }
    data.dailyLog = {};
    session = 0;
    patch('counter', data);
    haptic(30);
    updateUI();
    showToast(t('counter_reset_all'));
  });

  /* ── History button ── */
  const histBtn = view.querySelector('#counterHistoryBtn');
  if (histBtn) {
    histBtn.addEventListener('click', () => openHistory(view, data));
  }

  /* ── Menu button → Practice picker ── */
  view.querySelector('#counterMenu').addEventListener('click', () => {
    showPracticePicker(view, data, () => { session = 0; updateUI(); });
  });
}

function showGoalPicker(parentView, goals, data, onDone) {
  // Remove existing picker
  parentView.querySelectorAll('.counter-goal-sheet').forEach(el => el.remove());

  const ps = getPracticeStats(data);
  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="goalBackdrop"></div>
    <div class="counter-goal-panel">
      <div class="counter-goal-panel-title">${t('counter_goal_hint')}</div>
      <div class="counter-goal-options">
        ${goals.map(g => `<button class="counter-goal-opt${ps.goal === g ? ' counter-goal-opt--active' : ''}" data-goal="${g}">${g}</button>`).join('')}
      </div>
      <div class="counter-goal-custom-row">
        <input class="counter-goal-custom-input" id="goalCustomInput" type="number" min="1" max="${MAX_GOAL_VALUE}"
               placeholder="${t('counter_goal_custom_hint')}">
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
  sheet.querySelectorAll('.counter-goal-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      ps.goal = parseInt(btn.dataset.goal);
      patch('counter', data);
      haptic(15);
      onDone();
      close();
    });
  });

  sheet.querySelector('#goalCustomConfirm').addEventListener('click', () => {
    const input = sheet.querySelector('#goalCustomInput');
    const val = parseInt(input.value);
    if (isNaN(val) || val < 1 || val > MAX_GOAL_VALUE) {
      input.classList.add('counter-goal-custom-input--error');
      showToast(t('counter_goal_invalid'));
      setTimeout(() => input.classList.remove('counter-goal-custom-input--error'), 600);
      return;
    }
    ps.goal = val;
    patch('counter', data);
    haptic(15);
    onDone();
    close();
  });
}

function showPracticePicker(parentView, data, onDone) {
  // Remove existing picker
  parentView.querySelectorAll('.counter-practice-sheet').forEach(el => el.remove());

  const customLabel = escapeHtml(data.customPractice || t('counter_goal_custom'));
  const isCustomActive = data.practice === CUSTOM_KEY;
  // If customPractice exists, the button acts as a direct selector;
  // input is hidden by default and only revealed via the Edit button.
  // If no customPractice yet, show the input immediately so the user can set one.
  const hasCustom = !!data.customPractice;

  const sheet = document.createElement('div');
  sheet.className = 'counter-practice-sheet';
  sheet.innerHTML = `
    <div class="counter-practice-backdrop" id="practiceBackdrop"></div>
    <div class="counter-practice-panel">
      <div class="counter-practice-panel-title">${t('counter_practice_title')}</div>
      <div class="counter-practice-options">
        ${PRACTICE_PRESETS.map(name => `
          <button class="counter-practice-opt${data.practice === name ? ' counter-practice-opt--active' : ''}"
                  data-name="${name}">${name}</button>
        `).join('')}
      </div>
      <div class="counter-practice-custom-row">
        <button class="counter-practice-opt counter-practice-opt--custom${isCustomActive ? ' counter-practice-opt--active' : ''}"
                id="practiceCustomOpt" data-name="${CUSTOM_KEY}">${customLabel}</button>
        ${hasCustom ? `<button class="counter-practice-custom-edit" id="practiceCustomEdit">${t('counter_practice_custom_edit')}</button>` : ''}
      </div>
      <div class="counter-custom-input-wrap${hasCustom ? ' counter-custom-input-wrap--hidden' : ''}" id="customInputWrap">
        <div class="counter-goal-custom-row">
          <input class="counter-goal-custom-input" id="customPracticeInput" type="text"
                 maxlength="20" placeholder="${t('counter_custom_practice_hint')}"
                 value="${escapeHtml(data.customPractice || '')}">
          <button class="counter-goal-custom-btn" id="customPracticeConfirm">${t('counter_practice_custom_save')}</button>
        </div>
      </div>
      <button class="counter-goal-cancel" id="practiceCancel">${t('cancel')}</button>
    </div>
  `;
  parentView.appendChild(sheet);

  requestAnimationFrame(() => sheet.classList.add('counter-practice-sheet--visible'));

  const close = () => {
    window.removeEventListener('keydown', practiceEscHandler);
    sheet.classList.remove('counter-practice-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#practiceBackdrop').addEventListener('click', close);
  sheet.querySelector('#practiceCancel').addEventListener('click', close);
  const practiceEscHandler = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', practiceEscHandler);

  // Preset option buttons
  sheet.querySelectorAll('.counter-practice-opt[data-name]:not(#practiceCustomOpt)').forEach(btn => {
    btn.addEventListener('click', () => {
      data.practice = btn.dataset.name;
      if (!data.practices[data.practice]) {
        data.practices[data.practice] = { total: 0, daily: 0, dailyDate: todayStr(), goal: 108 };
      }
      checkAndResetDaily(getPracticeStats(data));
      patch('counter', data);
      haptic(15);
      onDone();
      showToast(t('counter_practice_changed').replace('{name}', data.practice));
      close();
    });
  });

  // Custom option: direct select if customPractice exists, else show input
  const customOpt = sheet.querySelector('#practiceCustomOpt');
  const customWrap = sheet.querySelector('#customInputWrap');
  customOpt.addEventListener('click', () => {
    if (data.customPractice) {
      // Directly select the existing custom practice
      data.practice = CUSTOM_KEY;
      if (!data.practices[CUSTOM_KEY]) {
        data.practices[CUSTOM_KEY] = { total: 0, daily: 0, dailyDate: todayStr(), goal: 108 };
      }
      checkAndResetDaily(getPracticeStats(data));
      patch('counter', data);
      haptic(15);
      onDone();
      showToast(t('counter_practice_changed').replace('{name}', data.customPractice));
      close();
    } else {
      // No custom practice yet — show input row
      customWrap.classList.remove('counter-custom-input-wrap--hidden');
      sheet.querySelector('#customPracticeInput').focus();
    }
  });

  // Edit button: reveal input row to modify the custom practice name
  const editBtn = sheet.querySelector('#practiceCustomEdit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      customWrap.classList.remove('counter-custom-input-wrap--hidden');
      sheet.querySelector('#customPracticeInput').focus();
    });
  }

  // Confirm custom practice name
  const confirmCustom = () => {
    const input = sheet.querySelector('#customPracticeInput');
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
    data.customPractice = val;
    data.practice = CUSTOM_KEY;
    if (!data.practices[CUSTOM_KEY]) {
      data.practices[CUSTOM_KEY] = { total: 0, daily: 0, dailyDate: todayStr(), goal: 108 };
    }
    checkAndResetDaily(getPracticeStats(data));
    patch('counter', data);
    haptic(15);
    onDone();
    showToast(t('counter_practice_changed').replace('{name}', val));
    close();
  };

  sheet.querySelector('#customPracticeConfirm').addEventListener('click', confirmCustom);
  sheet.querySelector('#customPracticeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmCustom(); }
  });
}

/* ===== History View ===== */

/** Format a count number for compact display: 10800 → "10,800" / 12345 → "1.2万" */
function formatCount(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return n.toLocaleString ? n.toLocaleString('zh-CN') : String(n);
}

/** Format a YYYY-MM-DD date string into a human-readable label */
function formatHistoryDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - date) / 86400000);
  if (diff === 0) return t('time_today') || '今天';
  if (diff === 1) return t('time_yesterday') || '昨天';
  const wds = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}月${d}日 周${wds[date.getDay()]}`;
}

/**
 * Return the goal value for the given practice tab key.
 * Tab keys: 'all' | preset name | data.customPractice
 */
function goalForTab(data, tabKey) {
  if (tabKey === 'all') {
    // Use current active practice's goal
    return (data.practices && data.practices[data.practice] && data.practices[data.practice].goal) || 108;
  }
  // Preset practice?
  if (data.practices && data.practices[tabKey]) return data.practices[tabKey].goal || 108;
  // Custom practice (tabKey === data.customPractice)?
  if (data.customPractice && tabKey === data.customPractice) {
    return (data.practices && data.practices[CUSTOM_KEY] && data.practices[CUSTOM_KEY].goal) || 108;
  }
  return 108;
}

/**
 * Compute aggregate stats for the history view.
 * tabKey = 'all' | practice name (as stored in dailyLog)
 */
function computeHistoryStats(data, tabKey) {
  const log = data.dailyLog || {};
  const entries = [];
  for (const [date, dayData] of Object.entries(log)) {
    let count = 0;
    if (tabKey === 'all') {
      count = Object.values(dayData).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    } else {
      count = (typeof dayData[tabKey] === 'number') ? dayData[tabKey] : 0;
    }
    if (count > 0) entries.push({ date, count });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const total = entries.reduce((s, e) => s + e.count, 0);
  const best  = entries.length > 0 ? Math.max(...entries.map(e => e.count)) : 0;
  const avg   = entries.length > 0 ? Math.round(total / entries.length) : 0;
  const goal  = goalForTab(data, tabKey);

  return { total, best, avg, activeDays: entries.length, streak: getStreak(data), entries, goal };
}

/**
 * Build an array of 91 cell descriptors for a Mon→Sun heatmap grid
 * covering the 13 weeks that end on the Sunday on-or-after today.
 */
function buildHeatmapCells(data, tabKey, goal) {
  const log  = data.dailyLog || {};
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  const todayDow = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun

  // Advance to Sunday to close out the last column
  const gridEnd = new Date(now);
  gridEnd.setDate(gridEnd.getDate() + (6 - todayDow));

  // 91 cells = exactly 13 weeks
  const gridStart = new Date(gridEnd);
  gridStart.setDate(gridStart.getDate() - 90);

  const mkDateStr = d =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  const todayStr = mkDateStr(now);
  const cells = [];

  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = mkDateStr(d);
    const isFuture = d > now;
    const isToday  = dateStr === todayStr;

    if (isFuture) { cells.push({ type: 'future' }); continue; }

    let count = 0;
    if (log[dateStr]) {
      if (tabKey === 'all') {
        count = Object.values(log[dateStr]).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      } else {
        count = (typeof log[dateStr][tabKey] === 'number') ? log[dateStr][tabKey] : 0;
      }
    }

    let level = 0;
    if (count > 0) {
      if (goal > 0) {
        if      (count >= goal)           level = 4;
        else if (count >= goal * 0.5)     level = 3;
        else if (count >= goal * 0.25)    level = 2;
        else                              level = 1;
      } else {
        level = 2;
      }
    }
    cells.push({ type: 'day', dateStr, count, level, isToday });
  }
  return cells;
}

/** Render heatmap cell HTML */
function renderHeatmapCells(cells) {
  return cells.map(cell => {
    if (cell.type === 'future') return `<div class="ch-cell ch-cell--future"></div>`;
    const classes = ['ch-cell'];
    if (cell.isToday) classes.push('ch-cell--today');
    const title = cell.count > 0 ? `${cell.dateStr}: ${formatCount(cell.count)}声` : cell.dateStr;
    return `<div class="${classes.join(' ')}" data-level="${cell.level}" data-count="${cell.count}" title="${title}"></div>`;
  }).join('');
}

/** Render a single day-item row */
function renderDayItem(e, tabKey, goal, dailyLog) {
  const goalDone = goal > 0 && e.count >= goal;
  const partial  = !goalDone && e.count > 0;
  let sub = '';
  if (tabKey === 'all' && dailyLog && dailyLog[e.date]) {
    sub = Object.entries(dailyLog[e.date])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${formatCount(v)}声`)
      .join(' · ');
  }
  return `<div class="ch-day-item">
    <div class="ch-day-dot ${goalDone ? 'ch-day-dot--done' : partial ? 'ch-day-dot--partial' : ''}"></div>
    <div class="ch-day-info">
      <div class="ch-day-date">${formatHistoryDate(e.date)}</div>
      ${sub ? `<div class="ch-day-sub">${escapeHtml(sub)}</div>` : ''}
    </div>
    <div class="ch-day-count ${goalDone ? 'ch-day-count--done' : ''}">${formatCount(e.count)}</div>
  </div>`;
}

/** Build the complete HTML for the history panel */
function buildHistoryHTML(data, tabKey) {
  const stats = computeHistoryStats(data, tabKey);
  const cells = buildHeatmapCells(data, tabKey, stats.goal);

  // Practice tabs: 全部 + presets + custom (if set)
  const tabs = [{ key: 'all', label: '全部' }];
  PRACTICE_PRESETS.forEach(p => tabs.push({ key: p, label: p }));
  if (data.customPractice) tabs.push({ key: data.customPractice, label: data.customPractice });

  const practiceTabsHtml = tabs.map(({ key, label }) =>
    `<button class="ch-practice-tab${key === tabKey ? ' active' : ''}" data-tab="${escapeHtml(key)}">${escapeHtml(label)}</button>`
  ).join('');

  // Milestone banner (show "next milestone" progress)
  const MILESTONES = [10000, 50000, 100000, 500000, 1000000, 5000000, 10000000];
  const nextM = MILESTONES.find(m => m > stats.total);
  const milestoneHtml = nextM && stats.total > 0 ? `
    <div class="ch-milestone">
      <div class="ch-milestone-icon">🙏</div>
      <div class="ch-milestone-text">
        已念 <strong>${formatCount(stats.total)}</strong> 声，
        距 <strong>${formatCount(nextM)}</strong> 声还差
        <strong>${formatCount(nextM - stats.total)}</strong> 声
      </div>
    </div>` : '';

  // Daily list (newest first, up to 60 days)
  const sorted = stats.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  const listHtml = sorted.length === 0
    ? `<div class="ch-empty">暂无记录<br><span style="font-size:.74rem">开始念佛后，每日记录将展示在这里</span></div>`
    : sorted.map(e => renderDayItem(e, tabKey, stats.goal, data.dailyLog)).join('');

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  return `
    <div class="ch-header">
      <button class="btn-icon" id="chBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="ch-title">念佛历史</span>
      <div style="width:44px;flex-shrink:0"></div>
    </div>

    <div class="ch-body" id="chBody">
      <!-- Stats 2×2 grid -->
      <div class="ch-stats">
        <div class="ch-stat-card">
          <div class="ch-stat-val">${formatCount(stats.total)}</div>
          <div class="ch-stat-lbl">累计声数</div>
        </div>
        <div class="ch-stat-card">
          <div class="ch-stat-val">${stats.streak}</div>
          <div class="ch-stat-lbl">连续打卡（天）</div>
        </div>
        <div class="ch-stat-card">
          <div class="ch-stat-val">${formatCount(stats.best)}</div>
          <div class="ch-stat-lbl">单日最高</div>
        </div>
        <div class="ch-stat-card">
          <div class="ch-stat-val">${stats.activeDays}</div>
          <div class="ch-stat-lbl">有记录天数</div>
        </div>
      </div>

      ${milestoneHtml}

      <!-- Practice filter tabs -->
      <div class="ch-practice-tabs" id="chPracticeTabs">${practiceTabsHtml}</div>

      <!-- Heatmap -->
      <div class="ch-section">
        <div class="ch-section-title">近90天记录</div>
        <div class="ch-heatmap-labels">
          ${dayLabels.map(d => `<div class="ch-heatmap-label">${d}</div>`).join('')}
        </div>
        <div class="ch-heatmap" id="chHeatmap">${renderHeatmapCells(cells)}</div>
        <div class="ch-heatmap-legend">
          <span class="ch-legend-label">少</span>
          ${[1, 2, 3, 4].map(l => {
            const op = [.22, .45, .72, 1][l - 1];
            return `<div class="ch-legend-cell" style="opacity:${op}"></div>`;
          }).join('')}
          <span class="ch-legend-label">多</span>
        </div>
      </div>

      <!-- Daily list -->
      <div class="ch-section">
        <div class="ch-section-title">每日记录</div>
        <div class="ch-list" id="chList">${listHtml}</div>
      </div>
    </div>`;
}

/** Open / refresh the history slide-in panel inside the counter view */
export function openHistory(counterView, data) {
  // Remove existing
  counterView.querySelectorAll('.counter-history').forEach(el => el.remove());

  let activeTab = 'all';
  const hist = document.createElement('div');
  hist.className = 'counter-history';
  hist.innerHTML = buildHistoryHTML(data, activeTab);
  counterView.appendChild(hist);

  // Animate in
  requestAnimationFrame(() => hist.classList.add('counter-history--in'));

  /* ── Back button ── */
  hist.querySelector('#chBack').addEventListener('click', () => {
    hist.classList.remove('counter-history--in');
    setTimeout(() => hist.remove(), 320);
  });

  /* ── Practice tab switching (event delegation) ── */
  hist.querySelector('#chPracticeTabs').addEventListener('click', e => {
    const btn = e.target.closest('.ch-practice-tab');
    if (!btn) return;
    const newTab = btn.dataset.tab;
    if (newTab === activeTab) return;
    activeTab = newTab;

    const stats = computeHistoryStats(data, activeTab);
    const cells = buildHeatmapCells(data, activeTab, stats.goal);

    // Update active tab highlight
    hist.querySelectorAll('.ch-practice-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === activeTab));

    // Re-render heatmap
    const heatmapEl = hist.querySelector('#chHeatmap');
    if (heatmapEl) heatmapEl.innerHTML = renderHeatmapCells(cells);

    // Re-render list
    const listEl = hist.querySelector('#chList');
    if (listEl) {
      const sorted = stats.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
      listEl.innerHTML = sorted.length === 0
        ? `<div class="ch-empty">暂无记录<br><span style="font-size:.74rem">开始念佛后，每日记录将展示在这里</span></div>`
        : sorted.map(e => renderDayItem(e, activeTab, stats.goal, data.dailyLog)).join('');
    }
  });
}
