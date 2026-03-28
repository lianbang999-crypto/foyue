/* ===== Wenku Module — Library Home & Series Views ===== */
import '../css/wenku.css';
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { escapeHtml, debounce, showToast } from './utils.js';
import { getWenkuSeries, getWenkuDocuments, searchWenku } from './wenku-api.js';

/* Bookmark helpers — localStorage based, capped at 100 entries */
const BM_KEY = 'wenku-bookmarks';
const BM_MAX = 100;

function getBookmarks() {
  try { return JSON.parse(localStorage.getItem(BM_KEY) || '{}'); } catch { return {}; }
}

export function saveBookmark(docId, percent, title, seriesName) {
  const bm = getBookmarks();
  bm[docId] = { percent, title, seriesName, ts: Date.now() };
  const keys = Object.keys(bm);
  if (keys.length > BM_MAX) {
    const sorted = keys.sort((a, b) => (bm[a].ts || 0) - (bm[b].ts || 0));
    const toRemove = sorted.slice(0, keys.length - BM_MAX);
    toRemove.forEach(k => delete bm[k]);
  }
  try { localStorage.setItem(BM_KEY, JSON.stringify(bm)); } catch { /* full */ }
}

export function getBookmark(docId) {
  return getBookmarks()[docId] || null;
}

export function getRecentBookmark() {
  const bm = getBookmarks();
  let best = null;
  for (const [id, v] of Object.entries(bm)) {
    if (!best || v.ts > best.ts) best = { id, ...v };
  }
  return best;
}

/** Get the N most recent bookmarks */
function getRecentBookmarks(limit = 5) {
  const bm = getBookmarks();
  return Object.entries(bm)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}

/** Count how many documents in a series have bookmarks */
function getSeriesReadCount(seriesName) {
  const bm = getBookmarks();
  let count = 0;
  for (const v of Object.values(bm)) {
    if (v.seriesName === seriesName && v.percent > 0) count++;
  }
  return count;
}

/** Get most recent bookmark timestamp for a series (for sorting) */
function getSeriesLatestTs(seriesName) {
  const bm = getBookmarks();
  let latest = 0;
  for (const v of Object.values(bm)) {
    if (v.seriesName === seriesName && v.ts > latest) latest = v.ts;
  }
  return latest;
}

/* Navigation lock to prevent double-clicks */
let _navLock = false;

/* Scroll position memory */
let _homeScrollTop = 0;
let _seriesScrollTop = 0;

/* ===== Render Wenku Home ===== */
export async function renderWenkuHome(backFn, { skipPush } = {}) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());

  if (!skipPush) {
    window.history.pushState({ wenku: 'home' }, '', '/?tab=wenku');
  }

  const page = document.createElement('div');
  page.className = 'wenku-page active';
  /* placeholder: header + search + skeleton */
  page.innerHTML = buildHomeHeader() +
    '<div id="wenkuHomeContent">' + skeletonCards(4) + '</div>';
  dom.contentArea.appendChild(page);

  page.querySelector('#wenkuBackHome').addEventListener('click', () => {
    if (backFn) { backFn(); window.history.replaceState({}, '', '/'); }
    else history.back();
  });

  // Search toggle
  wireSearch(page);

  const content = page.querySelector('#wenkuHomeContent');

  let data;
  try {
    data = await getWenkuSeries();
  } catch { data = null; }

  if (!data || !data.series || !data.series.length) {
    content.innerHTML = buildErrorOrEmpty(data === null, () => renderWenkuHome(backFn));
    return;
  }

  content.innerHTML = buildHomeContent(data);
  wireHomeEvents(content, backFn);

  // Restore scroll position
  if (_homeScrollTop > 0) {
    requestAnimationFrame(() => { dom.contentArea.scrollTop = _homeScrollTop; _homeScrollTop = 0; });
  }
}

/* ===== Render Wenku Series Detail ===== */
export async function renderWenkuSeries(seriesName, backFn, { skipPush } = {}) {
  const dom = getDOM();
  // Save home scroll position
  _homeScrollTop = dom.contentArea.scrollTop;

  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());

  if (!skipPush) {
    window.history.pushState({ wenku: seriesName }, '', `/?wenku=${encodeURIComponent(seriesName)}`);
  }

  const page = document.createElement('div');
  page.className = 'wenku-page active';
  page.innerHTML = `
    <div class="wenku-header">
      <button class="wenku-back" id="wenkuBackSeries"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
      <div class="wenku-header-info">
        <div class="wenku-header-title">${escapeHtml(seriesName)}</div>
        <div class="wenku-header-sub">${t('wenku_da_an') || '大安法师'}</div>
      </div>
    </div>
    <div id="wenkuSeriesContent">${skeletonCards(3)}</div>
  `;
  dom.contentArea.appendChild(page);

  page.querySelector('#wenkuBackSeries').addEventListener('click', () => history.back());

  const content = page.querySelector('#wenkuSeriesContent');

  let data;
  try {
    data = await getWenkuDocuments(seriesName);
  } catch { data = null; }

  if (!data || !data.documents || !data.documents.length) {
    content.innerHTML = buildErrorOrEmpty(data === null, () => renderWenkuSeries(seriesName, backFn));
    return;
  }

  const bookmarks = getBookmarks();
  let html = `<div class="wenku-section-title">${data.documents.length} ${t('wenku_lectures_suffix') || '讲'}</div>`;
  html += '<div class="wenku-ep-list">';
  data.documents.forEach((doc, idx) => {
    const bm = bookmarks[doc.id];
    const badge = bm ? `<span class="wenku-ep-badge">${Math.round(bm.percent)}%</span>` : '';
    const num = idx + 1;
    html += `
      <div class="wenku-ep-item" data-doc-id="${escapeHtml(doc.id)}">
        <span class="wenku-ep-num">${num}</span>
        <span class="wenku-ep-title">${escapeHtml(doc.title)}</span>
        ${badge}
      </div>`;
  });
  html += '</div>';
  content.innerHTML = html;

  content.querySelectorAll('.wenku-ep-item').forEach(item => {
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('click', () => {
      const docId = item.dataset.docId;
      _seriesScrollTop = dom.contentArea.scrollTop;
      import('./wenku-reader.js').then(mod => mod.openReader(docId)).catch(() => showToast(t('loading_fail') || '加载失败'));
    });
  });

  // Restore scroll position
  if (_seriesScrollTop > 0) {
    requestAnimationFrame(() => { dom.contentArea.scrollTop = _seriesScrollTop; _seriesScrollTop = 0; });
  }
}

/* ===== Build Helpers ===== */

function buildHomeHeader() {
  return `
    <div class="wenku-header">
      <button class="wenku-back" id="wenkuBackHome"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
      <div class="wenku-header-info">
        <div class="wenku-header-title">${t('my_wenku')}</div>
        <div class="wenku-header-sub">${t('my_wenku_desc')}</div>
      </div>
      <button class="wenku-search-btn" id="wenkuSearchToggle" aria-label="${t('wenku_search_placeholder') || '搜索讲义'}">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>
    <div class="wenku-search-box" id="wenkuSearchBox" style="display:none">
      <input class="wenku-search-input" id="wenkuSearchInput" type="search" placeholder="${t('wenku_search_placeholder') || '搜索讲义...'}" autocomplete="off">
    </div>`;
}

function skeletonCards(n) {
  let h = '<div class="wenku-skeleton wenku-skeleton-title"></div>';
  for (let i = 0; i < n; i++) h += '<div class="wenku-skeleton wenku-skeleton-card"></div>';
  return h;
}

function buildErrorOrEmpty(isError, retryFn) {
  if (isError) {
    const id = 'wenkuRetry_' + Date.now();
    setTimeout(() => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => { btn.disabled = true; retryFn(); });
    }, 0);
    return `<div class="wenku-empty">
      <div style="margin-bottom:12px">${t('loading_fail') || '加载失败'}</div>
      <button class="wenku-retry-btn" id="${id}">${t('retry') || '重试'}</button>
    </div>`;
  }
  return `<div class="wenku-empty">${t('no_content') || '暂无内容'}</div>`;
}

function buildHomeContent(data) {
  let html = '';

  // Continue reading (most recent bookmark)
  const recent = getRecentBookmark();
  if (recent && recent.percent > 0 && recent.percent < 100) {
    html += `
      <div class="wenku-continue" id="wenkuContinue" data-doc-id="${escapeHtml(recent.id)}">
        <div class="wenku-continue-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wenku-continue-body">
          <div class="wenku-continue-title">${escapeHtml(recent.title || recent.id)}</div>
          <div class="wenku-continue-sub">${recent.seriesName ? escapeHtml(recent.seriesName) + ' · ' : ''}${(t('wenku_read_pct') || '已读 {n}%').replace('{n}', Math.round(recent.percent))}</div>
        </div>
        <div class="wenku-continue-progress"><div class="wenku-continue-progress-fill" style="width:${recent.percent}%"></div></div>
      </div>`;
  }

  // Recent reads section (up to 5)
  const recentReads = getRecentBookmarks(5);
  if (recentReads.length > 1) {
    html += `<div class="wenku-section-title">${t('wenku_recent_reads') || '最近阅读'}</div>`;
    html += '<div class="wenku-recent-list">';
    recentReads.forEach(r => {
      html += `
        <div class="wenku-recent-item" data-doc-id="${escapeHtml(r.id)}">
          <div class="wenku-recent-body">
            <div class="wenku-recent-title">${escapeHtml(r.title || r.id)}</div>
            <div class="wenku-recent-sub">${r.seriesName ? escapeHtml(r.seriesName) + ' · ' : ''}${Math.round(r.percent || 0)}%</div>
          </div>
          <div class="wenku-recent-pct">${Math.round(r.percent || 0)}%</div>
        </div>`;
    });
    html += '</div>';
  }

  // Sort series: recently-read series first, then server order
  const sortedSeries = [...data.series].sort((a, b) => {
    const tsA = getSeriesLatestTs(a.series_name);
    const tsB = getSeriesLatestTs(b.series_name);
    if (tsA && !tsB) return -1;
    if (!tsA && tsB) return 1;
    if (tsA && tsB) return tsB - tsA;
    return 0;
  });

  // Series list
  html += `<div class="wenku-section-title">${(t('wenku_da_an_series') || '大安法师讲记')} · ${data.series.length} ${(t('wenku_lectures_suffix') || '部')}</div>`;
  html += '<div class="wenku-series-list">';
  sortedSeries.forEach(s => {
    const readCount = getSeriesReadCount(s.series_name);
    const metaParts = [s.count + ' ' + (t('wenku_lectures_suffix') || '讲')];
    if (readCount > 0) metaParts.push((t('wenku_read_pct') || '已读 {n}').replace('{n}', readCount + '/' + s.count));
    html += `
      <div class="wenku-series-card" data-series="${escapeHtml(s.series_name)}">
        <div class="wenku-series-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wenku-series-body">
          <div class="wenku-series-name">${escapeHtml(s.series_name)}</div>
          <div class="wenku-series-meta">${metaParts.join(' · ')}</div>
        </div>
        <svg class="wenku-series-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
      </div>`;
  });
  html += '</div>';

  // Donglin link
  html += `
    <a class="wenku-donglin" href="https://www.lsdls.cn" target="_blank" rel="noopener" id="wenkuDonglinLink">
      <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      ${t('wenku_donglin_library') || '东林寺文库'}
    </a>`;

  return html;
}

function wireHomeEvents(content, backFn) {
  // Continue reading card
  const continueCard = content.querySelector('#wenkuContinue');
  if (continueCard) {
    continueCard.setAttribute('role', 'button');
    continueCard.setAttribute('tabindex', '0');
    continueCard.addEventListener('click', () => {
      const docId = continueCard.dataset.docId;
      import('./wenku-reader.js').then(mod => mod.openReader(docId)).catch(() => showToast(t('loading_fail') || '加载失败'));
    });
  }

  // Recent read items
  content.querySelectorAll('.wenku-recent-item').forEach(item => {
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('click', () => {
      const docId = item.dataset.docId;
      import('./wenku-reader.js').then(mod => mod.openReader(docId)).catch(() => showToast(t('loading_fail') || '加载失败'));
    });
  });

  // Series cards — with debounce lock and visual feedback
  content.querySelectorAll('.wenku-series-card').forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => {
      if (_navLock) return;
      _navLock = true;
      card.style.opacity = '0.6';
      setTimeout(() => { _navLock = false; }, 600);
      const seriesName = card.dataset.series;
      renderWenkuSeries(seriesName, () => renderWenkuHome(backFn));
    });
  });
}

/* ===== Search ===== */
function wireSearch(page) {
  const toggleBtn = page.querySelector('#wenkuSearchToggle');
  const searchBox = page.querySelector('#wenkuSearchBox');
  const searchInput = page.querySelector('#wenkuSearchInput');
  if (!toggleBtn || !searchBox || !searchInput) return;

  let searchResultsEl = null;

  toggleBtn.addEventListener('click', () => {
    const visible = searchBox.style.display !== 'none';
    searchBox.style.display = visible ? 'none' : 'block';
    if (!visible) searchInput.focus();
    else {
      searchInput.value = '';
      if (searchResultsEl) { searchResultsEl.remove(); searchResultsEl = null; }
    }
  });

  const doSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      if (searchResultsEl) { searchResultsEl.remove(); searchResultsEl = null; }
      return;
    }

    if (!searchResultsEl) {
      searchResultsEl = document.createElement('div');
      searchResultsEl.className = 'wenku-search-results';
      searchBox.after(searchResultsEl);
    }
    searchResultsEl.innerHTML = `<div class="wenku-loading">${t('wenku_searching') || '搜索中...'}</div>`;

    let results;
    try {
      results = await searchWenku(q);
    } catch {
      results = null;
    }
    if (!results || !results.documents || !results.documents.length) {
      const msg = results === null ? (t('search_wenku_error') || '搜索失败，请稍后重试') : (t('wenku_no_search_results') || '未找到相关讲义');
      searchResultsEl.innerHTML = `<div class="wenku-empty">${msg}</div>`;
      return;
    }

    let html = '<div class="wenku-ep-list">';
    results.documents.forEach((doc, idx) => {
      html += `
        <div class="wenku-ep-item wenku-search-result-item" data-doc-id="${escapeHtml(doc.id)}" data-query="${escapeHtml(q)}">
          <span class="wenku-ep-num">${idx + 1}</span>
          <span class="wenku-ep-title">${escapeHtml(doc.title)}</span>
        </div>`;
    });
    html += '</div>';
    searchResultsEl.innerHTML = html;

    searchResultsEl.querySelectorAll('.wenku-search-result-item').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('click', () => {
        const docId = item.dataset.docId;
        const query = item.dataset.query;
        import('./wenku-reader.js').then(mod => mod.openReader(docId, query)).catch(() => showToast(t('loading_fail') || '加载失败'));
      });
    });
  }, 500);

  searchInput.addEventListener('input', doSearch);
}
