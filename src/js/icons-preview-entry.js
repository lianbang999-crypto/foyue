import {
  SVG,
  CENTER_PLAY_INNER,
  ICON_PLAY,
  ICON_PAUSE,
  ICON_PLAY_FILLED,
  ICON_PAUSE_FILLED,
  CATEGORY_ICONS,
  HOME_CATEGORY_ICONS,
  ICON_APPRECIATE,
  ICON_APPRECIATE_FILLED,
} from './icons.js';

function cell(label, html, className = '') {
  const wrap = document.createElement('div');
  wrap.className = `ip-cell ${className}`.trim();
  wrap.innerHTML = `<div class="ip-swatch">${html}</div><div class="ip-label">${label}</div>`;
  return wrap;
}

function section(title, rows) {
  const sec = document.createElement('section');
  sec.className = 'ip-section';
  const h = document.createElement('h2');
  h.textContent = title;
  sec.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'ip-grid';
  for (const [label, html, variant] of rows) {
    grid.appendChild(cell(label, html, variant || ''));
  }
  sec.appendChild(grid);
  return sec;
}

const root = document.getElementById('icons-preview');

root.appendChild(
  section('SVG（播放器 / 主题）', [
    ['play', SVG.play],
    ['pause', SVG.pause],
    ['sun', SVG.sun],
    ['moon', SVG.moon],
    ['loopAll', SVG.loopAll],
    ['loopOne', SVG.loopOne],
    ['shuffle', SVG.shuffle],
  ]),
);

root.appendChild(
  section('ICON_PLAY / PAUSE（描边 · 如首页续播）', [
    ['ICON_PLAY', ICON_PLAY, 'ip-stroke'],
    ['ICON_PAUSE', ICON_PAUSE, 'ip-stroke'],
  ]),
);

root.appendChild(
  section('ICON_*_FILLED（实心 · 如「播放全部」）', [
    ['ICON_PLAY_FILLED', ICON_PLAY_FILLED, 'ip-on-accent'],
    ['ICON_PAUSE_FILLED', ICON_PAUSE_FILLED, 'ip-on-accent'],
  ]),
);

const centerPlaySvg = `<svg viewBox="0 0 24 24" width="48" height="48">${CENTER_PLAY_INNER.play}</svg>`;
const centerPauseSvg = `<svg viewBox="0 0 24 24" width="48" height="48">${CENTER_PLAY_INNER.pause}</svg>`;
root.appendChild(
  section('CENTER_PLAY_INNER（底部大圆钮内层）', [
    ['play', centerPlaySvg, 'ip-center'],
    ['pause', centerPauseSvg, 'ip-center'],
  ]),
);

root.appendChild(
  section('CATEGORY_ICONS（系列卡片）', [
    ['tingjingtai', CATEGORY_ICONS.tingjingtai, 'ip-card'],
    ['fohao', CATEGORY_ICONS.fohao, 'ip-card'],
    ['youshengshu', CATEGORY_ICONS.youshengshu, 'ip-card'],
  ]),
);

root.appendChild(
  section('HOME_CATEGORY_ICONS.jingdiandusong', [
    ['→ 同 youshengshu', HOME_CATEGORY_ICONS.jingdiandusong, 'ip-card'],
  ]),
);

root.appendChild(
  section('随喜心形', [
    ['ICON_APPRECIATE', ICON_APPRECIATE, 'ip-stroke'],
    ['ICON_APPRECIATE_FILLED', ICON_APPRECIATE_FILLED, 'ip-heart-fill'],
  ]),
);
