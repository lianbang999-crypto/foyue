/* ===== 念佛计数器 (Buddhist Chanting Counter) ===== */
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { get, patch } from './store.js';
import { haptic, showToast } from './utils.js';

const BEADS_PER_LOOP = 108;
const MAX_GOAL = 999999; // practical upper bound for a daily recitation goal

/* ── Practice presets ── */
const PRACTICE_PRESETS = [
  '阿弥陀佛',
  '南无阿弥陀佛',
  '观世音菩萨',
  '大势至菩萨',
  '大悲咒',
  '往生咒',
  '心经',
  '礼佛',
];

/* ── Helpers ── */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getCounterData() {
  const data = get('counter') || { total: 0, daily: 0, dailyDate: '', loops: 0, goal: 108, practice: '阿弥陀佛' };
  // Ensure practice field exists for older saved data
  if (!data.practice) data.practice = '阿弥陀佛';
  // Reset daily count if it's a new day
  if (data.dailyDate !== todayStr()) {
    data.daily = 0;
    data.dailyDate = todayStr();
    patch('counter', data);
  }
  return data;
}

/* ── Main render ── */
export function openCounter() {
  const dom = getDOM();

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

  // Handle browser back button
  const popHandler = (e) => {
    if (e.state && e.state.counter) return;
    closeCounter(view, popHandler);
  };
  window.addEventListener('popstate', popHandler);
}

function buildCounterHTML(data, session) {
  const loops = Math.floor(data.total / BEADS_PER_LOOP);
  const beadPos = data.total % BEADS_PER_LOOP;
  const goalPct = data.goal > 0 ? Math.min(100, Math.round(data.daily / data.goal * 100)) : 0;
  const goalDone = data.goal > 0 && data.daily >= data.goal;
  const practice = data.practice || '阿弥陀佛';

  return `
    <div class="counter-header">
      <button class="counter-back btn-icon" id="counterBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <div class="counter-header-center">
        <span class="counter-header-title">${t('counter_title')}</span>
        <span class="counter-header-practice" id="ctrHeaderPractice">${practice}</span>
      </div>
      <button class="counter-menu btn-icon" id="counterMenu" aria-label="更多">
        <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
      </button>
    </div>

    <div class="counter-body">
      <!-- Stats row -->
      <div class="counter-stats">
        <div class="counter-stat">
          <div class="counter-stat-val" id="ctrSession">${session}</div>
          <div class="counter-stat-lbl">${t('counter_session')}</div>
        </div>
        <div class="counter-stat counter-stat--accent">
          <div class="counter-stat-val" id="ctrLoops">${loops}</div>
          <div class="counter-stat-lbl">${t('counter_loops')}</div>
        </div>
        <div class="counter-stat">
          <div class="counter-stat-val" id="ctrTotal">${data.total}</div>
          <div class="counter-stat-lbl">${t('counter_total')}</div>
        </div>
      </div>

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
          <!-- Practice name label -->
          <div class="counter-practice-label" id="ctrPracticeLabel">${practice}</div>
          <div class="counter-hint" id="counterHint">${t('counter_tap_hint')}</div>
        </div>
        <!-- Ripple container -->
        <div class="counter-ripples" id="counterRipples"></div>
      </div>

      <!-- Daily progress bar -->
      <div class="counter-daily-wrap">
        <div class="counter-daily-row">
          <span class="counter-daily-lbl">${t('counter_daily')}: <strong id="ctrDaily">${data.daily}</strong></span>
          <span class="counter-daily-goal" id="ctrGoalLabel">${goalDone ? '✓ ' : ''}${t('counter_goal')}: <span id="ctrGoalVal">${data.goal}</span></span>
        </div>
        <div class="counter-progress-bar">
          <div class="counter-progress-bar-fill${goalDone ? ' counter-progress-bar-fill--done' : ''}"
               id="ctrGoalBar" style="width:${goalPct}%"></div>
        </div>
        <div class="counter-per-loop">${t('counter_per_loop')} · ${t('counter_to_next_loop').replace('{n}', BEADS_PER_LOOP - (data.total % BEADS_PER_LOOP))}</div>
      </div>
    </div>

    <!-- Bottom actions -->
    <div class="counter-actions">
      <button class="counter-action-btn counter-action-btn--practice" id="counterSetPractice">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L8 6H3l2.5 7L3 18l5-1 4 5 4-5 5 1-2.5-5L21 6h-5z" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${t('counter_set_practice')}
      </button>
      <button class="counter-action-btn counter-action-btn--goal" id="counterSetGoal">
        <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>
        ${t('counter_goal')}
      </button>
      <button class="counter-action-btn" id="counterResetSession">
        <svg viewBox="0 0 24 24" width="18" height="18"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        ${t('counter_reset_session')}
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

function closeCounter(view, popHandler) {
  if (popHandler) window.removeEventListener('popstate', popHandler);
  view.classList.remove('counter-view--visible');
  setTimeout(() => view.remove(), 350);
}

function wireCounterEvents(view, data, _session) {
  let session = _session;

  /* ── Update UI helper ── */
  function updateUI() {
    const loops = Math.floor(data.total / BEADS_PER_LOOP);
    const beadPos = data.total % BEADS_PER_LOOP;
    const circum = Math.round(2 * Math.PI * 88);
    const offset = Math.round(circum * (1 - beadPos / BEADS_PER_LOOP));
    const goalPct = data.goal > 0 ? Math.min(100, Math.round(data.daily / data.goal * 100)) : 0;
    const goalDone = data.goal > 0 && data.daily >= data.goal;
    const practice = data.practice || '阿弥陀佛';

    const numEl = view.querySelector('#counterNumber');
    const sessionEl = view.querySelector('#ctrSession');
    const totalEl = view.querySelector('#ctrTotal');
    const loopsEl = view.querySelector('#ctrLoops');
    const dailyEl = view.querySelector('#ctrDaily');
    const barEl = view.querySelector('#ctrGoalBar');
    const goalLabelEl = view.querySelector('#ctrGoalLabel');
    const goalValEl = view.querySelector('#ctrGoalVal');
    const progressFill = view.querySelector('#counterProgressFill');
    const hintEl = view.querySelector('#counterHint');
    const practiceLabelEl = view.querySelector('#ctrPracticeLabel');
    const headerPracticeEl = view.querySelector('#ctrHeaderPractice');

    if (numEl) { numEl.textContent = session; numEl.classList.add('counter-number--bump'); setTimeout(() => numEl.classList.remove('counter-number--bump'), 180); }
    if (sessionEl) sessionEl.textContent = session;
    if (totalEl) totalEl.textContent = data.total;
    if (loopsEl) loopsEl.textContent = loops;
    if (dailyEl) dailyEl.textContent = data.daily;
    if (barEl) { barEl.style.width = goalPct + '%'; barEl.classList.toggle('counter-progress-bar-fill--done', goalDone); }
    if (goalLabelEl && goalValEl) { goalLabelEl.firstChild.textContent = (goalDone ? '✓ ' : '') + t('counter_goal') + ': '; goalValEl.textContent = data.goal; }
    if (progressFill) progressFill.style.strokeDashoffset = offset;
    if (hintEl) hintEl.style.display = session > 0 ? 'none' : '';
    if (practiceLabelEl) practiceLabelEl.textContent = practice;
    if (headerPracticeEl) headerPracticeEl.textContent = practice;
    const perLoopEl = view.querySelector('.counter-per-loop');
    if (perLoopEl) perLoopEl.textContent = t('counter_per_loop') + ' · ' + t('counter_to_next_loop').replace('{n}', BEADS_PER_LOOP - beadPos);
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
      haptic(12);
      session++;
      data.total++;
      data.daily++;
      data.dailyDate = todayStr();
      patch('counter', data);

      // Spawn ripple at tap position
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const cy = (e.touches ? e.touches[0].clientY : e.clientY);
      spawnRipple(cx, cy);

      const justCompletedLoop = data.total % BEADS_PER_LOOP === 0;
      if (justCompletedLoop) {
        haptic(40);
        showToast(t('counter_loop_done'));
      }

      const goalJustDone = data.goal > 0 && data.daily === data.goal;
      if (goalJustDone) {
        haptic(60);
        showToast(t('counter_daily_done'));
      }

      updateUI();
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

  /* ── Set practice ── */
  view.querySelector('#counterSetPractice').addEventListener('click', () => {
    showPracticePicker(view, data, () => updateUI());
  });

  /* ── Set goal ── */
  view.querySelector('#counterSetGoal').addEventListener('click', () => {
    const goals = [108, 216, 540, 1080, 3000, 10000];
    showGoalPicker(view, goals, data, () => updateUI());
  });

  /* ── Reset all ── */
  view.querySelector('#counterResetAll').addEventListener('click', () => {
    if (!window.confirm(t('counter_reset_confirm'))) return;
    data.total = 0;
    data.daily = 0;
    data.dailyDate = todayStr();
    data.loops = 0;
    session = 0;
    patch('counter', data);
    haptic(30);
    updateUI();
    showToast(t('counter_reset_all'));
  });
}

function showPracticePicker(parentView, data, onDone) {
  parentView.querySelectorAll('.counter-practice-sheet').forEach(el => el.remove());

  const sheet = document.createElement('div');
  sheet.className = 'counter-practice-sheet';
  const currentPractice = data.practice || '阿弥陀佛';
  const isCustom = !PRACTICE_PRESETS.includes(currentPractice);

  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="practiceBackdrop"></div>
    <div class="counter-goal-panel">
      <div class="counter-goal-panel-title">${t('counter_practice_hint')}</div>
      <div class="counter-goal-options counter-practice-options">
        ${PRACTICE_PRESETS.map(p => `<button class="counter-goal-opt${currentPractice === p ? ' counter-goal-opt--active' : ''}" data-practice="${p}">${p}</button>`).join('')}
      </div>
      <div class="counter-practice-custom-row">
        <input class="counter-practice-custom-input" id="practiceCustomInput" type="text"
          placeholder="${t('counter_practice_custom_placeholder')}"
          value="${isCustom ? currentPractice : ''}"
          maxlength="30"/>
        <button class="counter-practice-custom-confirm" id="practiceCustomConfirm">${t('counter_practice_custom_label')}</button>
      </div>
      <button class="counter-goal-cancel" id="practiceCancel">${t('cancel')}</button>
    </div>
  `;
  parentView.appendChild(sheet);

  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#practiceBackdrop').addEventListener('click', close);
  sheet.querySelector('#practiceCancel').addEventListener('click', close);

  // Preset buttons
  sheet.querySelectorAll('.counter-goal-opt[data-practice]').forEach(btn => {
    btn.addEventListener('click', () => {
      data.practice = btn.dataset.practice;
      patch('counter', data);
      haptic(15);
      onDone();
      close();
    });
  });

  // Custom input confirm
  sheet.querySelector('#practiceCustomConfirm').addEventListener('click', () => {
    const val = sheet.querySelector('#practiceCustomInput').value.trim();
    if (!val) {
      sheet.querySelector('#practiceCustomInput').focus();
      return;
    }
    data.practice = val;
    patch('counter', data);
    haptic(15);
    onDone();
    close();
  });

  // Allow Enter key in custom input
  sheet.querySelector('#practiceCustomInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sheet.querySelector('#practiceCustomConfirm').click();
    }
  });
}

function showGoalPicker(parentView, goals, data, onDone) {
  // Remove existing picker
  parentView.querySelectorAll('.counter-goal-sheet').forEach(el => el.remove());

  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="goalBackdrop"></div>
    <div class="counter-goal-panel">
      <div class="counter-goal-panel-title">${t('counter_goal_hint')}</div>
      <div class="counter-goal-options">
        ${goals.map(g => `<button class="counter-goal-opt${data.goal === g ? ' counter-goal-opt--active' : ''}" data-goal="${g}">${g}</button>`).join('')}
      </div>
      <div class="counter-practice-custom-row">
        <input class="counter-practice-custom-input" id="goalCustomInput" type="number"
          placeholder="${t('counter_goal_custom_placeholder')}"
          min="1" max="${MAX_GOAL}"/>
        <button class="counter-practice-custom-confirm" id="goalCustomConfirm">${t('counter_goal_custom')}</button>
      </div>
      <button class="counter-goal-cancel" id="goalCancel">${t('cancel')}</button>
    </div>
  `;
  parentView.appendChild(sheet);

  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#goalBackdrop').addEventListener('click', close);
  sheet.querySelector('#goalCancel').addEventListener('click', close);
  sheet.querySelectorAll('.counter-goal-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      data.goal = parseInt(btn.dataset.goal);
      patch('counter', data);
      haptic(15);
      onDone();
      close();
    });
  });

  // Custom goal input confirm
  sheet.querySelector('#goalCustomConfirm').addEventListener('click', () => {
    const val = parseInt(sheet.querySelector('#goalCustomInput').value);
    if (!val || val < 1 || val > MAX_GOAL) {
      sheet.querySelector('#goalCustomInput').focus();
      return;
    }
    data.goal = val;
    patch('counter', data);
    haptic(15);
    onDone();
    close();
  });

  sheet.querySelector('#goalCustomInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sheet.querySelector('#goalCustomConfirm').click();
    }
  });
}

