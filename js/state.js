/**
 * state.js — Global state, DOM refs, utilities, event bus
 * Must be loaded FIRST before all other modules.
 */
(function(){
'use strict';

/* ===== Event Bus ===== */
var events = {
  _h: {},
  on: function(e, f) { (this._h[e] || (this._h[e] = [])).push(f); },
  off: function(e, f) { if (this._h[e]) this._h[e] = this._h[e].filter(function(fn) { return fn !== f; }); },
  emit: function(e) { var a = [].slice.call(arguments, 1); (this._h[e] || []).forEach(function(f) { f.apply(null, a); }); }
};

/* ===== DOM helpers ===== */
var $ = function(id) { return document.getElementById(id); };
var $q = function(s) { return document.querySelector(s); };
var $qa = function(s) { return document.querySelectorAll(s); };

/* ===== SVG icon helpers ===== */
var SVG = {
  play: '<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1" fill="currentColor" stroke="none"/><rect x="15" y="3" width="4" height="18" rx="1" fill="currentColor" stroke="none"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  loopOne: '<svg viewBox="0 0 24 24"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14.5" font-size="8" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">1</text></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><polyline points="16,3 21,3 21,8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21,16 21,21 16,21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  loopAll: '<svg viewBox="0 0 24 24"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
};

var ICON_PLAY = '<svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>';
var ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
var ICON_PLAY_FILLED = '<svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20" fill="var(--text-inverse)"/></svg>';
var ICON_PAUSE_FILLED = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" fill="var(--text-inverse)"/><rect x="14" y="4" width="4" height="16" rx="1" fill="var(--text-inverse)"/></svg>';

var ICONS = {
  tingjingtai: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>',
  fohao: '<svg viewBox="0 0 24 24"><path d="M12 3c0 0-5 7-5 13s5 5 5 5 5 1 5-5S12 3 12 3z"/></svg>',
  youshengshu: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
};

/* ===== Speed constants ===== */
var SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

/* ===== Ring circumference ===== */
var RING_CIRCUMFERENCE = 2 * Math.PI * 25; // r=25, circumference~157

/* ===== Language registration ===== */
var _langs = {};
function registerLang(code, translations) {
  _langs[code] = translations;
}

/* ===== Toast ===== */
function showToast(msg) {
  var toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'position:fixed;bottom:calc(64px + var(--safe-bottom) + 16px);left:50%;transform:translateX(-50%);background:var(--text);color:var(--text-inverse);padding:8px 20px;border-radius:20px;font-size:.78rem;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;font-family:var(--font-zh)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(function() { toast.style.opacity = '0'; }, 2000);
}

/* ===== Format time ===== */
function fmt(s) {
  if (!s || !isFinite(s)) return '0:00';
  var m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/* ===== Expose global App namespace ===== */
window.App = {
  // Event bus
  events: events,

  // DOM helpers
  $: $,
  $q: $q,
  $qa: $qa,

  // SVG icons
  SVG: SVG,
  ICON_PLAY: ICON_PLAY,
  ICON_PAUSE: ICON_PAUSE,
  ICON_PLAY_FILLED: ICON_PLAY_FILLED,
  ICON_PAUSE_FILLED: ICON_PAUSE_FILLED,
  ICONS: ICONS,

  // Constants
  SPEEDS: SPEEDS,
  RING_CIRCUMFERENCE: RING_CIRCUMFERENCE,

  // Language storage
  _langs: _langs,
  registerLang: registerLang,

  // Utilities
  showToast: showToast,
  fmt: fmt,

  // Shared state (mutable)
  data: null,
  tab: 'home',
  seriesId: null,
  epIdx: -1,
  playlist: [],
  loopMode: 'all',
  isFirstVisit: false,
  lang: 'zh',
  dark: false,
  speedIdx: 1,
  isSwitching: false,
  pendingSeek: 0,
  audioRetries: 0,
  playlistVisible: false,
  deferredPrompt: null,

  // DOM refs (populated after DOM ready)
  audio: null,
  contentArea: null,
  loader: null,
  playerBar: null,
  expPlayer: null,
  miniProgressFill: null,
  miniProgress: null,
  playerTrack: null,
  playerSub: null,
  btnPlay: null,
  playerInfo: null,
  expTitle: null,
  expSeries: null,
  expProgressFill: null,
  expProgressThumb: null,
  expBufferFill: null,
  expProgressBar: null,
  expTimeCurr: null,
  expTimeTotal: null,
  expPlay: null,
  expCollapse: null,
  expQueue: null,
  expPlayerContent: null,
  playlistPanel: null,
  plItems: null,
  plCount: null,
  navTitle: null,
  searchInput: null,
  searchRow: null,
  centerPlayBtn: null,
  centerPlayIcon: null,
  centerRingFill: null,
  expSeriesInfo: null,
  expSeriesName: null,
  expSeriesSpeaker: null,
  expSeriesEpCount: null,

  // Init DOM refs (called from app.js on DOMContentLoaded)
  initDOMRefs: function() {
    this.audio = $('audioEl');
    this.contentArea = $('contentArea');
    this.loader = $('loader');
    this.playerBar = $('playerBar');
    this.expPlayer = $('expPlayer');
    this.miniProgressFill = $('miniProgressFill');
    this.miniProgress = $('miniProgress');
    this.playerTrack = $('playerTrack');
    this.playerSub = $('playerSub');
    this.btnPlay = $('btnPlay');
    this.playerInfo = $('playerInfo');
    this.expTitle = $('expTitle');
    this.expSeries = $('expSeries');
    this.expProgressFill = $('expProgressFill');
    this.expProgressThumb = $('expProgressThumb');
    this.expBufferFill = $('expBufferFill');
    this.expProgressBar = $('expProgressBar');
    this.expTimeCurr = $('expTimeCurr');
    this.expTimeTotal = $('expTimeTotal');
    this.expPlay = $('expPlay');
    this.expCollapse = $('expCollapse');
    this.expQueue = $('expQueue');
    this.expPlayerContent = $('expPlayerContent');
    this.playlistPanel = $('playlistPanel');
    this.plItems = $('plItems');
    this.plCount = $('plCount');
    this.navTitle = $('navTitle');
    this.searchInput = $('searchInput');
    this.searchRow = $('searchRow');
    this.centerPlayBtn = $('centerPlayBtn');
    this.centerPlayIcon = $('centerPlayIcon');
    this.centerRingFill = $('centerRingFill');
    this.expSeriesInfo = $('expSeriesInfo');
    this.expSeriesName = $('expSeriesName');
    this.expSeriesSpeaker = $('expSeriesSpeaker');
    this.expSeriesEpCount = $('expSeriesEpCount');
  }
};

})();
