/* ===== Search ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { playList } from './player.js';

export function doSearch(q, showEpisodes, renderCategory, renderHomePage) {
  const dom = getDOM();
  if (!q || !state.data) {
    if (state.tab === 'home') renderHomePage();
    else renderCategory(state.tab);
    return;
  }
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const ql = q.toLowerCase();
  const results = [];
  state.data.categories.forEach(cat => {
    cat.series.forEach(s => {
      if (s.title.toLowerCase().includes(ql) || (s.titleEn || '').toLowerCase().includes(ql))
        results.push({ type: 'series', series: s, catId: cat.id });
      s.episodes.forEach((ep, idx) => {
        if ((ep.title || ep.fileName || '').toLowerCase().includes(ql))
          results.push({ type: 'ep', series: s, ep, idx, catId: cat.id });
      });
    });
  });
  const wrap = document.createElement('div');
  wrap.className = 'view active';
  if (!results.length) {
    wrap.innerHTML = `<div class="loader-text">${t('no_results')}</div>`;
  } else {
    wrap.innerHTML = `<div class="search-label">${t('search_results')} (${results.length})</div>`;
    const ul = document.createElement('ul');
    ul.className = 'ep-list';
    results.slice(0, 50).forEach(r => {
      const li = document.createElement('li');
      li.className = 'ep-item';
      if (r.type === 'series') {
        li.innerHTML = `<span class="ep-num" style="color:var(--accent)">\u2022</span><span class="ep-title">${r.series.title} <small style="color:var(--text-muted)">(${r.series.totalEpisodes}${t('episodes')})</small></span>`;
        li.addEventListener('click', () => {
          dom.searchInput.value = '';
          dom.searchRow.classList.remove('show');
          document.getElementById('btnSearch').classList.remove('active');
          showEpisodes(r.series, r.catId);
        });
      } else {
        li.innerHTML = `<span class="ep-num">${r.ep.id || r.idx + 1}</span><span class="ep-title">${r.ep.title || r.ep.fileName} <small style="color:var(--text-muted)">\u00B7 ${r.series.title}</small></span>`;
        li.addEventListener('click', () => playList(r.series.episodes, r.idx, r.series));
      }
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }
  dom.contentArea.appendChild(wrap);
}
