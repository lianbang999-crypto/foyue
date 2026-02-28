/* ===== 净土法音 — Main Entry Point ===== */

// CSS imports (Vite will bundle these)
import '../css/tokens.css';
import '../css/reset.css';
import '../css/layout.css';
import '../css/player.css';
import '../css/cards.css';
import '../css/pages.css';
import '../css/components.css';

// Module imports
import { state } from './state.js';
import { initDOM, getDOM } from './dom.js';
import { initLang, applyI18n, t } from './i18n.js';
import { initTheme } from './theme.js';
import { seekCalc, seekUI, seekCommit } from './utils.js';
import {
  playList, togglePlay, prevTrack, nextTrack,
  cycleLoop, cycleSpeed, cycleSleepTimer,
  shareTrack, onTimeUpdate, onEnded, onAudioError,
  setPlayState, highlightEp, preloadNextTrack, cleanupPreload,
  togglePlaylist, getPlaylistVisible, saveState, restoreState,
  getIsSwitching, setDragging, initPlaylistTabs,
} from './player.js';
import { renderHomePage } from './pages-home.js';
import { renderMyPage } from './pages-my.js';
import { renderCategory, showEpisodes } from './pages-category.js';
import { doSearch } from './search.js';
import { initInstallPrompt, initBackGuard } from './pwa.js';

/* ===== INIT ===== */
(function init() {
  // Language & Theme
  initLang();
  initTheme();

  // DOM refs
  const dom = initDOM();

  state.isFirstVisit = !localStorage.getItem('pl-state');

  // About modal
  const aboutOverlay = document.getElementById('aboutOverlay');
  document.getElementById('aboutClose').addEventListener('click', () => aboutOverlay.classList.remove('show'));
  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.classList.remove('show');
  });

  // Search
  document.getElementById('btnSearch').addEventListener('click', () => {
    const vis = dom.searchRow.classList.toggle('show');
    if (vis) dom.searchInput.focus();
    else { dom.searchInput.value = ''; renderCategory(state.tab); }
    document.getElementById('btnSearch').classList.toggle('active', vis);
  });
  let st;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(st);
    st = setTimeout(() => doSearch(dom.searchInput.value.trim(), showEpisodes, renderCategory, renderHomePage), 250);
  });

  // Tabs
  const TAB_I18N = { home: 'tab_home', tingjingtai: 'tab_lectures', youshengshu: 'tab_audiobooks', mypage: 'tab_my' };
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
      state.tab = btn.dataset.tab; state.seriesId = null; dom.searchInput.value = '';
      dom.navTitle.textContent = t(TAB_I18N[state.tab] || 'tab_lectures');
      dom.navTitle.dataset.i18n = TAB_I18N[state.tab] || 'tab_lectures';
      if (state.tab === 'mypage') { renderMyPage(); }
      else if (state.tab === 'home') { renderHomePage(); }
      else { renderCategory(state.tab); }
    });
  });

  // Center play button - toggle play/pause, or open expanded player
  dom.centerPlayBtn.addEventListener('click', () => {
    if (!dom.audio.src && !state.playlist.length) return;
    if (dom.audio.src) {
      togglePlay();
      // Also open expanded player if not already open
      if (!dom.expPlayer.classList.contains('show')) {
        dom.expPlayer.classList.add('show');
      }
    } else {
      dom.expPlayer.classList.add('show');
    }
  });

  // Player controls
  dom.btnPlay.addEventListener('click', togglePlay);
  dom.expPlay.addEventListener('click', togglePlay);
  document.getElementById('btnPrev').addEventListener('click', prevTrack);
  document.getElementById('expPrev').addEventListener('click', prevTrack);
  document.getElementById('btnNext').addEventListener('click', nextTrack);
  document.getElementById('expNext').addEventListener('click', nextTrack);
  document.getElementById('expLoop').addEventListener('click', cycleLoop);
  document.getElementById('expSkipBack').addEventListener('click', () => { if (dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 15); });
  document.getElementById('expSkipFwd').addEventListener('click', () => { if (dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 15); });
  document.getElementById('expShare').addEventListener('click', () => {
    if (state.epIdx >= 0 && state.playlist[state.epIdx]) {
      const tr = state.playlist[state.epIdx];
      shareTrack(tr, { title: tr.seriesTitle, id: tr.seriesId });
    }
  });

  // Progress seek - expanded player (smooth drag: UI-only during drag, commit on release)
  let dragging = false;
  let dragPct = 0;
  function startDrag(e) {
    dragging = true;
    setDragging(true);
    dom.expProgressFill.style.transition = 'none';
    dom.expProgressThumb.style.transition = 'none';
    dragPct = seekCalc(e, dom.expProgressBar);
    seekUI(dragPct, dom);
  }
  function moveDrag(e) {
    if (!dragging) return;
    dragPct = seekCalc(e, dom.expProgressBar);
    seekUI(dragPct, dom);
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    dom.expProgressFill.style.transition = '';
    dom.expProgressThumb.style.transition = '';
    seekCommit(dragPct, dom.audio);
    setDragging(false);
  }
  dom.expProgressBar.addEventListener('mousedown', e => startDrag(e));
  dom.expProgressBar.addEventListener('touchstart', e => startDrag(e.touches[0]), { passive: true });
  document.addEventListener('mousemove', e => moveDrag(e));
  document.addEventListener('touchmove', e => moveDrag(e.touches[0]), { passive: true });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);

  // Expanded toggle
  dom.expCollapse.addEventListener('click', () => {
    dom.expPlayer.classList.remove('show');
    if (getPlaylistVisible()) {
      togglePlaylist(); // Reset playlist view
    }
  });

  // Queue / playlist toggle
  dom.expQueue.addEventListener('click', togglePlaylist);
  initPlaylistTabs();

  // Audio events
  dom.audio.addEventListener('timeupdate', onTimeUpdate);
  dom.audio.addEventListener('play', () => { setPlayState(true); });
  dom.audio.addEventListener('playing', () => { /* isSwitching handled in player.js */ });
  dom.audio.addEventListener('pause', () => { if (!getIsSwitching()) { setPlayState(false); saveState(); } });
  dom.audio.addEventListener('ended', onEnded);
  dom.audio.addEventListener('error', onAudioError);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft' && dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 10);
    if (e.code === 'ArrowRight' && dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 10);
  });

  // Speed control
  document.getElementById('expSpeed').addEventListener('click', cycleSpeed);

  // Sleep timer
  document.getElementById('expTimer').addEventListener('click', cycleSleepTimer);

  // PWA install
  initInstallPrompt();

  // Back navigation guard
  initBackGuard(renderCategory, state);

  // Buffering indicator
  dom.audio.addEventListener('waiting', () => { dom.playerTrack.classList.add('buffering'); dom.centerPlayBtn.classList.add('buffering'); });
  dom.audio.addEventListener('playing', () => { dom.playerTrack.classList.remove('buffering'); dom.centerPlayBtn.classList.remove('buffering'); });
  dom.audio.addEventListener('canplay', () => { dom.playerTrack.classList.remove('buffering'); dom.centerPlayBtn.classList.remove('buffering'); preloadNextTrack(); });

  // Network-aware preload control
  if (navigator.connection) {
    navigator.connection.addEventListener('change', () => {
      const c = navigator.connection;
      if (c.saveData || c.effectiveType === '2g') cleanupPreload();
      else if (dom.audio.src && !dom.audio.paused) preloadNextTrack();
    });
  }

  applyI18n();
  loadData();
  setInterval(saveState, 15000);

  // One-time cleanup of old Service Worker and caches
  if ('serviceWorker' in navigator && !localStorage.getItem('sw-cleaned')) {
    navigator.serviceWorker.getRegistrations().then(regs => { regs.forEach(r => r.unregister()); });
    caches.keys().then(keys => { keys.forEach(k => caches.delete(k)); });
    localStorage.setItem('sw-cleaned', '1');
  }
})();

/* ===== DATA LOADING with retry ===== */
let loadAttempts = 0;
async function loadData() {
  const dom = getDOM();
  try {
    const r = await fetch('/data/audio-data.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    state.data = await r.json();
    dom.loader.style.display = 'none';
    if (state.tab === 'home') renderHomePage();
    else renderCategory(state.tab);
    restoreState(renderCategory, renderHomePage, renderMyPage);
    // Default play on first visit
    if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
  } catch (e) {
    loadAttempts++;
    if (loadAttempts < 3) { setTimeout(loadData, 1500 * loadAttempts); return; }
    dom.loader.innerHTML = `<div class="error-msg">${t('loading_fail')}<br><button onclick="location.reload()">${t('retry')}</button></div>`;
  }
}

function playDefaultTrack() {
  if (!state.data) return;
  const cat = state.data.categories.find(c => c.id === 'fohao');
  if (!cat) return;
  const sr = cat.series.find(s => s.id === 'donglin-fohao');
  if (!sr || !sr.episodes || sr.episodes.length < 4) return;
  playList(sr.episodes, 3, sr);
}
