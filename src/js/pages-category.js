/* ===== Category & Episode Views ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { CATEGORY_ICONS, ICON_PLAY_FILLED, ICON_PAUSE_FILLED } from './icons.js';
import { playList, togglePlay, isCurrentTrack, getIsSwitching } from './player.js';
import { renderHomePage } from './pages-home.js';
import { getHistory } from './history.js';
import { getPlayCount, appreciate } from './api.js';
import { showToast } from './utils.js';

export function renderCategory(tabId) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const cat = state.data.categories.find(c => c.id === tabId);
  if (!cat) { dom.contentArea.innerHTML = `<div class="loader-text">${t('no_content')}</div>`; return; }
  const wrap = document.createElement('div');
  wrap.className = 'view active';
  const list = document.createElement('div');
  list.className = 'series-list';
  const unit = tabId === 'fohao' ? t('tracks') : t('episodes');
  const nowSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;

  cat.series.forEach(s => {
    const card = document.createElement('div');
    const isPlaying = s.id === nowSid;
    card.className = 'card' + (isPlaying ? ' now-playing' : '');
    const introHtml = s.intro ? `<div class="card-intro">${s.intro}</div>` : '';
    const playTag = isPlaying ? `<span class="card-playing-tag">${t('now_playing')}</span>` : '';
    const playCountText = s.playCount ? ` \u00B7 ${fmtCount(s.playCount)}${t('play_count_unit') || '\u6B21'}` : '';
    card.innerHTML = `<div class="card-icon">${CATEGORY_ICONS[tabId] || CATEGORY_ICONS.tingjingtai}</div>
      <div class="card-body"><div class="card-title">${s.title}${playTag}</div>${introHtml}<div class="card-meta">${s.speaker || ''} \u00B7 ${s.totalEpisodes} ${unit}${playCountText}</div></div>
      <span class="card-arrow"><svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg></span>`;
    card.addEventListener('click', () => showEpisodes(s, tabId));
    list.appendChild(card);
  });
  wrap.appendChild(list);
  dom.contentArea.appendChild(wrap);
}

export function showEpisodes(series, tabId) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  state.seriesId = series.id;
  const unit = tabId === 'fohao' ? t('tracks') : t('episodes');
  const introHdr = series.intro ? `<div class="ep-header-intro">${series.intro}</div>` : '';
  const view = document.createElement('div');
  view.className = 'view active ep-view';
  view.innerHTML = `<div class="ep-header">
    <button class="btn-back" id="backBtn"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
    <div class="ep-header-info"><div class="ep-header-title">${series.title}</div><div class="ep-header-sub">${series.speaker || ''} \u00B7 ${series.totalEpisodes} ${unit}<span id="epPlayCount"></span></div>${introHdr}</div>
    <button class="btn-play-all" id="playAllBtn" aria-label="${t('play_all')}"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></button>
  </div><div class="ep-actions" id="epActions"></div><ul class="ep-list" id="epList"></ul>`;
  dom.contentArea.appendChild(view);

  view.querySelector('#backBtn').addEventListener('click', () => {
    state.seriesId = null;
    if (state.tab === 'home') renderHomePage();
    else renderCategory(state.tab);
  });

  const playAllBtn = view.querySelector('#playAllBtn');
  function updatePlayAllBtn() {
    if (getIsSwitching()) return;
    const isThisSeries = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
    const playing = isThisSeries && !dom.audio.paused;
    playAllBtn.innerHTML = playing ? ICON_PAUSE_FILLED : ICON_PLAY_FILLED;
  }
  updatePlayAllBtn();
  dom.audio.addEventListener('play', updatePlayAllBtn);
  dom.audio.addEventListener('pause', updatePlayAllBtn);
  const obs = new MutationObserver(() => {
    if (!view.parentNode) { dom.audio.removeEventListener('play', updatePlayAllBtn); dom.audio.removeEventListener('pause', updatePlayAllBtn); obs.disconnect(); }
  });
  obs.observe(dom.contentArea, { childList: true });

  playAllBtn.addEventListener('click', () => {
    const isThisSeries = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
    if (isThisSeries) { togglePlay(); }
    else { playList(series.episodes, 0, series); }
  });

  const hasAudio = !!dom.audio.src;
  const alreadyPlaying = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
  if (!hasAudio && !alreadyPlaying && series.episodes.length) playList(series.episodes, 0, series);

  const ul = view.querySelector('#epList');
  const hist = getHistory();
  series.episodes.forEach((ep, idx) => {
    const li = document.createElement('li');
    li.className = 'ep-item' + (isCurrentTrack(series.id, idx) ? ' playing' : '');
    const introHtml = ep.intro ? `<span class="ep-intro">${ep.intro}</span>` : '';
    // Check history for played progress
    const hEntry = hist.find(h => h.seriesId === series.id && h.epIdx === idx);
    let progressHtml = '';
    if (hEntry && hEntry.duration > 0) {
      const pct = Math.min(100, Math.round(hEntry.time / hEntry.duration * 100));
      progressHtml = `<div class="ep-progress"><div class="ep-progress-fill" style="width:${pct}%"></div></div>`;
    }
    li.innerHTML = `<span class="ep-num">${ep.id || idx + 1}</span>
      <div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>
      <div class="ep-text"><span class="ep-title">${ep.title || ep.fileName}</span>${introHtml}${progressHtml}</div>`;
    li.addEventListener('click', () => {
      if (isCurrentTrack(series.id, idx)) { togglePlay(); return; }
      playList(series.episodes, idx, series);
    });
    ul.appendChild(li);
  });

  // Add appreciation button
  const actionsDiv = view.querySelector('#epActions');
  actionsDiv.innerHTML = `<button class="appreciate-btn" id="appreciateBtn">
    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" stroke="none"/></svg>
    <span id="appreciateLabel">${t('appreciate') || '\u968F\u559C'}</span><span id="appreciateCount"></span>
  </button>`;
  view.querySelector('#appreciateBtn').addEventListener('click', async () => {
    const result = await appreciate(series.id);
    if (!result) return;
    const countEl = view.querySelector('#appreciateCount');
    if (countEl) countEl.textContent = ' ' + result.total;
    if (result.success) {
      showToast(t('appreciate_thanks') || '\u968F\u559C\u529F\u5FB7');
      view.querySelector('#appreciateBtn').classList.add('appreciated');
    } else if (result.message === 'already_appreciated_today') {
      showToast(t('appreciate_done') || '\u4ECA\u65E5\u5DF2\u968F\u559C');
    }
  });

  // Fetch live play counts from API (non-blocking)
  getPlayCount(series.id).then(data => {
    if (!data || data.error) return;
    const countSpan = view.querySelector('#epPlayCount');
    if (countSpan && data.totalPlayCount > 0) {
      countSpan.textContent = ` \u00B7 ${fmtCount(data.totalPlayCount)}${t('play_count_unit') || '\u6B21'}`;
    }
  });
}

/* Format large numbers: 1234 -> 1.2k, 12345 -> 1.2万 */
function fmtCount(n) {
  if (!n || n < 1) return '';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 10000).toFixed(1).replace(/\.0$/, '') + '\u4E07';
}
