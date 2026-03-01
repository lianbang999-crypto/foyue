/* ===== 净土法音 — Main Entry Point ===== */

// CSS imports (Vite will bundle these)
import '../css/tokens.css';
import '../css/reset.css';
import '../css/layout.css';
import '../css/player.css';
import '../css/cards.css';
import '../css/pages.css';
import '../css/components.css';
import '../css/ai.css';

// Module imports
import { state } from './state.js';
import { initDOM, getDOM } from './dom.js';
import { initLang, applyI18n, t } from './i18n.js';
import { initTheme } from './theme.js';
import { seekCalc, seekUI, seekCommit, showToast, haptic } from './utils.js';
import {
  playList, togglePlay, prevTrack, nextTrack,
  cycleLoop, cycleSpeed, cycleSleepTimer,
  shareTrack, onTimeUpdate, onEnded, onAudioError,
  setPlayState, highlightEp, preloadNextTrack, cleanupPreload,
  togglePlaylist, getPlaylistVisible, saveState, restoreState,
  getIsSwitching, setDragging, initPlaylistTabs, closeFullScreen,
} from './player.js';
import { renderHomePage } from './pages-home.js';
import { renderMyPage } from './pages-my.js';
import { renderCategory, showEpisodes } from './pages-category.js';
import { doSearch } from './search.js';
import { initInstallPrompt, initBackGuard } from './pwa.js';
import { initAiChat, updateAiContext } from './ai-chat.js';
import { appreciate } from './api.js';

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

  // Center play button - open expanded player, or toggle play if already in expanded view
  dom.centerPlayBtn.addEventListener('click', () => {
    haptic();
    if (!dom.audio.src && !state.playlist.length) return;
    if (dom.audio.src) {
      // If fullscreen is not open, open it without changing play state
      if (!dom.expPlayer.classList.contains('show')) {
        // If audio is paused, start playback then open
        if (dom.audio.paused) {
          dom.audio.play().catch(() => {});
        }
        dom.expPlayer.classList.add('show');
      } else {
        // Fullscreen already open, toggle play/pause
        togglePlay();
      }
    } else {
      dom.expPlayer.classList.add('show');
    }
  });

  // Player controls
  dom.btnPlay.addEventListener('click', () => { haptic(); togglePlay(); });
  dom.expPlay.addEventListener('click', () => { haptic(); togglePlay(); });
  document.getElementById('btnPrev').addEventListener('click', () => { haptic(); prevTrack(); });
  document.getElementById('expPrev').addEventListener('click', () => { haptic(); prevTrack(); });
  document.getElementById('btnNext').addEventListener('click', () => { haptic(); nextTrack(); });
  document.getElementById('expNext').addEventListener('click', () => { haptic(); nextTrack(); });
  document.getElementById('expLoop').addEventListener('click', () => { haptic(); cycleLoop(); });
  document.getElementById('expSkipBack').addEventListener('click', () => { haptic(); if (dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 15); });
  document.getElementById('expSkipFwd').addEventListener('click', () => { haptic(); if (dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 15); });
  document.getElementById('expShare').addEventListener('click', () => {
    haptic();
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
  document.addEventListener('touchcancel', endDrag);

  // Expanded toggle
  dom.expCollapse.addEventListener('click', () => { haptic(); closeFullScreen(); });

  // Queue / playlist toggle
  dom.expQueue.addEventListener('click', () => { haptic(); togglePlaylist(); });
  initPlaylistTabs();

  // Appreciate button
  document.getElementById('expAppreciate').addEventListener('click', async () => {
    haptic();
    if (state.epIdx < 0 || !state.playlist[state.epIdx]) return;
    const tr = state.playlist[state.epIdx];
    const seriesId = tr.seriesId;
    if (!seriesId) return;
    const btn = document.getElementById('expAppreciate');
    try {
      const result = await appreciate(seriesId);
      if (!result) return;
      if (result.success) {
        showToast(t('appreciate_thanks') || '随喜功德');
        btn.classList.add('active');
      } else if (result.message === 'already_appreciated_today') {
        showToast(t('appreciate_done') || '今日已随喜');
        btn.classList.add('active');
      }
    } catch (err) {
      showToast(t('error_play') || '网络异常');
    }
  });

  // Swipe-down gesture to close expanded player (with visual follow-along)
  {
    let startY = 0, startX = 0, startTime = 0, swiping = false;
    let touchAbovePlaylist = false;
    const threshold = 80;
    const exp = dom.expPlayer;

    exp.addEventListener('touchstart', (e) => {
      const t = e.target;
      if (t.closest('.exp-progress-bar') || t.closest('.playlist-panel') || t.closest('input') || t.closest('button')) return;
      touchAbovePlaylist = false;
      if (getPlaylistVisible()) {
        const plRect = dom.playlistPanel.getBoundingClientRect();
        if (e.touches[0].clientY < plRect.top) {
          touchAbovePlaylist = true;
        } else {
          return;
        }
      }
      if (!touchAbovePlaylist) {
        const content = dom.expPlayerContent;
        if (content && content.scrollTop > 0) return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startTime = Date.now();
      swiping = false;
      // Disable CSS transition for real-time follow
      exp.style.transition = 'none';
    }, { passive: true });

    exp.addEventListener('touchmove', (e) => {
      if (!startY) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy > 10 && dy > dx) swiping = true;
      // Visual follow-along: translate the player down as user drags
      if (swiping && dy > 0) {
        exp.style.transform = `translate3d(0, ${dy}px, 0)`;
      }
    }, { passive: true });

    function resetSwipe() {
      // Restore CSS transition with unified easing and snap back
      exp.style.transition = 'transform .34s cubic-bezier(.22,1,.36,1)';
      exp.style.transform = '';
      // Clear inline transition after animation completes
      setTimeout(() => { exp.style.transition = ''; }, 340);
      startY = 0;
      swiping = false;
      touchAbovePlaylist = false;
    }

    exp.addEventListener('touchend', (e) => {
      if (!startY || !swiping) { resetSwipe(); return; }
      const dy = e.changedTouches[0].clientY - startY;
      const elapsed = Date.now() - startTime;
      const velocity = dy / elapsed;
      if (dy > threshold || velocity > 0.5) {
        // Restore transition for smooth close animation
        exp.style.transition = 'transform .34s cubic-bezier(.22,1,.36,1)';
        exp.style.transform = '';
        if (touchAbovePlaylist && getPlaylistVisible()) {
          togglePlaylist();
        } else {
          closeFullScreen();
        }
        // Clear inline transition after animation
        setTimeout(() => { exp.style.transition = ''; }, 340);
      } else {
        // Snap back to open position
        resetSwipe();
      }
      startY = 0;
      swiping = false;
      touchAbovePlaylist = false;
    }, { passive: true });

    exp.addEventListener('touchcancel', resetSwipe, { passive: true });
  }

  // Audio events
  dom.audio.addEventListener('timeupdate', onTimeUpdate);
  dom.audio.addEventListener('play', () => { setPlayState(true); });
  dom.audio.addEventListener('playing', () => {
    // Update AI chat context with current track info
    if (state.epIdx >= 0 && state.playlist[state.epIdx]) {
      const tr = state.playlist[state.epIdx];
      updateAiContext(tr.seriesId, tr.id || state.epIdx + 1);
    }
  });
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
  document.getElementById('expSpeed').addEventListener('click', () => { haptic(); cycleSpeed(); });

  // Sleep timer
  document.getElementById('expTimer').addEventListener('click', () => { haptic(); cycleSleepTimer(); });

  // PWA install
  initInstallPrompt();

  // Back navigation guard
  initBackGuard(renderCategory, state);

  // AI 聊天面板
  initAiChat(document.getElementById('app'));

  // Buffering indicator (mini bar + center button + fullscreen play button)
  dom.audio.addEventListener('waiting', () => { dom.playerTrack.classList.add('buffering'); dom.centerPlayBtn.classList.add('buffering'); dom.expPlay.classList.add('buffering'); });
  dom.audio.addEventListener('playing', () => { dom.playerTrack.classList.remove('buffering'); dom.centerPlayBtn.classList.remove('buffering'); dom.expPlay.classList.remove('buffering'); });
  dom.audio.addEventListener('canplay', () => { dom.playerTrack.classList.remove('buffering'); dom.centerPlayBtn.classList.remove('buffering'); dom.expPlay.classList.remove('buffering'); preloadNextTrack(); });

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

/* ===== DATA LOADING with cache + retry ===== */
let loadAttempts = 0;
const DATA_CACHE_KEY = 'pl-data-cache';
const DATA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function loadData() {
  const dom = getDOM();
  try {
    // Try localStorage cache first for instant render
    const cached = loadCachedData();
    if (cached) {
      state.data = cached;
      dom.loader.style.display = 'none';
      if (state.tab === 'home') renderHomePage();
      else renderCategory(state.tab);
      restoreState(renderCategory, renderHomePage, renderMyPage);
      if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
      // Refresh in background (non-blocking)
      fetchFreshData();
      return;
    }
    // No cache: fetch fresh
    const r = await fetch('/data/audio-data.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    state.data = await r.json();
    const initStr = JSON.stringify(state.data);
    const initHash = Array.from(initStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    saveCachedData(state.data, initHash);
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

function loadCachedData() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > DATA_CACHE_TTL) return null;
    return data;
  } catch (e) { return null; }
}

function saveCachedData(data, hash) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ data, ts: Date.now(), _hash: hash }));
  } catch (e) { /* storage full or unavailable */ }
}

async function fetchFreshData() {
  try {
    const r = await fetch('/data/audio-data.json');
    if (!r.ok) return;
    const fresh = await r.json();
    // Only update state if data actually changed (avoid unnecessary re-renders)
    const freshStr = JSON.stringify(fresh);
    const freshHash = Array.from(freshStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const cachedRaw = localStorage.getItem(DATA_CACHE_KEY);
    const cachedHash = cachedRaw ? JSON.parse(cachedRaw)._hash : null;
    saveCachedData(fresh, freshHash);
    if (freshHash !== cachedHash || cachedHash === null) {
      state.data = fresh;
    }
  } catch (e) { /* silent */ }
}

function playDefaultTrack() {
  if (!state.data) return;
  const cat = state.data.categories.find(c => c.id === 'fohao');
  if (!cat) return;
  const sr = cat.series.find(s => s.id === 'donglin-fohao');
  if (!sr || !sr.episodes || sr.episodes.length < 4) return;
  playList(sr.episodes, 3, sr);
}
