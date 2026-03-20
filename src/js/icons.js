/* SVG icon helpers — 24×24 viewBox, 与 layout/player/cards 的 stroke/fill 规则配合 */
export const SVG = {
  play: '<svg viewBox="0 0 24 24"><path d="M10 7.25L17.75 12L10 16.75z" stroke-linejoin="round"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24"><rect x="7.25" y="5.5" width="4" height="13" rx="1.25"/><rect x="12.75" y="5.5" width="4" height="13" rx="1.25"/></svg>',
  sun:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.75"/><line x1="12" y1="2.25" x2="12" y2="4.85"/><line x1="12" y1="19.15" x2="12" y2="21.75"/><line x1="4.07" y1="4.07" x2="5.9" y2="5.9"/><line x1="18.1" y1="18.1" x2="19.93" y2="19.93"/><line x1="2.25" y1="12" x2="4.85" y2="12"/><line x1="19.15" y1="12" x2="21.75" y2="12"/><line x1="4.07" y1="19.93" x2="5.9" y2="18.1"/><line x1="18.1" y1="5.9" x2="19.93" y2="4.07"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.76A8.5 8.5 0 0 1 11.24 3a6.8 6.8 0 1 0 9.76 9.76z"/></svg>',
  loopOne:
    '<svg viewBox="0 0 24 24"><path d="M17 2.5l4 4-4 4"/><path d="M3 11.25V9.5A4.25 4.25 0 0 1 7.25 5.25H19"/><path d="M7 21.5l-4-4 4-4"/><path d="M21 12.75v1.75a4.25 4.25 0 0 1-4.25 4.25H5"/><text x="12" y="14.75" font-size="8" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="system-ui,sans-serif">1</text></svg>',
  shuffle:
    '<svg viewBox="0 0 24 24"><polyline points="16.5 3 21.25 3 21.25 7.75"/><line x1="3.75" y1="20.25" x2="21.25" y2="3"/><polyline points="21.25 16.25 21.25 21 16.5 21"/><line x1="15.35" y1="15.35" x2="21.1" y2="21.1"/><line x1="3.9" y1="3.9" x2="9.65" y2="9.65"/></svg>',
  loopAll:
    '<svg viewBox="0 0 24 24"><path d="M17 2.5l4 4-4 4"/><path d="M3 11.25V9.5A4.25 4.25 0 0 1 7.25 5.25H19"/><path d="M7 21.5l-4-4 4-4"/><path d="M21 12.75v1.75a4.25 4.25 0 0 1-4.25 4.25H5"/></svg>',
};

/** 底部中间大按钮内层（插入到已有 &lt;svg class="center-play-icon"&gt; 内） */
export const CENTER_PLAY_INNER = {
  play: '<path d="M10 7.25L17.75 12L10 16.75z" stroke-linejoin="round"/>',
  pause:
    '<rect x="7.25" y="5.5" width="4" height="13" rx="1.25"/><rect x="12.75" y="5.5" width="4" height="13" rx="1.25"/>',
};

export const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M10 7.25L17.75 12L10 16.75z" stroke-linejoin="round"/></svg>';
export const ICON_PAUSE =
  '<svg viewBox="0 0 24 24"><rect x="7.25" y="5.5" width="4" height="13" rx="1.25"/><rect x="12.75" y="5.5" width="4" height="13" rx="1.25"/></svg>';
export const ICON_PLAY_FILLED =
  '<svg viewBox="0 0 24 24"><path d="M10 7.25L17.75 12L10 16.75z" fill="var(--text-inverse)" stroke="none"/></svg>';
export const ICON_PAUSE_FILLED =
  '<svg viewBox="0 0 24 24"><rect x="7.25" y="5.5" width="4" height="13" rx="1.25" fill="var(--text-inverse)"/><rect x="12.75" y="5.5" width="4" height="13" rx="1.25" fill="var(--text-inverse)"/></svg>';

export const CATEGORY_ICONS = {
  tingjingtai:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.25"/><path d="M12 12V7.5l3.25 2"/></svg>',
  fohao:
    '<svg viewBox="0 0 24 24"><path d="M12 20.75c-2.85-3.35-4.1-6.85-4.1-10.65a4.1 4.1 0 0 1 8.2 0c0 3.8-1.25 7.3-4.1 10.65z"/></svg>',
  youshengshu:
    '<svg viewBox="0 0 24 24"><path d="M4 19.5c0 .83.67 1.5 1.5 1.5H18"/><path d="M4 19.5V5.25C4 4.28 4.78 3.5 5.75 3.5H18a2 2 0 0 1 2 2v14"/><path d="M6 3.5v11c0 .83.67 1.5 1.5 1.5H18"/></svg>',
};

/** 首页推荐卡片等：与分类 id 对齐；无独立图标的 id 复用有声书 */
export const HOME_CATEGORY_ICONS = {
  ...CATEGORY_ICONS,
  jingdiandusong: CATEGORY_ICONS.youshengshu,
};

/* Heart — outline */
export const ICON_APPRECIATE =
  '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke-linejoin="round"/></svg>';
/* Heart — filled */
export const ICON_APPRECIATE_FILLED =
  '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/></svg>';
