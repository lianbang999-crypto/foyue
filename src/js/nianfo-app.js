/* ===== 念佛计数 独立页面入口 ===== */
import '../css/nianfo-page.css';
import { initCounterStandalone } from './counter.js';
import { syncSystemTheme } from './theme.js';

const THEME_COLORS = {
  light: '#F7F2EA',
  dark: '#1D1D1D',
};

/* --- 初始化 --- */
init();

function init() {
  syncSystemTheme(THEME_COLORS);
  const container = document.getElementById('nianfo-app');
  if (container) initCounterStandalone(container);
}
