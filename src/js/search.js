/* ===== Search ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { playList } from './player.js';
import { escapeHtml } from './utils.js';

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
          playList(r.series.episodes, r.idx, r.series);
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

export function openSearchOverlay() {
  if (searchOverlay) {
    searchOverlay.classList.add('show');
    const input = searchOverlay.querySelector('.search-overlay-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'search-overlay show';
  overlay.id = 'searchOverlay';
  overlay.innerHTML = `
    <div class="search-overlay-header">
      <button class="search-overlay-back" id="searchOverlayBack" aria-label="返回">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="search-overlay-field">
        <svg viewBox="0 0 24 24" width="15" height="15"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
        <input class="search-overlay-input" type="text" placeholder="${t('search_placeholder')}" maxlength="100" autocomplete="off" autofocus>
      </div>
    </div>
    <div class="search-overlay-results" id="searchOverlayResults"></div>
  `;

  document.getElementById('app').appendChild(overlay);
  searchOverlay = overlay;

  const backBtn = overlay.querySelector('#searchOverlayBack');
  const input = overlay.querySelector('.search-overlay-input');
  const resultsArea = overlay.querySelector('#searchOverlayResults');

  backBtn.addEventListener('click', () => closeSearchOverlay());

  // ESC to close
  function onKeydown(e) {
    if (e.key === 'Escape') closeSearchOverlay();
  }
  document.addEventListener('keydown', onKeydown);
  overlay._onKeydown = onKeydown;

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = input.value.trim();
      renderSearchResults(q, resultsArea);
    }, 300);
  });

  // Focus input
  requestAnimationFrame(() => input.focus());
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
        playList(r.series.episodes, r.idx, r.series);
      });
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }
}
