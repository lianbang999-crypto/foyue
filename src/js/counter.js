/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { get, patch } from './store.js';
import { haptic, showToast, escapeHtml } from './utils.js';

const BEADS_PER_LOOP = 108;
const MAX_GOAL_VALUE = 99999;
/** @deprecated Kept only for data migration from old single-custom format */
const CUSTOM_KEY = '__custom__';
const MAX_RIPPLES = 6;
const MAX_CUSTOM_PRACTICES = 5;

/** Built-in presets — always present, cannot be removed */
const PRACTICE_PRESETS = ['南无阿弥陀佛', '阿弥陀佛'];

/** Fixed standard dedication text (莲池大师回向文) — always appended, never editable */
const HUIXIANG_TEXT = '愿以此功德，庄严佛净土，\n上报四重恩，下济三途苦，\n若有见闻者，悉发菩提心，\n尽此一报身，同生极乐国。';

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

  /* ── 清零 (reset session) ── */
  view.querySelector('#counterResetSession').addEventListener('click', () => {
    session = 0;
    updateUI();
    haptic(20);
    showToast(t('counter_clear'));
  });

  /* ── 今日功课 (set goal) ── */
  view.querySelector('#counterSetGoal').addEventListener('click', () => {
    const goals = [108, 216, 540, 1080, 3000, 10000, 0];
    showGoalPicker(view, goals, data, () => updateUI());
  });

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
 * 莲池大师大回向文始终完整展示，以"同生极乐国"作为一切功德的最终归宿。
 * 用户的"另愿"附于大回向文之后，作为个人愿心的补充。
 */
function showHuixiangDisplay(parentView, anotherVow) {
  parentView.querySelectorAll('.huixiang-display').forEach(el => el.remove());

  const display = document.createElement('div');
  display.className = 'huixiang-display';

  const anotherLine = anotherVow
    ? `<div class="hd-another">另愿：${escapeHtml(anotherVow)}</div>`
    : '';

  display.innerHTML = `
    <div class="hd-overlay">
      <div class="hd-content">
        <div class="hd-lotus">🪷</div>
        <div class="hd-main-text">${HUIXIANG_TEXT.replace(/\n/g, '<br>')}</div>
        ${anotherLine}
        <div class="hd-namo">南无阿弥陀佛</div>
        <div class="hd-hint">点击关闭</div>
      </div>
    </div>`;
  parentView.appendChild(display);
  requestAnimationFrame(() => display.classList.add('huixiang-display--in'));

  const close = () => {
    display.classList.remove('huixiang-display--in');
    setTimeout(() => display.remove(), 400);
  };
  const autoClose = setTimeout(close, 6000);
  display.addEventListener('click', () => { clearTimeout(autoClose); close(); });
}

/**
 * 回向 sheet
 *
 * 佛法依据（莲池大师西方发愿文）：
 *   - 大回向文是修行的庄严结尾，以"同生极乐国"为最终归宿，不可省略
 *   - "另愿"为行者个人的愿心补充，附于大回向文之后
 *     例：愿父母消灾延寿 · 愿XXX早日往生净土 · 愿一切众生皆得解脱
 *   - 大回向文不因个人愿文而改变，所有功德仍归于"庄严佛净土，同生极乐国"
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

      <!-- 大回向文（固定展示，莲池大师，始终以"同生极乐国"为终归） -->
      <div class="hx-huixiang-preview">
        <div class="hx-section-label">大回向文</div>
        <div class="hx-huixiang-text">${HUIXIANG_TEXT.replace(/\n/g, '<br>')}</div>
        <div class="hx-huixiang-attr">— 莲池大师</div>
      </div>

      <!-- 另愿（用户个人愿心，附于大回向文之后） -->
      <div class="hx-another-section">
        <div class="hx-section-label">
          另愿
          <span class="hx-optional">可选</span>
        </div>
        <textarea class="hx-custom-input" id="hxAnotherVow" rows="2" maxlength="80"
                  placeholder="例：愿父母消灾延寿 · 愿XXX早日往生净土">${escapeHtml(savedVow)}</textarea>
        <div class="hx-another-hint">个人愿文将附于大回向文之后</div>
      </div>

      <div class="hx-gongxiu-row">
        <label class="hx-gongxiu-label">
          <input type="checkbox" id="hxJoinGongxiu" class="hx-checkbox">
          <span class="hx-gongxiu-text">${t('counter_join_gongxiu')}</span>
        </label>
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

  sheet.querySelector('#hxConfirm').addEventListener('click', async () => {
    const anotherVow = sheet.querySelector('#hxAnotherVow')?.value.trim() || '';
    const joinGongxiu = sheet.querySelector('#hxJoinGongxiu')?.checked;

    try { localStorage.setItem('hx-another-vow', anotherVow); } catch { }

    if (joinGongxiu && dailyCount > 0) {
      try {
        await submitToGongxiu(data, dailyCount, { anotherVow });
        showToast(t('gongxiu_submit_success'));
      } catch (err) {
        console.warn('[Gongxiu] Submit failed:', err);
      }
    }

    close();
    setTimeout(() => showHuixiangDisplay(parentView, anotherVow), 260);
  });
}

/* ── Submit to 共修社区 ── */
async function submitToGongxiu(data, count, vowInfo) {
  const savedNickname = (() => { try { return localStorage.getItem('gongxiu-nickname') || ''; } catch { return ''; } })();
  const practice = getPracticeDisplayName(data);

  const body = {
    practice,
    count: Math.min(count, 150000),
    vow_type: 'universal', // 大回向文始终为"法界一切众生"（往生极乐）
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
    return (data.practices && data.practices[data.practice] && data.practices[data.practice].goal) || 108;
  }
  // All practices (presets + custom) are now stored directly by their name
  return (data.practices && data.practices[tabKey] && data.practices[tabKey].goal) || 108;
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

  // Practice tabs: 全部 + presets + all custom practices
  const tabs = [{ key: 'all', label: '全部' }];
  PRACTICE_PRESETS.forEach(p => tabs.push({ key: p, label: p }));
  (data.customPractices || []).forEach(p => tabs.push({ key: p, label: p }));

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
