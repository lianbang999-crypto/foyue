/* ===== 念佛计数 独立页面入口 ===== */
import '../css/nianfo-page.css';
import { initCounterStandalone } from './counter.js';

const THEME_COLORS = {
  light: '#F7F2EA',
  dark: '#1D1D1D',
};

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
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
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
