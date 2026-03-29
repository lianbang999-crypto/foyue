/* ===== PWA Install Prompt ===== */
import { getDOM } from './dom.js';
import { t } from './i18n.js';
import { showToast, isAppleMobile } from './utils.js';

let deferredPrompt = null;
let installPromptInitialized = false;
let installListenersBound = false;
let installUiBound = false;
let refreshPromptInitialized = false;
let pendingRefreshReload = false;
let currentInstallMode = 'hidden';
let forcedManualInstall = false;
let iosPromptTimer = 0;

const INSTALL_DISMISSED_KEY = 'pl-install-dismissed';
const INSTALL_DISMISS_TTL = 3 * 24 * 60 * 60 * 1000;
const REFRESH_DISMISSED_KEY = 'pl-refresh-dismissed';
const REFRESH_DISMISS_TTL = 6 * 60 * 60 * 1000;
const APP_CACHE_KEY_PATTERNS = [/^pl-data-cache-/, /^pl-home-cache-/];
const APP_CACHE_NAME_PATTERNS = [/^static-/, /^data-/];
const WATCHED_REGISTRATIONS = new WeakSet();

export function isInAppBrowser() {
  const ua = navigator.userAgent;
  return /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
}

function getInstallEnvironment() {
  const ua = navigator.userAgent;
  const isIOS = isAppleMobile();
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
  return {
    isStandalone: isStandaloneMode(),
    isInApp: isInAppBrowser(),
    isIOS,
    isSafari,
    hasNativePrompt: !!deferredPrompt,
  };
}

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

function getInstallElements() {
  return {
    banner: document.getElementById('installBanner'),
    badge: document.getElementById('installBadge'),
    metaNote: document.getElementById('installMetaNote'),
    title: document.getElementById('installTitle'),
    desc: document.getElementById('installDesc'),
    guideCard: document.getElementById('installGuideCard'),
    guideLabel: document.getElementById('installGuideLabel'),
    guideSteps: document.getElementById('installGuideSteps'),
    actions: document.getElementById('installActions'),
    dismiss: document.getElementById('installDismiss'),
    accept: document.getElementById('installAccept'),
  };
}

function getRefreshBanner() {
  return document.getElementById('refreshBanner');
}

function isRefreshDismissedRecently() {
  const dismissed = localStorage.getItem(REFRESH_DISMISSED_KEY);
  if (!dismissed) return false;
  const ts = parseInt(dismissed, 10);
  return Number.isFinite(ts) && Date.now() - ts < REFRESH_DISMISS_TTL;
}

function rememberRefreshDismissed() {
  localStorage.setItem(REFRESH_DISMISSED_KEY, String(Date.now()));
}

function clearRefreshDismissed() {
  localStorage.removeItem(REFRESH_DISMISSED_KEY);
}

function markRefreshUpdateAvailable() {
  showRefreshBanner();
}

function showRefreshBanner() {
  const banner = getRefreshBanner();
  if (!banner || isRefreshDismissedRecently()) return;
  banner.style.display = '';
  banner.classList.add('show');
}

function hideRefreshBanner() {
  const banner = getRefreshBanner();
  if (!banner) return;
  banner.classList.remove('show');
  banner.style.display = 'none';
}

function hideInstallBanner() {
  const banner = getInstallBanner();
  if (!banner) return;
  banner.classList.remove('show');
  banner.style.display = 'none';
}

function getInstallMode() {
  const { isStandalone, isInApp, isIOS, isSafari, hasNativePrompt } = getInstallEnvironment();

  if (isStandalone) return 'installed';
  if (isInApp) return 'blocked';
  if (hasNativePrompt) return 'native';
  if (isIOS && isSafari) return 'ios-manual';
  if (forcedManualInstall) return 'browser-manual';
  return 'hidden';
}

export function getInstallEntryState() {
  const mode = getInstallMode();
  const { isStandalone, isInApp, isIOS, isSafari } = getInstallEnvironment();

  if (isStandalone || isInApp) return null;

  const effectiveMode = mode === 'hidden'
    ? ((isIOS && isSafari) ? 'ios-manual' : 'browser-manual')
    : mode;

  const isManual = effectiveMode !== 'native';

  return {
    mode: effectiveMode,
    title: t('my_install'),
    desc: isManual ? t('install_desc_manual') : t('my_install_desc'),
    benefit: t('my_install_benefit'),
    steps: effectiveMode === 'ios-manual' ? t('my_install_ios') : t('my_install_android'),
    buttonLabel: effectiveMode === 'ios-manual' ? '' : t('my_install_btn'),
    showButton: effectiveMode !== 'ios-manual',
    badge: effectiveMode === 'native' ? t('install_badge_ready') : (effectiveMode === 'ios-manual' ? t('install_badge_ios') : t('install_badge_manual')),
  };
}

function getBrowserManualGuideText() {
  const ua = navigator.userAgent;
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);

  if (isAndroid && (isChrome || isFirefox)) {
    return t('my_install_android');
  }
  if (isEdge) {
    return '点击浏览器菜单「应用」→「将此站点作为应用安装」';
  }
  if (isFirefox) {
    return '点击地址栏附近的安装按钮，或使用浏览器菜单添加到主屏幕';
  }
  return t('install_menu_hint');
}

function updateInstallBannerVisibility(options = {}) {
  const { forceShow = false } = options;
  const elements = getInstallElements();
  if (!elements.banner) return;

  const mode = getInstallMode();
  currentInstallMode = mode;

  if (mode === 'installed' || mode === 'blocked' || mode === 'hidden') {
    hideInstallBanner();
    return;
  }

  if (!forceShow && isDismissedRecently()) {
    hideInstallBanner();
    return;
  }

  elements.guideLabel.textContent = t('install_guide_title');
  elements.actions.classList.toggle('install-actions-single', mode !== 'native');

  if (mode === 'native') {
    elements.badge.textContent = t('install_badge_ready');
    elements.metaNote.textContent = t('install_hint_ready');
    elements.title.textContent = t('install_title');
    elements.desc.textContent = t('install_desc');
    elements.dismiss.textContent = t('install_later');
    elements.accept.textContent = t('install_now');
    elements.accept.hidden = false;
    elements.accept.disabled = false;
    elements.guideCard.hidden = true;
  } else {
    const isIOSManual = mode === 'ios-manual';
    elements.badge.textContent = isIOSManual ? t('install_badge_ios') : t('install_badge_manual');
    elements.metaNote.textContent = isIOSManual ? t('install_hint_ios') : t('install_hint_manual');
    elements.title.textContent = t('install_title');
    elements.desc.textContent = t('install_desc_manual');
    elements.dismiss.textContent = t('install_got_it');
    elements.accept.hidden = true;
    elements.guideCard.hidden = false;
    elements.guideSteps.textContent = isIOSManual ? t('ios_guide_steps') : getBrowserManualGuideText();
  }

  elements.banner.classList.add('show');
  elements.banner.style.display = '';
}

function hideInstallSurfaces() {
  hideInstallBanner();
  hideRefreshBanner();
}

function bindInstallListeners() {
  if (installListenersBound) return;
  installListenersBound = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    forcedManualInstall = false;
    updateInstallBannerVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    forcedManualInstall = false;
    clearDismissed();
    hideInstallSurfaces();
    showToast(t('install_success') || '安装成功！');
  });
}

function bindInstallUi() {
  if (installUiBound) return;
  installUiBound = true;

  const { dismiss, accept } = getInstallElements();
  if (!dismiss || !accept) return;

  dismiss.addEventListener('click', () => {
    hideInstallBanner();
    rememberDismissed();
  });

  accept.addEventListener('click', async () => {
    await promptInstall();
  });
}

export async function promptInstall() {
  if (deferredPrompt) {
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    forcedManualInstall = false;
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

  forcedManualInstall = true;
  clearDismissed();
  updateInstallBannerVisibility({ forceShow: true });
  return null;
}

export function initInstallPrompt() {
  const banner = getInstallBanner();
  if (!banner) return;

  bindInstallListeners();
  bindInstallUi();

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
  const isInApp = isInAppBrowser();
  if (isInApp) return;

  const isIOS = isAppleMobile();
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

  if (isIOS && isSafari) {
    if (!isDismissedRecently()) {
      window.clearTimeout(iosPromptTimer);
      iosPromptTimer = window.setTimeout(() => {
        if (!isStandaloneMode() && !isDismissedRecently()) {
          updateInstallBannerVisibility({ forceShow: true });
        }
      }, 1800);
    }
    return;
  }

  updateInstallBannerVisibility();
}

function bindRefreshPromptListeners() {
  const refreshAccept = document.getElementById('refreshAccept');
  const refreshDismiss = document.getElementById('refreshDismiss');
  if (!refreshAccept || !refreshDismiss) return;

  refreshDismiss.addEventListener('click', () => {
    hideRefreshBanner();
    rememberRefreshDismissed();
    updateInstallBannerVisibility();
  });

  refreshAccept.addEventListener('click', async () => {
    if (pendingRefreshReload) return;
    pendingRefreshReload = true;
    refreshAccept.disabled = true;
    refreshAccept.textContent = '刷新中...';
    hideRefreshBanner();
    clearRefreshDismissed();
    await refreshAppResources();
  });
}

function watchServiceWorkerRegistration(registration) {
  if (!registration) return;

  if (registration.waiting) {
    markRefreshUpdateAvailable();
  }

  if (WATCHED_REGISTRATIONS.has(registration)) return;
  WATCHED_REGISTRATIONS.add(registration);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        clearRefreshDismissed();
        markRefreshUpdateAvailable();
      }
    });
  });
}

async function clearAppCaches() {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      const targets = keys.filter(key => APP_CACHE_NAME_PATTERNS.some(pattern => pattern.test(key)));
      await Promise.all(targets.map(key => caches.delete(key)));
    } catch (e) { /* ignore */ }
  }

  try {
    Object.keys(localStorage).forEach(key => {
      if (APP_CACHE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) { /* ignore */ }
}

async function refreshAppResources() {
  try {
    await clearAppCaches();

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const refreshRegistration = registrations.find(reg => String(reg.scope || '').startsWith(window.location.origin)) || registrations[0];
      if (refreshRegistration?.waiting) {
        refreshRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else if (refreshRegistration) {
        await refreshRegistration.update().catch(() => { });
      }
    }
  } finally {
    window.location.reload();
  }
}

export function initRefreshPrompt() {
  const banner = getRefreshBanner();
  if (!banner || refreshPromptInitialized) return;
  refreshPromptInitialized = true;

  bindRefreshPromptListeners();

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pendingRefreshReload) {
      window.location.reload();
    }
  });

  navigator.serviceWorker.getRegistration().then(registration => {
    if (!registration) return;
    watchServiceWorkerRegistration(registration);
    registration.update().catch(() => { });
  }).catch(() => { });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    navigator.serviceWorker.getRegistration().then(registration => {
      if (!registration) return;
      watchServiceWorkerRegistration(registration);
      registration.update().catch(() => { });
    }).catch(() => { });
  });
}

export function observeRefreshRegistration(registration) {
  watchServiceWorkerRegistration(registration);
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
    if (document.getElementById('aiFullscreen')?.classList.contains('show')) return;
    if (document.getElementById('searchOverlay')?.classList.contains('show')) return;

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
