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

  // ✅ 如果已经在standalone模式，不显示安装提示
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (navigator.standalone) return;

  // ✅ 检查是否在7天内被用户关闭过
  if (dismissed) {
    const ts = parseInt(dismissed, 10);
    if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
  }

  const ua = navigator.userAgent;
  const isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  if (isInApp) return;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

  // ✅ iOS Safari特殊处理
  if (isIOS && isSafari) {
    setTimeout(() => { iosGuide.classList.add('show'); }, 2000);
    document.getElementById('iosGuideClose').addEventListener('click', () => {
      iosGuide.classList.remove('show');
      localStorage.setItem('pl-install-dismissed', String(Date.now()));
    });
    return;
  }

  // ✅ 监听beforeinstallprompt事件
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add('show');
  });

  // ✅ 安装按钮点击处理
  document.getElementById('installAccept').addEventListener('click', async () => {
    if (deferredPrompt) {
      // ✅ 浏览器支持自动安装
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.classList.remove('show');
      if (result.outcome === 'accepted') {
        localStorage.setItem('pl-install-dismissed', String(Date.now()));
        showToast(t('install_success') || '安装成功！');
      }
    } else {
      // ✅ 浏览器不支持自动安装，显示手动安装引导
      showManualInstallGuide();
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
    showToast(t('install_success') || '安装成功！');
  });
}

// ✅ 新增：显示手动安装引导
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
    guide = t('install_menu_hint') || '请点击浏览器菜单中的"添加到主屏幕"选项';
  }

  showToast(guide);
}

/* ===== Back Navigation Guard ===== */
export function initBackGuard(renderCategory, stateRef, { closeFullScreen, getPlaylistVisible, closePlaylist, renderHomePage }) {
  const dom = getDOM();
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

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
