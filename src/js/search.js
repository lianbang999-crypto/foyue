/* ===== Search ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { playList } from './player.js';
import { aiSearch } from './ai-client.js';
import { escapeHtml } from './utils.js';

let searchMode = 'keyword'; // 'keyword' | 'semantic'
let _showEpisodes, _renderCategory, _renderHomePage;
let searchRequestId = 0;

function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const esc = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="search-hl">$1</mark>');
}

export function doSearch(q, showEpisodes, renderCategory, renderHomePage) {
  if (showEpisodes) _showEpisodes = showEpisodes;
  if (renderCategory) _renderCategory = renderCategory;
  if (renderHomePage) _renderHomePage = renderHomePage;

  if (searchMode === 'semantic' && q && q.length >= 2) {
    doSemanticSearch(q);
    return;
  }
  doKeywordSearch(q, _showEpisodes, _renderCategory, _renderHomePage);
}

function doKeywordSearch(q, showEpisodes, renderCategory, renderHomePage) {
  const dom = getDOM();
  if (!q || !state.data) {
    if (state.tab === 'home' && renderHomePage) renderHomePage();
    else if (renderCategory) renderCategory(state.tab);
    return;
  }
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const ql = q.toLowerCase();
  const seriesResults = [];
  const epResults = [];
  state.data.categories.forEach(cat => {
    cat.series.forEach(s => {
      if (s.title.toLowerCase().includes(ql) || (s.titleEn || '').toLowerCase().includes(ql))
        seriesResults.push({ series: s, catId: cat.id });
      s.episodes.forEach((ep, idx) => {
        if ((ep.title || ep.fileName || '').toLowerCase().includes(ql))
          epResults.push({ series: s, ep, idx, catId: cat.id });
      });
    });
  });
  const totalCount = seriesResults.length + epResults.length;
  const wrap = document.createElement('div');
  wrap.className = 'view active';

  wrap.appendChild(buildSearchToggle());

  if (!totalCount) {
    const noResult = document.createElement('div');
    noResult.className = 'loader-text';
    noResult.textContent = t('no_results');
    wrap.appendChild(noResult);
  } else {
    const label = document.createElement('div');
    label.className = 'search-label';
    label.textContent = `${t('search_results')} (${totalCount})`;
    wrap.appendChild(label);

    if (seriesResults.length) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'search-group-label';
      groupLabel.textContent = t('search_series') || '\u7CFB\u5217';
      wrap.appendChild(groupLabel);
      const ul = document.createElement('ul');
      ul.className = 'ep-list';
      seriesResults.forEach(r => {
        const li = document.createElement('li');
        li.className = 'ep-item';
        li.innerHTML = `<span class="ep-num" style="color:var(--accent)">\u2022</span><span class="ep-title">${highlight(r.series.title, q)} <small style="color:var(--text-muted)">(${r.series.totalEpisodes}${t('episodes')})</small></span>`;
        li.addEventListener('click', () => {
          const dom2 = getDOM();
          dom2.searchInput.value = '';
          dom2.searchRow.classList.remove('show');
          document.getElementById('btnSearch').classList.remove('active');
          if (_showEpisodes) _showEpisodes(r.series, r.catId);
        });
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }

    if (epResults.length) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'search-group-label';
      groupLabel.textContent = t('search_episodes') || '\u5355\u96C6';
      wrap.appendChild(groupLabel);
      const ul = document.createElement('ul');
      ul.className = 'ep-list';
      epResults.slice(0, 50).forEach(r => {
        const li = document.createElement('li');
        li.className = 'ep-item';
        li.innerHTML = `<span class="ep-num">${r.ep.id || r.idx + 1}</span><span class="ep-title">${highlight(r.ep.title || r.ep.fileName, q)} <small style="color:var(--text-muted)">\u00B7 ${escapeHtml(r.series.title)}</small></span>`;
        li.addEventListener('click', () => playList(r.series.episodes, r.idx, r.series));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
  }
  dom.contentArea.appendChild(wrap);
}

async function doSemanticSearch(q) {
  const currentId = ++searchRequestId;
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'view active';
  wrap.appendChild(buildSearchToggle());

  const loading = document.createElement('div');
  loading.className = 'loader-text';
  loading.innerHTML = '<span class="ai-loading-dot"></span> AI 搜索中...';
  wrap.appendChild(loading);
  dom.contentArea.appendChild(wrap);

  try {
    const { results } = await aiSearch(q);
    if (currentId !== searchRequestId) return;

    // 清空保留 toggle（第一个子元素）
    while (wrap.children.length > 1) wrap.removeChild(wrap.lastChild);

    if (!results || !results.length) {
      const noResult = document.createElement('div');
      noResult.className = 'loader-text';
      noResult.textContent = t('no_results');
      wrap.appendChild(noResult);
      return;
    }

    const label = document.createElement('div');
    label.className = 'search-label';
    label.textContent = `AI 语义搜索结果 (${results.length})`;
    wrap.appendChild(label);

    const ul = document.createElement('ul');
    ul.className = 'ep-list';
    results.forEach(r => {
      const li = document.createElement('li');
      li.className = 'ep-item';
      const scoreTag = `<small style="color:var(--accent);margin-left:4px">${Math.round(r.score * 100)}%</small>`;
      li.innerHTML = `<span class="ep-num" style="color:var(--accent)">AI</span><span class="ep-title">${escapeHtml(r.title)} ${scoreTag}${r.snippet ? '<br><small style="color:var(--text-secondary)">' + escapeHtml(r.snippet.slice(0, 80)) + '...</small>' : ''}</span>`;
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  } catch (err) {
    if (currentId !== searchRequestId) return;
    while (wrap.children.length > 1) wrap.removeChild(wrap.lastChild);
    const errDiv = document.createElement('div');
    errDiv.className = 'loader-text';
    errDiv.textContent = err.message || 'AI搜索暂不可用';
    wrap.appendChild(errDiv);
  }
}

function buildSearchToggle() {
  const toggle = document.createElement('div');
  toggle.className = 'search-mode-toggle';
  toggle.setAttribute('role', 'radiogroup');
  toggle.setAttribute('aria-label', '搜索模式');
  toggle.innerHTML = `
    <button class="search-mode-btn ${searchMode === 'keyword' ? 'active' : ''}" data-mode="keyword" role="radio" aria-checked="${searchMode === 'keyword'}">关键词</button>
    <button class="search-mode-btn ${searchMode === 'semantic' ? 'active' : ''}" data-mode="semantic" role="radio" aria-checked="${searchMode === 'semantic'}">智能搜索</button>
  `;
  toggle.querySelectorAll('.search-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      searchMode = btn.dataset.mode;
      toggle.querySelectorAll('.search-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === searchMode);
        b.setAttribute('aria-checked', String(b.dataset.mode === searchMode));
      });
      const dom = getDOM();
      const q = dom.searchInput.value.trim();
      if (q) doSearch(q);
    });
  });
  return toggle;
}
