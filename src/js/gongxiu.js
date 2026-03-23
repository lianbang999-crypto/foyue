/**
 * 共修广场 — 莲友念佛共修与统一回向
 *
 * 功能：
 *   1. 功德池：实时展示今日/累计社区念佛声数
 *   2. 参与共修：提交今日念佛数据 + 选择回向
 *   3. 莲友共修流：社区成员的回向记录
 *
 * 佛法背景：
 *   共修（gòng xiū）= 大众共同修行，以功德回向法界一切众生。
 *   回向文（莲池大师）：
 *     "愿以此功德，庄严佛净土，上报四重恩，下济三途苦，
 *      若有见闻者，悉发菩提心，尽此一报身，同生极乐国。"
 */

import { t } from './i18n.js';
import { escapeHtml, showToast, formatCount, formatRelTime, HUIXIANG_TEXT, beijingTodayStr, HUIXIANG_DISPLAY_AUTO_MS } from './utils.js';
import { get as storeGet, patch as storePatch } from './store.js';

const CACHE_KEY             = 'gongxiu-cache';
const CACHE_TTL             = 60 * 1000; // 1 minute

const VOW_TYPES = {
  universal: '回向法界一切众生',
  blessing:  '消灾吉祥',
  rebirth:   '往生净土',
  custom:    '自定义',
};

// HUIXIANG_TEXT, formatCount, formatRelTime are imported from utils.js

// ── Helpers ──────────────────────────────────────────────────

function hasSubmittedToday() {
  const gongxiu = storeGet('gongxiu') || {};
  return gongxiu.submittedDate === beijingTodayStr();
}

function markSubmittedToday() {
  storePatch('gongxiu', { submittedDate: beijingTodayStr() });
}

function getVowLabel(entry) {
  if (entry.vow_type === 'blessing' && entry.vow_target)
    return `回向 ${escapeHtml(entry.vow_target)} 消灾吉祥`;
  if (entry.vow_type === 'rebirth' && entry.vow_target)
    return `回向 ${escapeHtml(entry.vow_target)} 往生净土`;
  if (entry.vow_type === 'custom' && entry.vow_custom)
    return escapeHtml(entry.vow_custom);
  return '回向法界一切众生';
}

function getCounterData() {
  const data = storeGet('counter');
  if (!data || !data.practices) return null;
  const ps = data.practices[data.practice];
  if (!ps) return null;
  const today = beijingTodayStr();
  const daily = (ps.dailyDate === today) ? (ps.daily || 0) : 0;
  const practiceName = data.practice === '__custom__'
    ? (data.customPractice || '念佛')
    : (data.practice || '南无阿弥陀佛');
  return { daily, practiceName, total: ps.total || 0 };
}

// ── Cache ──────────────────────────────────────────────────

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { }
}

function invalidateCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { }
}

// ── API ──────────────────────────────────────────────────────

async function fetchGongxiu() {
  const resp = await fetch('/api/gongxiu?limit=30');
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

async function postGongxiu(payload) {
  const resp = await fetch('/api/gongxiu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(data.error || 'HTTP ' + resp.status), data);
  return data;
}

// ── Entry card ───────────────────────────────────────────────

function buildEntryCard(entry, isToday) {
  const initial = (entry.nickname || '莲')[0];
  const vowLabel = getVowLabel(entry);
  const timeStr = formatRelTime(entry.created_at);
  const todayTag = isToday ? `<span class="gx-entry-today">今日</span>` : '';
  return `
    <div class="gx-entry">
      <div class="gx-entry-avatar">${escapeHtml(initial)}</div>
      <div class="gx-entry-body">
        <div class="gx-entry-meta">
          <span class="gx-entry-name">${escapeHtml(entry.nickname || '莲友')}</span>
          ${todayTag}
          <span class="gx-entry-time">${timeStr}</span>
        </div>
        <div class="gx-entry-practice">
          ${escapeHtml(entry.practice)} · <strong>${formatCount(entry.count)}</strong> 声
        </div>
        <div class="gx-entry-vow">${vowLabel}</div>
      </div>
    </div>`;
}

// ── 回向文全屏展示 ────────────────────────────────────────────

function showHuixiangScreen(container, vowInfo) {
  container.querySelectorAll('.gx-huixiang-screen').forEach(el => el.remove());

  const screen = document.createElement('div');
  screen.className = 'gx-huixiang-screen';

  const dedicateLine = (() => {
    if (!vowInfo) return '';
    if (vowInfo.type === 'blessing' && vowInfo.target)
      return `<div class="gx-hd-dedicate">回向 ${escapeHtml(vowInfo.target)} 消灾吉祥</div>`;
    if (vowInfo.type === 'rebirth' && vowInfo.target)
      return `<div class="gx-hd-dedicate">回向 ${escapeHtml(vowInfo.target)} 往生净土</div>`;
    if (vowInfo.type === 'custom' && vowInfo.custom)
      return `<div class="gx-hd-dedicate">${escapeHtml(vowInfo.custom)}</div>`;
    return '';
  })();

  screen.innerHTML = `
    <div class="gx-hd-content">
      <div class="gx-hd-lotus">🪷</div>
      <div class="gx-hd-text">${HUIXIANG_TEXT.replace(/\n/g, '<br>')}</div>
      ${dedicateLine}
      <div class="gx-hd-namo">南无阿弥陀佛</div>
      <div class="gx-hd-hint">点击关闭</div>
    </div>`;

  container.appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('gx-huixiang-screen--in'));

  const close = () => {
    screen.classList.remove('gx-huixiang-screen--in');
    setTimeout(() => screen.remove(), 400);
  };
  const autoClose = setTimeout(close, HUIXIANG_DISPLAY_AUTO_MS);
  screen.addEventListener('click', () => { clearTimeout(autoClose); close(); });
}

// ── 共修提交表单 ─────────────────────────────────────────────

function buildSubmitSection(counterData, submitted) {
  if (submitted) {
    const mergeLine = counterData && counterData.daily > 0
      ? `<div class="gx-submitted-merge">您今日念佛 <strong>${formatCount(counterData.daily)}</strong> 声已汇入共修功德。</div>`
      : '';
    return `
      <div class="gx-submitted-banner">
        <div class="gx-submitted-icon">🙏</div>
        <div class="gx-submitted-text">今日已参与共修<br><span>明日继续精进，随喜赞叹！</span></div>
      </div>
      ${mergeLine}`;
  }

  const countHint = counterData
    ? `今日已念 <strong>${formatCount(counterData.daily)}</strong> 声 · ${escapeHtml(counterData.practiceName)}`
    : '请先在念佛计数器中记录今日念佛';

  const hasCount = counterData && counterData.daily > 0;

  return `
    <div class="gx-submit-section" id="gxSubmitSection">
      <div class="gx-submit-hint">${countHint}</div>

      ${hasCount ? `
      <div class="gx-vow-picker" id="gxVowPicker">
        <div class="gx-field-label">回向</div>
        <div class="gx-vow-opts">
          <label class="gx-vow-opt gx-vow-opt--active" data-type="universal">
            <input type="radio" name="gxVow" value="universal" checked>
            <span class="gx-vow-dot"></span><span>回向法界一切众生</span>
          </label>
          <label class="gx-vow-opt" data-type="blessing">
            <input type="radio" name="gxVow" value="blessing">
            <span class="gx-vow-dot"></span><span>消灾吉祥</span>
          </label>
          <label class="gx-vow-opt" data-type="rebirth">
            <input type="radio" name="gxVow" value="rebirth">
            <span class="gx-vow-dot"></span><span>往生净土</span>
          </label>
          <label class="gx-vow-opt" data-type="custom">
            <input type="radio" name="gxVow" value="custom">
            <span class="gx-vow-dot"></span><span>自定义回向</span>
          </label>
        </div>
        <div class="gx-target-wrap gx-hidden" id="gxTargetWrap">
          <input class="gx-input" id="gxTargetInput" type="text" maxlength="30"
                 placeholder="为谁回向（姓名）">
        </div>
        <div class="gx-custom-wrap gx-hidden" id="gxCustomWrap">
          <textarea class="gx-input gx-textarea" id="gxCustomInput" rows="2" maxlength="100"
                    placeholder="自定义回向文（最多100字）"></textarea>
        </div>
      </div>
      <button class="gx-join-btn" id="gxJoinBtn">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        合掌参与共修
      </button>
      ` : `
      <button class="gx-counter-link-btn" id="gxCounterLink">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><polyline points="12,7 12,12 15.5,14"/>
        </svg>
        前往念佛计数
      </button>
      `}
    </div>`;
}

// ── 主渲染函数 ────────────────────────────────────────────────

export function renderGongxiu(container, onOpenCounter) {
  container.innerHTML = `
    <div class="gx-view" id="gxView">
      <div class="gx-merit-pool" id="gxMeritPool">
        <div class="gx-pool-loading">
          <svg class="gx-pool-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="9" stroke-dasharray="28 56" stroke-linecap="round"/>
          </svg>
          加载中…
        </div>
      </div>

      <div class="gx-section" id="gxParticipateSection">
        <div class="gx-section-title">参与今日共修</div>
        <div id="gxSubmitArea">
          <div class="gx-pool-loading">加载中…</div>
        </div>
      </div>

      <div class="gx-section">
        <div class="gx-section-title">莲友共修</div>
        <div class="gx-entries" id="gxEntries">
          <div class="gx-pool-loading">加载中…</div>
        </div>
      </div>

      <div class="gx-section">
        <button class="gx-huixiang-btn" id="gxHuixiangBtn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>
          </svg>
          统一回向
        </button>
      </div>

      <div class="gx-footer">南无阿弥陀佛</div>
    </div>`;

  const view = container.querySelector('#gxView');
  loadAndRender(view, onOpenCounter);
}

async function loadAndRender(view, onOpenCounter) {
  let data = getCached();
  if (!data) {
    try {
      data = await fetchGongxiu();
      setCache(data);
    } catch (err) {
      renderError(view, err);
      return;
    }
  }
  renderData(view, data, onOpenCounter);
}

function renderError(view, err) {
  const pool = view.querySelector('#gxMeritPool');
  if (pool) pool.innerHTML = `<div class="gx-error">加载失败，请稍后重试</div>`;
}

function renderData(view, data, onOpenCounter) {
  const today = beijingTodayStr();
  const submitted = hasSubmittedToday();
  const counterData = getCounterData();

  // 功德池
  const pool = view.querySelector('#gxMeritPool');
  if (pool) {
    pool.innerHTML = `
      <div class="gx-pool-inner">
        <div class="gx-pool-today">
          <div class="gx-pool-num">${formatCount(data.today_total || 0)}</div>
          <div class="gx-pool-lbl">今日 · ${data.today_participants || 0}人</div>
        </div>
        <div class="gx-pool-divider"></div>
        <div class="gx-pool-all">
          <div class="gx-pool-num gx-pool-num--sm">${formatCount(data.grand_total || 0)}</div>
          <div class="gx-pool-lbl">累计</div>
        </div>
      </div>`;
  }

  // 参与区
  const submitArea = view.querySelector('#gxSubmitArea');
  if (submitArea) {
    submitArea.innerHTML = buildSubmitSection(counterData, submitted);
    wireSubmitSection(view, submitArea, data, counterData, onOpenCounter);
  }

  // 莲友共修流
  const entriesEl = view.querySelector('#gxEntries');
  if (entriesEl) {
    const entries = data.entries || [];
    if (entries.length === 0) {
      entriesEl.innerHTML = `<div class="gx-empty">暂无共修记录，成为今日第一位参与者吧</div>`;
    } else {
      entriesEl.innerHTML = entries.map(e => buildEntryCard(e, e.date === today)).join('');
    }
  }

  // 统一回向按钮 — 用户手动触发，合掌回向今日共修功德
  const huixiangBtn = view.querySelector('#gxHuixiangBtn');
  if (huixiangBtn) {
    huixiangBtn.addEventListener('click', () => {
      // Show the full 回向文 ceremony with today's community total
      const gxFullscreen = view.closest('.gx-fullscreen') || view.parentElement;
      showHuixiangScreen(gxFullscreen, null); // null = universal dedication
    });
  }

  try {
    if (sessionStorage.getItem('gongxiu:scroll-to-submit')) {
      sessionStorage.removeItem('gongxiu:scroll-to-submit');
      requestAnimationFrame(() => {
        const el = view.querySelector('#gxParticipateSection');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('gx-section--flash');
          setTimeout(() => el.classList.remove('gx-section--flash'), 1400);
        }
      });
    }
  } catch { /* ignore */ }
}

function wireSubmitSection(view, submitArea, data, counterData, onOpenCounter) {
  // Counter link button
  const counterLink = submitArea.querySelector('#gxCounterLink');
  if (counterLink && onOpenCounter) {
    counterLink.addEventListener('click', onOpenCounter);
  }

  // Vow type radio switching
  submitArea.querySelectorAll('.gx-vow-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      submitArea.querySelectorAll('.gx-vow-opt').forEach(o => o.classList.remove('gx-vow-opt--active'));
      opt.classList.add('gx-vow-opt--active');
      const type = opt.dataset.type;
      submitArea.querySelector('#gxTargetWrap')?.classList.toggle('gx-hidden', type !== 'blessing' && type !== 'rebirth');
      submitArea.querySelector('#gxCustomWrap')?.classList.toggle('gx-hidden', type !== 'custom');
    });
  });

  // Join button
  const joinBtn = submitArea.querySelector('#gxJoinBtn');
  if (!joinBtn) return;

  joinBtn.addEventListener('click', async () => {
    if (!counterData || counterData.daily <= 0) {
      showToast('请先在念佛计数器中记录今日念佛');
      return;
    }

    const type    = submitArea.querySelector('input[name="gxVow"]:checked')?.value || 'universal';
    const target  = submitArea.querySelector('#gxTargetInput')?.value.trim() || '';
    const custom  = submitArea.querySelector('#gxCustomInput')?.value.trim() || '';

    if ((type === 'blessing' || type === 'rebirth') && !target) {
      showToast('请填写回向对象'); return;
    }
    if (type === 'custom' && !custom) {
      showToast('请填写自定义回向文'); return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = '提交中…';

    try {
      await postGongxiu({
        practice:   counterData.practiceName,
        count:      counterData.daily,
        vow_type:   type,
        vow_target: target,
        vow_custom: custom,
        nickname: '莲友',
      });

      markSubmittedToday();
      invalidateCache();

      // Show 回向文 full-screen
      const gxView = view.closest('.gx-fullscreen') || view.parentElement;
      showHuixiangScreen(gxView, { type, target, custom });

      // Replace submit section with "already submitted" banner
      submitArea.innerHTML = buildSubmitSection(counterData, true);

      // Refresh entry list after a moment
      setTimeout(async () => {
        try {
          const fresh = await fetchGongxiu();
          setCache(fresh);
          const entriesEl = view.querySelector('#gxEntries');
          const pool = view.querySelector('#gxMeritPool');
          const today = beijingTodayStr();
          if (entriesEl) entriesEl.innerHTML = (fresh.entries || []).map(e => buildEntryCard(e, e.date === today)).join('');
          if (pool) {
            const pNum = pool.querySelector('.gx-pool-today .gx-pool-num');
            if (pNum) {
              pNum.classList.remove('gx-pool-num--pulse');
              void pNum.offsetWidth;
              pNum.classList.add('gx-pool-num--pulse');
              pNum.textContent = formatCount(fresh.today_total || 0);
            }
            const pPart = pool.querySelector('.gx-pool-participants strong');
            if (pPart) pPart.textContent = fresh.today_participants || 0;
          }
        } catch { /* ignore refresh errors */ }
      }, 1500);

    } catch (err) {
      joinBtn.disabled = false;
      joinBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> 合掌参与共修`;
      if (err.alreadySubmitted) {
        markSubmittedToday();
        submitArea.innerHTML = buildSubmitSection(getCounterData(), true);
        showToast('今日已参与共修，明日继续精进');
      } else {
        showToast(err.message || '提交失败，请稍后重试');
      }
    }
  });
}
