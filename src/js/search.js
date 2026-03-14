/* ===== Search ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { playList } from './player.js';
import { getHistory } from './history.js';
import { escapeHtml } from './utils.js';
import { aiSearch } from './ai-client.js';

let _showEpisodes, _renderCategory, _renderHomePage;

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

  doKeywordSearch(q, _showEpisodes, _renderCategory, _renderHomePage);
}

function doKeywordSearch(q, showEpisodes, renderCategory, renderHomePage) {
  const dom = getDOM();
  if (!q || !state.data) {
    if (state.tab === 'home' && renderHomePage) renderHomePage();
    else if (renderCategory) renderCategory(state.tab);
    return;
  }
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());
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
          closeSearchOverlay();
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
        li.addEventListener('click', () => {
          closeSearchOverlay();
          const hist = getHistory();
          const hEntry = hist.find(h => h.seriesId === r.series.id && h.epIdx === r.idx);
          playList(r.series.episodes, r.idx, r.series, hEntry ? hEntry.time : 0);
        });
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
  }
  dom.contentArea.appendChild(wrap);
}

/* ===== Fullscreen Search Overlay ===== */
let searchOverlay = null;
let activeTab = 'audio'; // 'audio' | 'wenku'

export function openSearchOverlay() {
  if (searchOverlay) {
    searchOverlay.classList.add('show');
    const input = searchOverlay.querySelector('.search-overlay-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    // Reset to audio tab
    activeTab = 'audio';
    updateTabs();
    const resultsArea = searchOverlay.querySelector('#searchOverlayResults');
    if (resultsArea) resultsArea.innerHTML = `<div class="search-overlay-hint">${t('search_placeholder')}</div>`;
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'search-overlay show';
  overlay.id = 'searchOverlay';
  overlay.innerHTML = `
    <div class="search-overlay-header">
      <button class="search-overlay-back" id="searchOverlayBack" aria-label="\u8FD4\u56DE">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="search-overlay-field">
        <svg viewBox="0 0 24 24" width="15" height="15"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
        <input class="search-overlay-input" type="text" placeholder="${t('search_placeholder')}" maxlength="200" autocomplete="off" autofocus>
      </div>
    </div>
    <div class="search-overlay-tabs" id="searchTabs">
      <button class="search-tab active" data-tab="audio">${t('search_tab_audio') || '\u97F3\u9891'}</button>
      <button class="search-tab" data-tab="wenku">${t('search_tab_wenku') || '\u6587\u5E93'}</button>
    </div>
    <div class="search-overlay-results" id="searchOverlayResults"></div>
  `;

  document.getElementById('app').appendChild(overlay);
  searchOverlay = overlay;

  const backBtn = overlay.querySelector('#searchOverlayBack');
  const input = overlay.querySelector('.search-overlay-input');
  const resultsArea = overlay.querySelector('#searchOverlayResults');
  const tabBtns = overlay.querySelectorAll('.search-tab');

  backBtn.addEventListener('click', () => closeSearchOverlay());

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      updateTabs();
      const q = input.value.trim();
      if (q) triggerSearch(q, resultsArea);
    });
  });

  // ESC to close
  function onKeydown(e) {
    if (e.key === 'Escape') closeSearchOverlay();
  }
  document.addEventListener('keydown', onKeydown);
  overlay._onKeydown = onKeydown;

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const delay = activeTab === 'wenku' ? 600 : 300;
    searchTimer = setTimeout(() => {
      const q = input.value.trim();
      triggerSearch(q, resultsArea);
    }, delay);
  });

  // Focus input
  requestAnimationFrame(() => input.focus());
}

function updateTabs() {
  if (!searchOverlay) return;
  searchOverlay.querySelectorAll('.search-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
}

function triggerSearch(q, container) {
  if (activeTab === 'wenku') {
    renderWenkuResults(q, container);
  } else {
    renderSearchResults(q, container);
  }
}

export function closeSearchOverlay() {
  if (searchOverlay) {
    searchOverlay.classList.remove('show');
    if (searchOverlay._onKeydown) {
      document.removeEventListener('keydown', searchOverlay._onKeydown);
    }
  }
}

export function isSearchOverlayOpen() {
  return searchOverlay ? searchOverlay.classList.contains('show') : false;
}

/* ===== Audio keyword search results ===== */
function renderSearchResults(q, container) {
  container.innerHTML = '';
  if (!q || !state.data) {
    container.innerHTML = `<div class="search-overlay-hint">${t('search_placeholder')}</div>`;
    return;
  }

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
  if (!totalCount) {
    container.innerHTML = `<div class="search-overlay-hint">${t('no_results')}</div>`;
    return;
  }

  const label = document.createElement('div');
  label.className = 'search-label';
  label.textContent = `${t('search_results')} (${totalCount})`;
  container.appendChild(label);

  if (seriesResults.length) {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'search-group-label';
    groupLabel.textContent = t('search_series') || '\u7CFB\u5217';
    container.appendChild(groupLabel);
    const ul = document.createElement('ul');
    ul.className = 'ep-list';
    seriesResults.forEach(r => {
      const li = document.createElement('li');
      li.className = 'ep-item';
      li.innerHTML = `<span class="ep-num" style="color:var(--accent)">\u2022</span><span class="ep-title">${highlight(r.series.title, q)} <small style="color:var(--text-muted)">(${r.series.totalEpisodes}${t('episodes')})</small></span>`;
      li.addEventListener('click', () => {
        closeSearchOverlay();
        if (_showEpisodes) _showEpisodes(r.series, r.catId);
      });
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  if (epResults.length) {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'search-group-label';
    groupLabel.textContent = t('search_episodes') || '\u5355\u96C6';
    container.appendChild(groupLabel);
    const ul = document.createElement('ul');
    ul.className = 'ep-list';
    epResults.slice(0, 50).forEach(r => {
      const li = document.createElement('li');
      li.className = 'ep-item';
      li.innerHTML = `<span class="ep-num">${r.ep.id || r.idx + 1}</span><span class="ep-title">${highlight(r.ep.title || r.ep.fileName, q)} <small style="color:var(--text-muted)">\u00B7 ${escapeHtml(r.series.title)}</small></span>`;
      li.addEventListener('click', () => {
        closeSearchOverlay();
        const hist = getHistory();
        const hEntry = hist.find(h => h.seriesId === r.series.id && h.epIdx === r.idx);
        playList(r.series.episodes, r.idx, r.series, hEntry ? hEntry.time : 0);
      });
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }
}

/* ===== Wenku semantic search results ===== */
let _wenkuAbort = null;
let _wenkuReqId = 0;

async function renderWenkuResults(q, container) {
  // Cancel any in-flight request
  if (_wenkuAbort) _wenkuAbort.abort();
  _wenkuAbort = new AbortController();

  container.innerHTML = '';
  if (!q || q.length < 2) {
    container.innerHTML = `<div class="search-overlay-hint">${t('search_wenku_hint') || '\u8F93\u5165\u95EE\u9898\u641C\u7D22\u6587\u5E93\u8BB2\u4E49'}</div>`;
    return;
  }

  // Show loading
  container.innerHTML = `<div class="search-overlay-hint"><span class="ai-loading-dot"></span> ${t('search_wenku_loading') || '\u6B63\u5728\u641C\u7D22\u6587\u5E93...'}</div>`;

  const reqId = ++_wenkuReqId;
  try {
    const data = await aiSearch(q);
    // Check if this is still the latest request
    if (reqId !== _wenkuReqId) return;

    container.innerHTML = '';
    if (!data.results || !data.results.length) {
      container.innerHTML = `<div class="search-overlay-hint">${t('no_results')}</div>`;
      return;
    }

    const label = document.createElement('div');
    label.className = 'search-label';
    label.textContent = `${t('search_results')} (${data.results.length})`;
    container.appendChild(label);

    const list = document.createElement('div');
    list.className = 'wenku-results';

    data.results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'wenku-result-card';
      card.style.cursor = 'pointer';

      const titleHtml = escapeHtml(r.title);
      const seriesHtml = r.series_name ? `<span class="wenku-result-series">${escapeHtml(r.series_name)}</span>` : '';
      const categoryHtml = r.category ? `<span class="wenku-result-category">${escapeHtml(r.category)}</span>` : '';
      const snippetHtml = r.snippet ? `<div class="wenku-result-snippet">${escapeHtml(r.snippet)}</div>` : '';

      card.innerHTML = `
        <div class="wenku-result-header">
          <svg class="wenku-result-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" fill="currentColor"/></svg>
          <div class="wenku-result-title">${titleHtml}</div>
        </div>
        <div class="wenku-result-meta">${categoryHtml}${seriesHtml}</div>
        ${snippetHtml}
        <div class="wenku-result-action">${t('search_wenku_read') || '\u9605\u8BFB\u539F\u6587'} \u2192</div>
      `;

      // Open internal reader with highlight
      card.addEventListener('click', () => {
        closeSearchOverlay();
        import('./wenku-reader.js').then(mod => mod.openReader(r.doc_id, q));
      });

      list.appendChild(card);
    });
    container.appendChild(list);
  } catch (err) {
    if (reqId !== _wenkuReqId) return;
    if (err.name === 'AbortError') return;
    container.innerHTML = `<div class="search-overlay-hint">${t('search_wenku_error') || '\u641C\u7D22\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5'}</div>`;
  }
}
