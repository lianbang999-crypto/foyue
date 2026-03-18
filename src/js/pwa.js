/* ===== PWA Install Prompt ===== */
import { getDOM } from './dom.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';

let deferredPrompt = null;
let installPromptInitialized = false;
let installListenersBound = false;

const INSTALL_DISMISSED_KEY = 'pl-install-dismissed';
const INSTALL_DISMISS_TTL = 3 * 24 * 60 * 60 * 1000;

export function getDeferredPrompt() { return deferredPrompt; }
export function clearDeferredPrompt() { deferredPrompt = null; }

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
}

function isDismissedRecently() {
  const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
  if (!dismissed) return false;
  const ts = parseInt(dismissed, 10);
  return Number.isFinite(ts) && Date.now() - ts < INSTALL_DISMISS_TTL;
}

function rememberDismissed() {
  localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
}

function clearDismissed() {
  localStorage.removeItem(INSTALL_DISMISSED_KEY);
}

function getInstallBanner() {
  return document.getElementById('installBanner');
}

function getIosGuide() {
  return document.getElementById('iosGuide');
}

function hideInstallSurfaces() {
  const banner = getInstallBanner();
  const iosGuide = getIosGuide();
  if (banner) banner.classList.remove('show');
  if (iosGuide) iosGuide.classList.remove('show');
}

function updateInstallBannerVisibility() {
  const banner = getInstallBanner();
  if (!banner) return;
  const shouldShow = !!deferredPrompt && !isStandaloneMode() && !isDismissedRecently();
  banner.classList.toggle('show', shouldShow);
}

function bindInstallListeners() {
  if (installListenersBound) return;
  installListenersBound = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallBannerVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    clearDismissed();
    hideInstallSurfaces();
    showToast(t('install_success') || '安装成功！');
  });
}

export async function promptInstall() {
  if (deferredPrompt) {
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    hideInstallSurfaces();
    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    if (result.outcome !== 'accepted') {
      deferredPrompt = promptEvent;
      rememberDismissed();
      updateInstallBannerVisibility();
    } else {
      clearDismissed();
    }
    return result;
  }

  showManualInstallGuide();
  return null;
}

export function initInstallPrompt() {
  const banner = getInstallBanner();
  const iosGuide = getIosGuide();
  if (!banner || !iosGuide) return;

  bindInstallListeners();

  if (installPromptInitialized) {
    updateInstallBannerVisibility();
    return;
  }
  installPromptInitialized = true;

  if (isStandaloneMode()) {
    clearDismissed();
    hideInstallSurfaces();
    return;
  }

  const ua = navigator.userAgent;
  const isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  if (isInApp) return;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

  // iOS Safari 没有 beforeinstallprompt，只能展示手动安装说明。
  if (isIOS && isSafari) {
    if (!isDismissedRecently()) {
      setTimeout(() => {
        if (!isStandaloneMode() && !isDismissedRecently()) {
          iosGuide.classList.add('show');
        }
      }, 2000);
    }
    document.getElementById('iosGuideClose').addEventListener('click', () => {
      iosGuide.classList.remove('show');
      rememberDismissed();
    });
    return;
  }

  document.getElementById('installAccept').addEventListener('click', async () => {
    await promptInstall();
  });

  document.getElementById('installDismiss').addEventListener('click', () => {
    hideInstallSurfaces();
    rememberDismissed();
  });

  updateInstallBannerVisibility();
}

function showManualInstallGuide() {
  const ua = navigator.userAgent;
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);

  let guide = '';

  if (isAndroid && isChrome) {
    guide = '请点击浏览器右上角菜单 ⋮ → "添加到主屏幕"';
  } else if (isAndroid && isFirefox) {
    guide = '请点击浏览器右上角菜单 ⋮ → "添加到主屏幕"';
  } else if (isEdge) {
    guide = '请点击浏览器右上角菜单 ⋯ → "应用" → "将此站点作为应用安装"';
  } else if (isFirefox) {
    guide = '请点击浏览器地址栏右侧的安装图标 🏠';
  } else {
    guide = t('install_menu_hint') || '如果浏览器没有显示安装按钮，请先确认已使用 HTTPS、未在应用内浏览器中打开，且浏览器尚未把本站视为已安装。';
  }

  showToast(guide);
}

/* ===== Back Navigation Guard ===== */
export function initBackGuard(renderCategory, stateRef, { closeFullScreen, getPlaylistVisible, closePlaylist, renderHomePage }) {
  const dom = getDOM();
  const isStandalone = isStandaloneMode();

  history.replaceState({ page: 'main' }, '');
  history.pushState({ page: 'guard' }, '');

  window.addEventListener('popstate', (e) => {
    // Let wenku/reader navigation handle its own popstate (handled in main.js)
    const st = e.state;
    if (st && (st.wenku || st.doc)) return;
    if (document.querySelector('.wenku-reader') || document.querySelector('.wenku-page')) return;

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
      // When the ep-view was opened from the home tab, renderCategory('home') would
      // fail silently (no such category) and leave a blank page.  Use renderHomePage
      // instead so the back gesture always restores visible content.
      if (stateRef.tab === 'home' && renderHomePage) {
        renderHomePage();
      } else {
        renderCategory(stateRef.tab);
      }
      history.pushState({ page: 'guard' }, '');
      return;
    }
    if (stateRef.tab !== 'home') {
      document.querySelector('.tab[data-tab="home"]').click();
      history.pushState({ page: 'guard' }, '');
      return;
    }

    // ✅ 修复：standalone模式下，在首页时阻止退出，保持guard状态
    if (isStandalone) {
      // 已在首页，重新push guard防止退出
      history.pushState({ page: 'guard' }, '');
      return;
    }

    // 非standalone模式，允许正常返回
    history.pushState({ page: 'guard' }, '');
  });
}
