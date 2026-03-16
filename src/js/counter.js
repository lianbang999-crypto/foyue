/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { get, patch } from './store.js';
import { haptic, showToast, escapeHtml } from './utils.js';

const BEADS_PER_LOOP = 108;
const MAX_GOAL_VALUE = 99999;
const CUSTOM_KEY = '自定义';

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
    return data.customPractice || CUSTOM_KEY;
  }
  return data.practice;
}

function getCounterData() {
  let data = get('counter');

  // Migrate from old flat structure or initialize fresh
  if (!data || !data.practices) {
    const old = data || {};
    data = { practice: '南无阿弥陀佛', customPractice: '', practices: {} };

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

  // Ensure the current practice slot exists
  if (!data.practices[data.practice]) {
    data.practices[data.practice] = { total: 0, daily: 0, dailyDate: '', goal: 108 };
  }

  // Reset daily count if it's a new day
  const ps = getPracticeStats(data);
  if (checkAndResetDaily(ps)) {
    patch('counter', data);
  }
  return data;
}

/* ── Main render ── */
export function openCounter() {
  // Remove existing counter view if present
  document.querySelectorAll('.counter-view').forEach(el => el.remove());

  // Push browser history state so back button works
  history.pushState({ counter: true }, '');

  const view = document.createElement('div');
  view.className = 'counter-view';

  const data = getCounterData();
  let session = 0;   // counts in current session (not persisted to store until increment)

  view.innerHTML = buildCounterHTML(data, session);
  document.getElementById('app').appendChild(view);

  // Animate in
  requestAnimationFrame(() => view.classList.add('counter-view--visible'));

  // Wire events
  wireCounterEvents(view, data, session);

  // Handle browser back button + Escape key
  const popHandler = (e) => {
    if (e.state && e.state.counter) return;
    closeCounter(view, popHandler, escHandler);
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') history.back();
  };
  window.addEventListener('popstate', popHandler);
  window.addEventListener('keydown', escHandler);
}

function buildCounterHTML(data, session) {
  const ps = getPracticeStats(data);
  const beadPos = ps.total % BEADS_PER_LOOP;
  const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
  const goalDone = ps.goal > 0 && ps.daily >= ps.goal;
  const displayName = escapeHtml(getPracticeDisplayName(data));

  return `
    <div class="counter-header">
      <button class="counter-back btn-icon" id="counterBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="counter-header-title">${t('counter_title')}</span>
      <button class="counter-menu btn-icon" id="counterMenu" aria-label="更多">
        <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
      </button>
    </div>

    <div class="counter-body">
      <!-- Main tap button (stats row removed for minimalist focus) -->
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
        <!-- Inner lotus circle -->
        <div class="counter-lotus-wrap">
          <!-- Lotus SVG motif -->
          <svg class="counter-lotus" viewBox="0 0 80 80">
            <g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
              <!-- Petals -->
              <path d="M40 40 C34 28 26 24 24 16 C32 18 38 26 40 40Z"/>
              <path d="M40 40 C46 28 54 24 56 16 C48 18 42 26 40 40Z"/>
              <path d="M40 40 C28 34 24 26 16 24 C18 32 26 38 40 40Z"/>
              <path d="M40 40 C52 34 56 26 64 24 C62 32 54 38 40 40Z"/>
              <path d="M40 40 C34 52 26 56 24 64 C32 62 38 54 40 40Z"/>
              <path d="M40 40 C46 52 54 56 56 64 C48 62 42 54 40 40Z"/>
              <path d="M40 40 C28 46 24 54 16 56 C18 48 26 42 40 40Z"/>
              <path d="M40 40 C52 46 56 54 64 56 C62 48 54 42 40 40Z"/>
              <!-- Center circle -->
              <circle cx="40" cy="40" r="6"/>
            </g>
          </svg>
          <!-- Count number -->
          <div class="counter-number" id="counterNumber">${session}</div>
          <div class="counter-practice-name" id="counterPracticeName">${displayName}</div>
          <div class="counter-hint" id="counterHint">${t('counter_tap_hint')}</div>
        </div>
        <!-- Ripple container -->
        <div class="counter-ripples" id="counterRipples"></div>
      </div>

      <!-- Daily progress bar -->
      <div class="counter-daily-wrap">
        <div class="counter-daily-row">
          <span class="counter-daily-lbl">${t('counter_daily')}: <strong id="ctrDaily">${ps.daily}</strong></span>
          <span class="counter-daily-goal" id="ctrGoalLabel">${goalDone ? '✓ ' : ''}${t('counter_goal')}: <span id="ctrGoalVal">${ps.goal}</span></span>
        </div>
        <div class="counter-progress-bar">
          <div class="counter-progress-bar-fill${goalDone ? ' counter-progress-bar-fill--done' : ''}"
               id="ctrGoalBar" style="width:${goalPct}%"></div>
        </div>
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

function closeCounter(view, popHandler, escHandler) {
  if (popHandler) window.removeEventListener('popstate', popHandler);
  if (escHandler) window.removeEventListener('keydown', escHandler);
  view.classList.remove('counter-view--visible');
  setTimeout(() => {
    view.remove();
    const homeTab = document.querySelector('.tab[data-tab="home"]');
    if (homeTab) homeTab.click();
  }, 350);
}

function wireCounterEvents(view, data, _session) {
  let session = _session;

  /* ── Full UI update (settings change, loop complete, goal done, reset) ── */
  function updateUI(bump = false) {
    const ps = getPracticeStats(data);
    const beadPos = ps.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));
    const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
    const goalDone = ps.goal > 0 && ps.daily >= ps.goal;

    const numEl = view.querySelector('#counterNumber');
    const dailyEl = view.querySelector('#ctrDaily');
    const barEl = view.querySelector('#ctrGoalBar');
    const goalLabelEl = view.querySelector('#ctrGoalLabel');
    const goalValEl = view.querySelector('#ctrGoalVal');
    const progressFill = view.querySelector('#counterProgressFill');
    const hintEl = view.querySelector('#counterHint');
    const practiceEl = view.querySelector('#counterPracticeName');

    if (numEl) {
      numEl.textContent = session;
      if (bump) {
        numEl.classList.add('counter-number--bump');
        setTimeout(() => numEl.classList.remove('counter-number--bump'), 180);
      }
    }
    if (dailyEl) dailyEl.textContent = ps.daily;
    if (barEl) { barEl.style.width = goalPct + '%'; barEl.classList.toggle('counter-progress-bar-fill--done', goalDone); }
    if (goalLabelEl && goalValEl) { goalLabelEl.firstChild.textContent = (goalDone ? '✓ ' : '') + t('counter_goal') + ': '; goalValEl.textContent = ps.goal; }
    if (progressFill) progressFill.style.strokeDashoffset = offset;
    if (hintEl) hintEl.style.display = session > 0 ? 'none' : '';
    if (practiceEl) practiceEl.textContent = getPracticeDisplayName(data);
  }

  /* ── Fast tap update — only the minimal DOM writes needed ── */
  function updateUIFast(bump) {
    const ps = getPracticeStats(data);
    const beadPos = ps.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));

    const numEl = view.querySelector('#counterNumber');
    const progressFill = view.querySelector('#counterProgressFill');
    const dailyEl = view.querySelector('#ctrDaily');
    const barEl = view.querySelector('#ctrGoalBar');
    const hintEl = view.querySelector('#counterHint');

    if (numEl) {
      numEl.textContent = session;
      if (bump) {
        numEl.classList.add('counter-number--bump');
        setTimeout(() => numEl.classList.remove('counter-number--bump'), 180);
      }
    }
    if (progressFill) progressFill.style.strokeDashoffset = offset;
    if (dailyEl) dailyEl.textContent = ps.daily;
    if (barEl) {
      const goalPct = ps.goal > 0 ? Math.min(100, Math.round(ps.daily / ps.goal * 100)) : 0;
      barEl.style.width = goalPct + '%';
    }
    if (hintEl && session === 1) hintEl.style.display = 'none';
  }

  /* ── Ripple effect ── */
  function spawnRipple(x, y) {
    const ripplesEl = view.querySelector('#counterRipples');
    if (!ripplesEl) return;
    const r = document.createElement('div');
    r.className = 'counter-ripple';
    const rect = ripplesEl.getBoundingClientRect();
    r.style.left = (x - rect.left) + 'px';
    r.style.top = (y - rect.top) + 'px';
    ripplesEl.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  }

  /* ── Tap count ── */
  const tapArea = view.querySelector('#counterTapArea');
  if (tapArea) {
    const doCount = (e) => {
      haptic(30);
      session++;
      const ps = getPracticeStats(data);
      ps.total++;
      ps.daily++;
      ps.dailyDate = todayStr();
      patch('counter', data);

      // Spawn ripple at tap position
      // On touchend, e.touches is empty; use e.changedTouches instead
      const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      const cx = touch ? touch.clientX : e.clientX;
      const cy = touch ? touch.clientY : e.clientY;
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

    tapArea.addEventListener('click', doCount);
    tapArea.addEventListener('touchend', (e) => { e.preventDefault(); doCount(e); }, { passive: false });
    tapArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doCount(e); } });
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
    session = 0;
    patch('counter', data);
    haptic(30);
    updateUI();
    showToast(t('counter_reset_all'));
  });

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
        <button class="counter-goal-custom-btn" id="goalCustomConfirm">${t('counter_goal_custom')}</button>
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

  const customLabel = escapeHtml(data.customPractice || CUSTOM_KEY);
  const isCustomActive = data.practice === CUSTOM_KEY;

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
      <button class="counter-practice-opt counter-practice-opt--custom${isCustomActive ? ' counter-practice-opt--active' : ''}"
              id="practiceCustomOpt" data-name="${CUSTOM_KEY}">${customLabel}</button>
      <div class="counter-custom-input-wrap${isCustomActive ? '' : ' counter-custom-input-wrap--hidden'}" id="customInputWrap">
        <div class="counter-goal-custom-row">
          <input class="counter-goal-custom-input" id="customPracticeInput" type="text"
                 maxlength="20" placeholder="${t('counter_custom_practice_hint')}"
                 value="${escapeHtml(data.customPractice || '')}">
          <button class="counter-goal-custom-btn" id="customPracticeConfirm">${t('counter_practice_custom_confirm')}</button>
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

  // Custom option: toggle input row
  const customOpt = sheet.querySelector('#practiceCustomOpt');
  const customWrap = sheet.querySelector('#customInputWrap');
  customOpt.addEventListener('click', () => {
    const visible = !customWrap.classList.contains('counter-custom-input-wrap--hidden');
    customWrap.classList.toggle('counter-custom-input-wrap--hidden', visible);
    if (!visible) sheet.querySelector('#customPracticeInput').focus();
  });

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
