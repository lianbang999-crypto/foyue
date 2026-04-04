/* ===== 共修广场 独立页面入口 ===== */
import '../css/gongxiu-page.css';
import { renderGongxiu } from './gongxiu.js';
import { syncSystemTheme } from './theme.js';

const THEME_COLORS = {
  light: '#F7F5F0',
  dark: '#1D1D1D',
};

/* --- 初始化 --- */
init();

function init() {
  syncSystemTheme(THEME_COLORS);
  const content = document.getElementById('gxPageContent');
  if (content) {
    // onOpenCounter: 独立页面中导航到 /nianfo
    renderGongxiu(content, () => {
      window.location.href = '/nianfo';
    });
  }
}
