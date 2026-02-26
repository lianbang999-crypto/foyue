/**
 * app.js — Application bootstrap (init, event binding, state persistence)
 * Depends on: ALL other modules must be loaded before this file.
 * This is the LAST script to load.
 */
(function(){
'use strict';

var App = window.App;

/* ===== THEME ===== */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', App.dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]').content = App.dark ? '#0F0F0F' : '#FAF9F6';
  localStorage.setItem('pl-theme', App.dark ? 'dark' : 'light');
}

/* ===== STATE PERSISTENCE ===== */
function saveState() {
  try {
    var tr = App.playlist[App.epIdx];
    if (!tr) return;
    localStorage.setItem('pl-state', JSON.stringify({
      seriesId: tr.seriesId, idx: App.epIdx, time: App.audio.currentTime, duration: App.audio.duration || 0,
      tab: App.tab, loop: App.loopMode, speed: App.SPEEDS[App.speedIdx]
    }));
    App.syncHistoryProgress();
  } catch (e) {}
}

function restoreState() {
  try {
    var s = JSON.parse(localStorage.getItem('pl-state'));
    if (!s || !s.seriesId) return;
    for (var ci = 0; ci < App.data.categories.length; ci++) {
      var cat = App.data.categories[ci];
      var sr = cat.series.find(function(x) { return x.id === s.seriesId; });
      if (sr) {
        App.playlist = sr.episodes.map(function(ep) {
          return Object.assign({}, ep, { seriesId: sr.id, seriesTitle: sr.title, speaker: sr.speaker });
        });
        App.epIdx = s.idx || 0;
        var tr = App.playlist[App.epIdx];
        if (tr) {
          App.audio.src = tr.url;
          if (s.time) App.audio.addEventListener('loadedmetadata', function() { App.audio.currentTime = s.time; }, { once: true });
          App.updateUI(tr);
        }
        if (s.loop) {
          App.loopMode = (s.loop === 'none') ? 'all' : s.loop;
          App.applyLoopUI();
        }
        if (s.speed && s.speed !== 1) {
          var si = App.SPEEDS.indexOf(s.speed);
          if (si >= 0) {
            App.speedIdx = si;
            App.audio.playbackRate = s.speed;
            App.$('expSpeed').textContent = s.speed + 'x';
            App.$('expSpeed').classList.add('active');
          }
        }
        if (s.tab) {
          App.tab = s.tab === 'fohao' ? 'home' : s.tab;
          document.querySelectorAll('.tab').forEach(function(b) {
            b.classList.toggle('active', b.dataset.tab === App.tab);
            b.setAttribute('aria-selected', b.dataset.tab === App.tab ? 'true' : 'false');
          });
          var ti18n = App.TAB_I18N;
          App.navTitle.textContent = App.t(ti18n[App.tab] || 'tab_home');
          App.navTitle.dataset.i18n = ti18n[App.tab] || 'tab_home';
          if (App.tab === 'mypage') App.renderMyPage();
          else if (App.tab === 'home') App.renderHomePage();
          else App.renderCategory(App.tab);
        }
        App.isFirstVisit = false;
        break;
      }
    }
  } catch (e) {}
}

/* ===== INIT ===== */
function init() {
  // Initialize DOM references
  App.initDOMRefs();

  // Restore language
  var savedLang = localStorage.getItem('pl-lang');
  App.lang = savedLang || App.detectLang();

  // Restore theme
  var savedTheme = localStorage.getItem('pl-theme');
  App.dark = savedTheme === 'dark';
  applyTheme();

  App.isFirstVisit = !localStorage.getItem('pl-state');

  // About modal
  var aboutOverlay = App.$('aboutOverlay');
  App.$('aboutClose').addEventListener('click', function() { aboutOverlay.classList.remove('show'); });
  aboutOverlay.addEventListener('click', function(e) {
    if (e.target === aboutOverlay) aboutOverlay.classList.remove('show');
  });

  // History overlay
  var historyOverlay = App.$('historyOverlay');
  historyOverlay.addEventListener('click', function(e) {
    if (e.target === historyOverlay) historyOverlay.classList.remove('show');
  });
  App.$('historyClearBtn').addEventListener('click', function() {
    if (!confirm(App.t('my_history_clear_confirm'))) return;
    App.clearHistory();
    App.renderHistoryOverlay();
    App.showToast(App.t('my_history_cleared'));
    var myPage = App.contentArea.querySelector('.my-page');
    if (myPage) App.renderMyPage();
  });

  // Search
  App.$('btnSearch').addEventListener('click', function() {
    var vis = App.searchRow.classList.toggle('show');
    if (vis) App.searchInput.focus();
    else { App.searchInput.value = ''; App.renderCategory(App.tab); }
    App.$('btnSearch').classList.toggle('active', vis);
  });
  var st;
  App.searchInput.addEventListener('input', function() {
    clearTimeout(st);
    st = setTimeout(function() { App.doSearch(App.searchInput.value.trim()); }, 250);
  });

  // Initialize tab navigation
  App.initNavigation();

  // Center play button
  App.centerPlayBtn.addEventListener('click', function() {
    if (!App.audio.src && !App.playlist.length) return;
    App.expPlayer.classList.add('show');
  });

  // Player controls
  App.btnPlay.addEventListener('click', App.togglePlay);
  App.expPlay.addEventListener('click', App.togglePlay);
  App.$('btnPrev').addEventListener('click', App.prevTrack);
  App.$('expPrev').addEventListener('click', App.prevTrack);
  App.$('btnNext').addEventListener('click', App.nextTrack);
  App.$('expNext').addEventListener('click', App.nextTrack);
  App.$('expLoop').addEventListener('click', App.cycleLoop);
  App.$('expSkipBack').addEventListener('click', function() {
    if (App.audio.duration) App.audio.currentTime = Math.max(0, App.audio.currentTime - 15);
  });
  App.$('expSkipFwd').addEventListener('click', function() {
    if (App.audio.duration) App.audio.currentTime = Math.min(App.audio.duration, App.audio.currentTime + 15);
  });
  App.$('expShare').addEventListener('click', function() {
    if (App.epIdx >= 0 && App.playlist[App.epIdx]) {
      var tr = App.playlist[App.epIdx];
      App.shareTrack(tr, { title: tr.seriesTitle, id: tr.seriesId });
    }
  });

  // Initialize player UI (progress drag, swipe, double-tap)
  App.initPlayerUI();

  // Expanded player collapse
  App.expCollapse.addEventListener('click', function() {
    App.expPlayer.classList.remove('show');
    if (App.playlistVisible) {
      App.playlistVisible = false;
      App.playlistPanel.classList.remove('show');
      App.expPlayerContent.classList.remove('hide');
      App.expQueue.classList.remove('active');
    }
  });

  // Queue toggle
  App.expQueue.addEventListener('click', App.togglePlaylist);

  // Audio events
  App.audio.addEventListener('timeupdate', App.onTimeUpdate);
  App.audio.addEventListener('play', function() { App.setPlayState(true); });
  App.audio.addEventListener('playing', function() { App.isSwitching = false; });
  App.audio.addEventListener('pause', function() { if (!App.isSwitching) { App.setPlayState(false); saveState(); } });
  App.audio.addEventListener('ended', App.onEnded);
  App.audio.addEventListener('error', App.onAudioError);

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); App.togglePlay(); }
    if (e.code === 'ArrowLeft' && App.audio.duration) App.audio.currentTime = Math.max(0, App.audio.currentTime - 10);
    if (e.code === 'ArrowRight' && App.audio.duration) App.audio.currentTime = Math.min(App.audio.duration, App.audio.currentTime + 10);
  });

  // Speed control
  App.$('expSpeed').addEventListener('click', App.cycleSpeed);

  // Sleep timer
  App.$('expTimer').addEventListener('click', App.cycleSleepTimer);

  // PWA install
  App.initInstallPrompt();

  // Back navigation guard
  App.initBackGuard();

  // Buffering indicator
  App.audio.addEventListener('waiting', function() { App.playerTrack.classList.add('buffering'); App.centerPlayBtn.classList.add('buffering'); });
  App.audio.addEventListener('playing', function() { App.playerTrack.classList.remove('buffering'); App.centerPlayBtn.classList.remove('buffering'); });
  App.audio.addEventListener('canplay', function() { App.playerTrack.classList.remove('buffering'); App.centerPlayBtn.classList.remove('buffering'); App.preloadNextTrack(); });

  // Network-aware preload
  if (navigator.connection) {
    navigator.connection.addEventListener('change', function() {
      var c = navigator.connection;
      if (c.saveData || c.effectiveType === '2g') App.cleanupPreload();
      else if (App.audio.src && !App.audio.paused) App.preloadNextTrack();
    });
  }

  App.applyI18n();
  App.loadData();
  setInterval(saveState, 15000);

  // One-time cleanup of old Service Worker and caches
  if ('serviceWorker' in navigator && !localStorage.getItem('sw-cleaned')) {
    navigator.serviceWorker.getRegistrations().then(function(regs) { regs.forEach(function(r) { r.unregister(); }); });
    caches.keys().then(function(keys) { keys.forEach(function(k) { caches.delete(k); }); });
    localStorage.setItem('sw-cleaned', '1');
  }
}

// Expose
App.applyTheme = applyTheme;
App.saveState = saveState;
App.restoreState = restoreState;

// Run init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
