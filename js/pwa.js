/**
 * pwa.js — PWA install prompt + Media Session API
 * Depends on: state.js, i18n.js
 */
(function(){
'use strict';

var App = window.App;

function initInstallPrompt() {
  var banner = App.$('installBanner');
  var iosGuide = App.$('iosGuide');
  var dismissed = localStorage.getItem('pl-install-dismissed');
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (navigator.standalone) return;
  if (dismissed) {
    var ts = parseInt(dismissed, 10);
    if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
  }

  var ua = navigator.userAgent;
  var isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  if (isInApp) return;

  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

  if (isIOS && isSafari) {
    setTimeout(function() { iosGuide.classList.add('show'); }, 2000);
    App.$('iosGuideClose').addEventListener('click', function() {
      iosGuide.classList.remove('show');
      localStorage.setItem('pl-install-dismissed', String(Date.now()));
    });
    return;
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    App.deferredPrompt = e;
    banner.classList.add('show');
  });

  App.$('installAccept').addEventListener('click', async function() {
    if (App.deferredPrompt) {
      App.deferredPrompt.prompt();
      var result = await App.deferredPrompt.userChoice;
      App.deferredPrompt = null;
      banner.classList.remove('show');
      if (result.outcome === 'accepted') localStorage.setItem('pl-install-dismissed', String(Date.now()));
    } else {
      App.showToast(App.t('install_menu_hint'));
      banner.classList.remove('show');
    }
  });

  App.$('installDismiss').addEventListener('click', function() {
    banner.classList.remove('show');
    App.deferredPrompt = null;
    localStorage.setItem('pl-install-dismissed', String(Date.now()));
  });

  window.addEventListener('appinstalled', function() {
    banner.classList.remove('show');
    localStorage.setItem('pl-install-dismissed', String(Date.now()));
  });
}

/* ===== MEDIA SESSION ===== */
function updateMediaSession(tr) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: tr.title || tr.fileName,
    artist: tr.speaker || '\u5927\u5B89\u6CD5\u5E08',
    album: tr.seriesTitle || '\u51C0\u571F\u6CD5\u97F3'
  });
  try {
    navigator.mediaSession.setActionHandler('play', function() { App.audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function() { App.audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', App.prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', App.nextTrack);
    navigator.mediaSession.setActionHandler('seekbackward', function() { if (App.audio.duration) App.audio.currentTime = Math.max(0, App.audio.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', function() { if (App.audio.duration) App.audio.currentTime = Math.min(App.audio.duration, App.audio.currentTime + 10); });
    navigator.mediaSession.setActionHandler('seekto', function(d) { if (d.seekTime != null) App.audio.currentTime = d.seekTime; });
  } catch (e) {}
}

App.initInstallPrompt = initInstallPrompt;
App.updateMediaSession = updateMediaSession;

})();
