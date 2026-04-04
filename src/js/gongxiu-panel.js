import { t } from './i18n.js';

export function showGongxiuSubview() {
  const existing = document.querySelector('.gx-fullscreen');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.className = 'gx-fullscreen';
  panel.innerHTML = `
    <div class="gx-fs-header">
      <button class="btn-icon" id="gxFsBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="gx-fs-title">${t('my_gongxiu')}</span>
      <div style="width:44px;flex-shrink:0"></div>
    </div>
    <div class="gx-view-wrap" style="flex:1;overflow:hidden;position:relative">
      <div id="gxContent" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    </div>`;

  document.getElementById('app').appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('gx-fullscreen--in'));

  const openCounter = () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => {
      panel.remove();
      import('./counter-lazy.js').then(mod => mod.openCounter());
    }, 320);
  };

  import('./gongxiu-lazy.js').then(mod => {
    mod.renderGongxiu(panel.querySelector('#gxContent'), openCounter);
  });

  panel.querySelector('#gxFsBack').addEventListener('click', () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => panel.remove(), 320);
  });
}
