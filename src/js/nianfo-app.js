/* ===== 念佛计数 独立页面入口 ===== */
import '../css/nianfo-page.css';
import { initCounterStandalone } from './counter.js';

/* --- 初始化 --- */
init();

function init() {
  syncTheme();
  const container = document.getElementById('nianfo-app');
  if (container) initCounterStandalone(container);
}

/* --- 主题同步 --- */
function syncTheme() {
  const applyTheme = (isDark) => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  if (typeof window.matchMedia !== 'function') {
    applyTheme(false);
    return;
  }

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme(mq.matches);

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', (e) => applyTheme(e.matches));
  } else if (typeof mq.addListener === 'function') {
    mq.addListener((e) => applyTheme(e.matches));
  }
}
