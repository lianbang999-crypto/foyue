/* ===== PWA Install Prompt ===== */
import { getDOM } from './dom.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';

let deferredPrompt = null;

export function getDeferredPrompt() { return deferredPrompt; }
export function clearDeferredPrompt() { deferredPrompt = null; }

export function initInstallPrompt() {
  const banner = document.getElementById('installBanner');
  const iosGuide = document.getElementById('iosGuide');
  const dismissed = localStorage.getItem('pl-install-dismissed');

  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (navigator.standalone) return;
  if (dismissed) {
    const ts = parseInt(dismissed, 10);
    if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
  }

  const ua = navigator.userAgent;
  const isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  if (isInApp) return;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

  if (isIOS && isSafari) {
    setTimeout(() => { iosGuide.classList.add('show'); }, 2000);
    document.getElementById('iosGuideClose').addEventListener('click', () => {
      iosGuide.classList.remove('show');
      localStorage.setItem('pl-install-dismissed', String(Date.now()));
    });
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add('show');
  });

  document.getElementById('installAccept').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.classList.remove('show');
      if (result.outcome === 'accepted') localStorage.setItem('pl-install-dismissed', String(Date.now()));
    } else {
      showToast(t('install_menu_hint'));
      banner.classList.remove('show');
    }
  });

  document.getElementById('installDismiss').addEventListener('click', () => {
    banner.classList.remove('show');
    deferredPrompt = null;
    localStorage.setItem('pl-install-dismissed', String(Date.now()));
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('show');
    localStorage.setItem('pl-install-dismissed', String(Date.now()));
  });
}

/* ===== Back Navigation Guard ===== */
export function initBackGuard(renderCategory, stateRef, { closeFullScreen, getPlaylistVisible, closePlaylist }) {
  const dom = getDOM();
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (navigator.standalone) return;

  history.replaceState({ page: 'main' }, '');
  history.pushState({ page: 'guard' }, '');
  window.addEventListener('popstate', (e) => {
    // Priority: close playlist first, then fullscreen player, then navigate back
    if (getPlaylistVisible()) {
      closePlaylist();
      history.pushState({ page: 'guard' }, '');
      return;
    }
    if (dom.expPlayer.classList.contains('show')) {
      closeFullScreen();
      history.pushState({ page: 'guard' }, '');
      return;
    }
    const epView = dom.contentArea.querySelector('.ep-view');
    if (epView) {
      epView.remove();
      renderCategory(stateRef.tab);
      history.pushState({ page: 'guard' }, '');
      return;
    }
    if (stateRef.tab !== 'home') {
      document.querySelector('.tab[data-tab="home"]').click();
      history.pushState({ page: 'guard' }, '');
      return;
    }
    history.pushState({ page: 'guard' }, '');
  });
}
