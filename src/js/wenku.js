/* ===== Wenku Module — Library Home & Series Views ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { escapeHtml } from './utils.js';
import { getWenkuSeries, getWenkuDocuments } from './wenku-api.js';

/* Bookmark helpers — localStorage based */
const BM_KEY = 'wenku-bookmarks';

function getBookmarks() {
  try { return JSON.parse(localStorage.getItem(BM_KEY) || '{}'); } catch { return {}; }
}

export function saveBookmark(docId, percent, title, seriesName) {
  const bm = getBookmarks();
  bm[docId] = { percent, title, seriesName, ts: Date.now() };
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

/* ===== Render Wenku Home ===== */
export async function renderWenkuHome(backFn) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());

  const page = document.createElement('div');
  page.className = 'wenku-page active';
  page.innerHTML = `
    <div class="wenku-header">
      <button class="wenku-back" id="wenkuBackHome"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
      <div class="wenku-header-info">
        <div class="wenku-header-title">${t('my_wenku')}</div>
        <div class="wenku-header-sub">${t('my_wenku_desc')}</div>
      </div>
    </div>
    <div id="wenkuHomeContent"><div class="wenku-loading">${t('search_wenku_loading') || '加载中...'}</div></div>
  `;
  dom.contentArea.appendChild(page);

  // Back button
  page.querySelector('#wenkuBackHome').addEventListener('click', () => {
    if (backFn) backFn();
  });

  // Load data
  const content = page.querySelector('#wenkuHomeContent');
  const data = await getWenkuSeries();

  if (!data || !data.series || !data.series.length) {
    content.innerHTML = '<div class="wenku-empty">暂无内容</div>';
    return;
  }

  let html = '';

  // Continue reading
  const recent = getRecentBookmark();
  if (recent && recent.percent > 0 && recent.percent < 100) {
    html += `
      <div class="wenku-continue" id="wenkuContinue" data-doc-id="${escapeHtml(recent.id)}">
        <div class="wenku-continue-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wenku-continue-body">
          <div class="wenku-continue-title">${escapeHtml(recent.title || recent.id)}</div>
          <div class="wenku-continue-sub">${recent.seriesName ? escapeHtml(recent.seriesName) + ' · ' : ''}已读 ${Math.round(recent.percent)}%</div>
        </div>
        <div class="wenku-continue-progress"><div class="wenku-continue-progress-fill" style="width:${recent.percent}%"></div></div>
      </div>`;
  }

  // Series list
  html += `<div class="wenku-section-title">大安法师讲记 · ${data.series.length} 部</div>`;
  html += '<div class="wenku-series-list">';
  data.series.forEach(s => {
    html += `
      <div class="wenku-series-card" data-series="${escapeHtml(s.series_name)}">
        <div class="wenku-series-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wenku-series-body">
          <div class="wenku-series-name">${escapeHtml(s.series_name)}</div>
          <div class="wenku-series-meta">${s.count} 讲</div>
        </div>
        <svg class="wenku-series-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
      </div>`;
  });
  html += '</div>';

  // Donglin link
  html += `
    <a class="wenku-donglin" href="https://www.lsdls.cn" target="_blank" rel="noopener" id="wenkuDonglinLink">
      <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      东林寺文库
    </a>`;

  content.innerHTML = html;

  // Wire up continue reading
  const continueCard = content.querySelector('#wenkuContinue');
  if (continueCard) {
    continueCard.addEventListener('click', () => {
      const docId = continueCard.dataset.docId;
      import('./wenku-reader.js').then(mod => mod.openReader(docId));
    });
  }

  // Wire up series cards
  content.querySelectorAll('.wenku-series-card').forEach(card => {
    card.addEventListener('click', () => {
      const seriesName = card.dataset.series;
      renderWenkuSeries(seriesName, () => renderWenkuHome(backFn));
    });
  });
}

/* ===== Render Wenku Series Detail ===== */
async function renderWenkuSeries(seriesName, backFn) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());

  const page = document.createElement('div');
  page.className = 'wenku-page active';
  page.innerHTML = `
    <div class="wenku-header">
      <button class="wenku-back" id="wenkuBackSeries"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
      <div class="wenku-header-info">
        <div class="wenku-header-title">${escapeHtml(seriesName)}</div>
        <div class="wenku-header-sub">大安法师</div>
      </div>
    </div>
    <div id="wenkuSeriesContent"><div class="wenku-loading">${t('search_wenku_loading') || '加载中...'}</div></div>
  `;
  dom.contentArea.appendChild(page);

  page.querySelector('#wenkuBackSeries').addEventListener('click', () => {
    if (backFn) backFn();
  });

  const content = page.querySelector('#wenkuSeriesContent');
  const data = await getWenkuDocuments(seriesName);

  if (!data || !data.documents || !data.documents.length) {
    content.innerHTML = '<div class="wenku-empty">暂无内容</div>';
    return;
  }

  const bookmarks = getBookmarks();
  let html = `<div class="wenku-section-title">${data.documents.length} 讲</div>`;
  html += '<div class="wenku-ep-list">';
  data.documents.forEach((doc, idx) => {
    const bm = bookmarks[doc.id];
    const badge = bm ? `<span class="wenku-ep-badge">${Math.round(bm.percent)}%</span>` : '';
    const num = doc.episode_num || (idx + 1);
    html += `
      <div class="wenku-ep-item" data-doc-id="${escapeHtml(doc.id)}">
        <span class="wenku-ep-num">${num}</span>
        <span class="wenku-ep-title">${escapeHtml(doc.title)}</span>
        ${badge}
      </div>`;
  });
  html += '</div>';
  content.innerHTML = html;

  // Wire up episode clicks
  content.querySelectorAll('.wenku-ep-item').forEach(item => {
    item.addEventListener('click', () => {
      const docId = item.dataset.docId;
      import('./wenku-reader.js').then(mod => mod.openReader(docId));
    });
  });
}
