/* ===== Practice Hub Page (修行) ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { get as storeGet } from './store.js';
import { escapeHtml } from './utils.js';

export function renderPracticePage() {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page,.practice-page').forEach(el => el.remove());

  const page = document.createElement('div');
  page.className = 'practice-page active';

  const counterData = storeGet('counter') || {};
  const practice = counterData.practice || '南无阿弥陀佛';
  const ps = counterData.practices?.[practice] || {};
  const todayCount = ps.dailyDate === todayStr() ? (ps.daily || 0) : 0;
  const totalCount = ps.total || 0;
  const goal = ps.goal || 108;
  const goalPct = goal > 0 ? Math.min(100, Math.round(todayCount / goal * 100)) : 0;
  const goalDone = todayCount >= goal;

  const streak = computeStreak(counterData, practice);
  const streakHtml = streak > 1
    ? `<div class="practice-streak">${t('counter_streak').replace('{n}', streak)}</div>`
    : '';

  const displayName = practice === '__custom__'
    ? escapeHtml(counterData.customPractice || t('counter_goal_custom'))
    : escapeHtml(practice);

  page.innerHTML = `
    <div class="practice-hero">
      <div class="practice-hero-icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="practice-hero-label">${displayName}</div>
      ${streakHtml}
    </div>

    <div class="practice-stats-row">
      <div class="practice-stat">
        <div class="practice-stat-val">${formatNum(todayCount)}</div>
        <div class="practice-stat-lbl">${t('counter_daily')}</div>
      </div>
      <div class="practice-stat-divider"></div>
      <div class="practice-stat">
        <div class="practice-stat-val">${formatNum(totalCount)}</div>
        <div class="practice-stat-lbl">${t('counter_total')}</div>
      </div>
      <div class="practice-stat-divider"></div>
      <div class="practice-stat">
        <div class="practice-stat-val">${goal}</div>
        <div class="practice-stat-lbl">${t('counter_gongke')}</div>
      </div>
    </div>

    <div class="practice-progress-section">
      <div class="practice-progress-bar">
        <div class="practice-progress-fill${goalDone ? ' done' : ''}" style="width:${goalPct}%"></div>
      </div>
      <div class="practice-progress-label">${goalDone ? (t('counter_daily_done') || '今日目标圆满！') : goalPct + '%'}</div>
    </div>

    <button class="practice-start-btn" id="practiceStartBtn">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
        <path d="M8 2.5C5.4 3.9 3.5 6.3 3 9"/>
      </svg>
      <span>${t('practice_start') || '开始念佛'}</span>
    </button>

    <div class="practice-actions">
      <div class="practice-action-card" id="practiceGongxiuCard">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"/>
          <path d="M12 16v2M12 6v2"/>
        </svg>
        <div class="practice-action-body">
          <div class="practice-action-title">${t('my_gongxiu')}</div>
          <div class="practice-action-desc">${t('my_gongxiu_desc')}</div>
        </div>
        <svg class="practice-action-arrow" viewBox="0 0 24 24" width="14" height="14"><polyline points="9,6 15,12 9,18" stroke="currentColor" fill="none" stroke-width="2"/></svg>
      </div>
    </div>

    <div class="practice-namo">${t('counter_namo')}</div>
  `;
  dom.contentArea.appendChild(page);

  page.querySelector('#practiceStartBtn').addEventListener('click', () => {
    import('./counter.js').then(mod => mod.openCounter()).catch(err => {
      console.error('[Counter] load failed:', err);
    });
  });

  page.querySelector('#practiceGongxiuCard').addEventListener('click', () => {
    showGongxiuFromPractice();
  });
}

function showGongxiuFromPractice() {
  document.querySelectorAll('.gx-fullscreen').forEach(el => el.remove());
  const panel = document.createElement('div');
  panel.className = 'gx-fullscreen';
  panel.innerHTML = `
    <div class="gx-fs-header">
      <button class="btn-icon" id="gxFsBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="gx-fs-title">${t('my_gongxiu')}</span>
      <div style="width:44px;flex-shrink:0"></div>
    </div>
    <div class="gx-view-wrap" style="flex:1;overflow:hidden;position:relative">
      <div id="gxContent" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    </div>`;

  document.getElementById('app').appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('gx-fullscreen--in'));

  const openCounter = () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => {
      panel.remove();
      import('./counter.js').then(mod => mod.openCounter());
    }, 320);
  };

  import('./gongxiu.js').then(mod => {
    mod.renderGongxiu(panel.querySelector('#gxContent'), openCounter);
  });

  panel.querySelector('#gxFsBack').addEventListener('click', () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => panel.remove(), 320);
  });
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function computeStreak(data, practice) {
  if (!data.practices?.[practice]?.history) return 0;
  const history = data.practices[practice].history;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (history[key] && history[key] > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}
