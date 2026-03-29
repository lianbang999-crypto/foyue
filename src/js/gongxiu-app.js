/* ===== 共修广场 独立页面入口 ===== */
import '../css/gongxiu-page.css';
import { renderGongxiu } from './gongxiu.js';

/* --- 初始化 --- */
init();

function init() {
  syncTheme();
  const content = document.getElementById('gxPageContent');
  if (content) {
    // onOpenCounter: 独立页面中导航到 /nianfo
    renderGongxiu(content, () => {
      window.location.href = '/nianfo';
    });
  }
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
