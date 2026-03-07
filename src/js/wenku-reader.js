/* ===== Wenku Immersive Reader ===== */
/* v2: WeChat-read style topbar, continuous scroll, tap-zones, auto dark mode */
import { escapeHtml, debounce, showToast } from './utils.js';
import { getWenkuDocument, recordWenkuRead } from './wenku-api.js';
import { saveBookmark, getBookmark } from './wenku.js';
import { t } from './i18n.js';

/* Settings persistence */
const SETTINGS_KEY = 'wenku-reader-settings';
const SCROLL_KEY = 'wenku-reader-scroll'; // per-doc scroll progress

/** Resolve initial mode: follow system theme, then persist user choice */
function defaultMode() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  const appTheme = document.documentElement.getAttribute('data-theme');
  if (appTheme === 'dark') return 'dark';
  return 'light';
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { mode: defaultMode(), fontSize: 17, fontFamily: 'sans' };
  } catch { return { mode: defaultMode(), fontSize: 17, fontFamily: 'sans' }; }
}

function persistSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* full */ }
}

/* Scroll progress persistence (per document) */
function saveScrollProgress(docId, percent) {
  try {
    const data = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
    data[docId] = { percent, ts: Date.now() };
    // Cap at 200 entries
    const keys = Object.keys(data);
    if (keys.length > 200) {
      keys.sort((a, b) => (data[a].ts || 0) - (data[b].ts || 0));
      keys.slice(0, keys.length - 200).forEach(k => delete data[k]);
    }
    localStorage.setItem(SCROLL_KEY, JSON.stringify(data));
  } catch { /* full */ }
}

function getScrollProgress(docId) {
  try {
    const data = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
    return data[docId] ? data[docId].percent : 0;
  } catch { return 0; }
}

let readerEl = null;
let currentDocId = null;
let settings = loadSettings();
let menuVisible = false;
let settingsVisible = false;

/* Throttle read-count API */
let _lastReadId = null;
let _lastReadTs = 0;

/* System theme listener */
let _themeMediaQuery = null;

/* ===== Open Reader ===== */
export async function openReader(docId, highlightQuery) {
  // Properly close existing reader
  if (readerEl) closeReader(/* skipHistory */ true);

  currentDocId = docId;
  settings = loadSettings();
  menuVisible = false;
  settingsVisible = false;

  // Create reader container
  readerEl = document.createElement('div');
  readerEl.className = 'wenku-reader';
  readerEl.setAttribute('data-mode', settings.mode);
  readerEl.innerHTML = buildReaderShell();
  document.body.appendChild(readerEl);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Update URL state for deep linking & sharing
  window.history.pushState({ doc: docId }, '', `/?doc=${encodeURIComponent(docId)}`);

  // Show loading
  const scrollArea = readerEl.querySelector('#readerScroll');
  scrollArea.innerHTML = '<div class="wenku-loading" style="padding-top:40vh">' + (t('search_wenku_loading') || '加载中...') + '</div>';

  // Fetch document
  let data;
  try {
    data = await getWenkuDocument(docId);
  } catch { data = null; }
  if (!data || !data.document) {
    scrollArea.innerHTML = `<div class="wenku-empty" style="padding-top:30vh">
      <div style="margin-bottom:16px">${t('loading_fail') || '加载失败'}</div>
      <button class="reader-retry-btn" id="readerRetry">${t('retry') || '重试'}</button>
      <button class="reader-retry-btn" id="readerRetryClose">${t('wenku_back') || '返回'}</button>
    </div>`;
    const retryBtn = scrollArea.querySelector('#readerRetry');
    const closeBtn = scrollArea.querySelector('#readerRetryClose');
    if (retryBtn) retryBtn.addEventListener('click', () => openReader(docId, highlightQuery));
    if (closeBtn) closeBtn.addEventListener('click', () => history.back());
    return;
  }

  const doc = data.document;

  // Record read (throttled)
  if (docId !== _lastReadId || Date.now() - _lastReadTs > 60000) {
    recordWenkuRead(docId);
    _lastReadId = docId;
    _lastReadTs = Date.now();
  }

  // Build content — continuous scroll (no pagination)
  const titleHtml = `<div class="reader-scroll-title">${escapeHtml(doc.title)}</div>`;
  const metaHtml = `<div class="reader-scroll-meta">${escapeHtml(doc.series_name || t('wenku_da_an') || '大安法师')}</div>`;

  // Audio link
  let audioLinkHtml = '';
  if (doc.audio_series_id) {
    audioLinkHtml = `<a class="reader-audio-link" id="readerAudioLink" data-series="${escapeHtml(doc.audio_series_id)}">
      <svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>
      ${t('wenku_listen_audio') || '收听音频'}
    </a>`;
  }

  // Full body content (continuous scroll — no pagination)
  const bodyHtml = textToHtml(doc.content || '');

  // Next lecture card at end
  const nextCardHtml = data.nextId ? buildNextLectureCard(data.nextId, data.totalEpisodes, doc.episode_num) : buildEndCard();

  scrollArea.innerHTML = titleHtml + metaHtml + audioLinkHtml
    + `<div class="reader-scroll-body" id="readerBody">${bodyHtml}</div>`
    + nextCardHtml;

  // Update topbar title
  const topTitle = readerEl.querySelector('.reader-topbar-title');
  if (topTitle) topTitle.textContent = doc.title;

  // Update topbar series name
  const topSeries = readerEl.querySelector('.reader-topbar-series');
  if (topSeries) topSeries.textContent = doc.series_name || '';

  // Apply settings
  applySettings();

  // Prev/Next lecture buttons in bottom bar
  updateNavButtons(data.prevId, data.nextId, data.totalEpisodes, doc.episode_num);

  // Search highlight
  if (highlightQuery) {
    requestAnimationFrame(() => highlightText(highlightQuery));
  }

  // Wire up events
  wireEvents(data.prevId, data.nextId, doc);

  // Restore scroll position
  if (!highlightQuery) {
    const savedPct = getScrollProgress(docId);
    if (savedPct > 0) {
      requestAnimationFrame(() => {
        const sh = scrollArea.scrollHeight - scrollArea.clientHeight;
        if (sh > 0) scrollArea.scrollTo(0, (savedPct / 100) * sh);
      });
    }
  }

  // Listen for system theme changes
  setupThemeListener();

  // Preload next document
  if (data.nextId) getWenkuDocument(data.nextId);
}

/* ===== Close Reader ===== */
export function closeReader(skipHistory) {
  if (readerEl) {
    // Save final bookmark + scroll
    if (currentDocId) {
      const scrollArea = readerEl.querySelector('#readerScroll');
      if (scrollArea) {
        const sh = scrollArea.scrollHeight - scrollArea.clientHeight;
        const pct = sh > 0 ? Math.min(100, (scrollArea.scrollTop / sh) * 100) : 0;
        saveScrollProgress(currentDocId, pct);
        const titleEl = readerEl.querySelector('.reader-topbar-title');
        const metaEl = readerEl.querySelector('.reader-scroll-meta');
        saveBookmark(currentDocId, pct, titleEl?.textContent || '', metaEl?.textContent || '');
      }
    }
    if (readerEl._onKeydown) {
      document.removeEventListener('keydown', readerEl._onKeydown);
    }
    readerEl.remove();
    readerEl = null;
  }
  // Remove theme listener
  teardownThemeListener();
  document.body.style.overflow = '';
  if (!skipHistory && new URLSearchParams(window.location.search).has('doc')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  currentDocId = null;
}

/* ===== Text to HTML ===== */
function textToHtml(text) {
  if (!text) return '<p></p>';
  return text
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* ===== Build Reader Shell ===== */
function buildReaderShell() {
  return `
    <div class="reader-topbar visible" id="readerTopbar">
      <button class="reader-topbar-close" id="readerClose" aria-label="${t('wenku_reader_close') || '关闭阅读器'}">
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <div class="reader-topbar-center">
        <div class="reader-topbar-series"></div>
      </div>
      <button class="reader-topbar-action" id="readerMore" aria-label="${t('more') || '更多'}">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
    </div>
    <div class="reader-scroll" id="readerScroll"></div>
    <div class="reader-progress-line" id="readerProgressLine"><div class="reader-progress-line-fill" id="readerProgressFill"></div></div>
    <div class="reader-bottombar visible" id="readerBottombar">
      <button class="reader-bottom-nav-btn" id="readerPrev" disabled aria-label="${t('wenku_prev_lecture') || '上一讲'}">
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
        <span>${t('wenku_prev_lecture') || '上一讲'}</span>
      </button>
      <span class="reader-bottom-pct" id="readerPctText">0%</span>
      <button class="reader-bottom-nav-btn" id="readerNext" disabled aria-label="${t('wenku_next_lecture') || '下一讲'}">
        <span>${t('wenku_next_lecture') || '下一讲'}</span>
        <svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
      </button>
    </div>
    <div class="reader-actionsheet-backdrop" id="readerActionBackdrop"></div>
    <div class="reader-actionsheet" id="readerActionSheet">
      <button class="reader-action-item" id="readerActionShare">
        <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>${t('wenku_reader_share') || '分享'}</span>
      </button>
      <button class="reader-action-item" id="readerActionSettings">
        <svg viewBox="0 0 24 24"><text x="12" y="16" font-size="14" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle" font-family="serif">Aa</text></svg>
        <span>${t('wenku_reader_settings') || '阅读设置'}</span>
      </button>
      <button class="reader-action-item reader-action-cancel" id="readerActionCancel">
        <span>${t('cancel') || '取消'}</span>
      </button>
    </div>
    ${buildSettingsPanel()}
  `;
}

/* ===== Next Lecture Card ===== */
function buildNextLectureCard(nextId, total, currentEp) {
  const nextEp = currentEp ? currentEp + 1 : '';
  const label = nextEp ? `${t('wenku_next_lecture') || '下一讲'} · ${nextEp}/${total || '?'}` : (t('wenku_next_lecture') || '下一讲');
  return `
    <div class="reader-next-card" id="readerNextCard" data-next-id="${escapeHtml(nextId)}">
      <div class="reader-next-divider"></div>
      <div class="reader-next-label">${label}</div>
      <svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
    </div>`;
}

function buildEndCard() {
  return `
    <div class="reader-end-card">
      <div class="reader-next-divider"></div>
      <div class="reader-end-text">${t('wenku_end') || '— 全文完 —'}</div>
    </div>`;
}

function buildSettingsPanel() {
  const s = settings;
  const modeActive = (m) => m === s.mode ? ' active' : '';
  const fontActive = (f) => f === s.fontFamily ? ' active' : '';

  return `
    <div class="reader-settings-backdrop" id="readerSettingsBackdrop"></div>
    <div class="reader-settings" id="readerSettings" role="dialog" aria-label="${t('wenku_reader_settings') || '阅读设置'}">
      <div class="reader-settings-title" id="readerFontSizeLabel">${t('reader_font_size') || '字号'}</div>
      <div class="reader-fontsize">
        <span class="reader-fontsize-label reader-fontsize-sm">A</span>
        <input class="reader-fontsize-slider" id="readerFontSlider" type="range" min="14" max="28" step="1" value="${s.fontSize}" aria-labelledby="readerFontSizeLabel">
        <span class="reader-fontsize-label reader-fontsize-lg">A</span>
      </div>
      <div class="reader-settings-title">${t('reader_background') || '背景'}</div>
      <div class="reader-modes">
        <button class="reader-mode-btn reader-mode-light${modeActive('light')}" data-mode="light">${t('reader_mode_light') || '白'}</button>
        <button class="reader-mode-btn reader-mode-sepia${modeActive('sepia')}" data-mode="sepia">${t('reader_mode_sepia') || '护眼'}</button>
        <button class="reader-mode-btn reader-mode-dark${modeActive('dark')}" data-mode="dark">${t('reader_mode_dark') || '暗黑'}</button>
        <button class="reader-mode-btn reader-mode-eink${modeActive('eink')}" data-mode="eink">${t('reader_mode_eink') || '墨水'}</button>
      </div>
      <div class="reader-settings-title">${t('reader_font_family') || '字体'}</div>
      <div class="reader-fonts">
        <button class="reader-font-btn reader-font-sans${fontActive('sans')}" data-font="sans">${t('reader_font_sans') || '黑体'}</button>
        <button class="reader-font-btn reader-font-serif${fontActive('serif')}" data-font="serif">${t('reader_font_serif') || '宋体'}</button>
        <button class="reader-font-btn reader-font-kai${fontActive('kai')}" data-font="kai">${t('reader_font_kai') || '楷体'}</button>
      </div>
    </div>
  `;
}

/* ===== Wire Events ===== */
function wireEvents(prevId, nextId, doc) {
  if (!readerEl) return;

  // Close button
  readerEl.querySelector('#readerClose').addEventListener('click', () => history.back());

  // More button → action sheet
  readerEl.querySelector('#readerMore').addEventListener('click', () => toggleActionSheet());

  // Action sheet backdrop
  readerEl.querySelector('#readerActionBackdrop').addEventListener('click', () => toggleActionSheet(false));
  readerEl.querySelector('#readerActionCancel').addEventListener('click', () => toggleActionSheet(false));

  // Share action
  readerEl.querySelector('#readerActionShare').addEventListener('click', async () => {
    toggleActionSheet(false);
    const docTitle = readerEl.querySelector('.reader-topbar-title')?.textContent || doc.title || '';
    const seriesName = doc.series_name || '';
    const title = docTitle ? `《${docTitle}》` : '净土法音文库';
    const shareText = seriesName ? `${title} — ${seriesName}` : title;
    const url = `${window.location.origin}/?doc=${encodeURIComponent(currentDocId)}`;
    if (navigator.share) {
      try { await navigator.share({ title: docTitle || '净土法音文库', text: shareText, url }); } catch { /* cancelled */ }
    } else {
      const copyText = shareText + '\n' + url;
      try {
        await navigator.clipboard.writeText(copyText);
        showToast(t('link_copied') || '链接已复制');
      } catch {
        const inp = document.createElement('input');
        inp.value = copyText; document.body.appendChild(inp);
        inp.select(); document.execCommand('copy'); inp.remove();
        showToast(t('link_copied') || '链接已复制');
      }
    }
  });

  // Settings action
  readerEl.querySelector('#readerActionSettings').addEventListener('click', () => {
    toggleActionSheet(false);
    toggleSettings(true);
  });

  // Settings backdrop
  const settingsBackdrop = readerEl.querySelector('#readerSettingsBackdrop');
  if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => { if (settingsVisible) toggleSettings(false); });

  // Font slider
  const fontSlider = readerEl.querySelector('#readerFontSlider');
  fontSlider.addEventListener('input', () => {
    settings.fontSize = parseInt(fontSlider.value);
    applySettings();
    persistSettings(settings);
  });

  // Mode buttons
  readerEl.querySelectorAll('.reader-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.mode = btn.dataset.mode;
      readerEl.querySelectorAll('.reader-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySettings();
      persistSettings(settings);
    });
  });

  // Font family buttons
  readerEl.querySelectorAll('.reader-font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.fontFamily = btn.dataset.font;
      readerEl.querySelectorAll('.reader-font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySettings();
      persistSettings(settings);
    });
  });

  // Prev/Next lecture buttons
  let navLocked = false;
  async function navTo(id, btn) {
    if (navLocked) return;
    navLocked = true;
    if (btn) { btn.disabled = true; btn.querySelector('span').textContent = t('search_wenku_loading') || '加载中...'; }
    try {
      await openReader(id);
    } catch {
      navLocked = false;
      if (btn) btn.disabled = false;
    }
  }
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevId) { prevBtn.disabled = false; prevBtn.addEventListener('click', () => navTo(prevId, prevBtn)); }
  if (nextId) { nextBtn.disabled = false; nextBtn.addEventListener('click', () => navTo(nextId, nextBtn)); }

  // Next lecture card at bottom of article
  const nextCard = readerEl.querySelector('#readerNextCard');
  if (nextCard) {
    nextCard.addEventListener('click', () => navTo(nextCard.dataset.nextId, null));
  }

  // Tap zones on scroll area
  const scrollArea = readerEl.querySelector('#readerScroll');
  scrollArea.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.reader-next-card')) return;
    const rect = scrollArea.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    // Middle 1/3 = toggle toolbar
    if (y > h * 0.33 && y < h * 0.67) {
      toggleToolbars();
    }
    // Top & bottom 1/3: natural scroll — no action needed for continuous scroll
  });

  // Touch swipe left/right for prev/next lecture (not page)
  let touchStartX = 0, touchStartY = 0;
  scrollArea.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  scrollArea.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only trigger on strong horizontal swipe with minimal vertical
    if (Math.abs(dx) > 120 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx < 0 && nextId) navTo(nextId, null); // swipe left = next lecture
      else if (dx > 0) history.back(); // swipe right = go back
    }
  }, { passive: true });

  // Audio link
  const audioLink = readerEl.querySelector('#readerAudioLink');
  if (audioLink) {
    audioLink.addEventListener('click', (e) => {
      e.preventDefault();
      const seriesId = audioLink.dataset.series;
      closeReader();
      window.location.href = `/?series=${encodeURIComponent(seriesId)}`;
    });
  }

  // Keyboard shortcuts
  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (settingsVisible) toggleSettings(false);
      else if (actionSheetVisible()) toggleActionSheet(false);
      else history.back();
    }
  }
  document.addEventListener('keydown', onKeydown);
  readerEl._onKeydown = onKeydown;

  // Scroll tracking — update progress bar + save bookmark
  const onScroll = debounce(() => {
    if (!readerEl || !currentDocId) return;
    const sh = scrollArea.scrollHeight - scrollArea.clientHeight;
    const pct = sh > 0 ? Math.min(100, (scrollArea.scrollTop / sh) * 100) : 0;
    updateProgress(pct);
    saveScrollProgress(currentDocId, pct);
    saveBookmark(currentDocId, pct, doc.title, doc.series_name);
  }, 200);
  scrollArea.addEventListener('scroll', onScroll, { passive: true });

  // Also update progress on fast scroll (not debounced, just the UI)
  scrollArea.addEventListener('scroll', () => {
    if (!readerEl) return;
    const sh = scrollArea.scrollHeight - scrollArea.clientHeight;
    const pct = sh > 0 ? Math.min(100, (scrollArea.scrollTop / sh) * 100) : 0;
    const fill = readerEl.querySelector('#readerProgressFill');
    if (fill) fill.style.width = pct + '%';
  }, { passive: true });
}

/* ===== Action Sheet ===== */
function actionSheetVisible() {
  if (!readerEl) return false;
  return readerEl.querySelector('#readerActionSheet')?.classList.contains('visible');
}

function toggleActionSheet(force) {
  if (!readerEl) return;
  const sheet = readerEl.querySelector('#readerActionSheet');
  const backdrop = readerEl.querySelector('#readerActionBackdrop');
  const show = force !== undefined ? force : !sheet.classList.contains('visible');
  sheet.classList.toggle('visible', show);
  backdrop.classList.toggle('visible', show);
}

/* ===== Toggle Toolbars ===== */
function toggleToolbars() {
  if (settingsVisible) { toggleSettings(false); return; }
  if (actionSheetVisible()) { toggleActionSheet(false); return; }
  menuVisible = !menuVisible;
  const top = readerEl.querySelector('#readerTopbar');
  const bottom = readerEl.querySelector('#readerBottombar');
  top.classList.toggle('visible', menuVisible);
  bottom.classList.toggle('visible', menuVisible);
}

function toggleSettings(force) {
  settingsVisible = force !== undefined ? force : !settingsVisible;
  const panel = readerEl.querySelector('#readerSettings');
  const backdrop = readerEl.querySelector('#readerSettingsBackdrop');
  panel.classList.toggle('visible', settingsVisible);
  if (backdrop) backdrop.classList.toggle('visible', settingsVisible);
}

/* ===== Apply Settings ===== */
function applySettings() {
  if (!readerEl) return;
  readerEl.setAttribute('data-mode', settings.mode);

  const body = readerEl.querySelector('.reader-scroll-body');
  if (body) {
    body.style.fontSize = settings.fontSize + 'px';
    const fontMap = {
      sans: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
      serif: "'Noto Serif SC', 'Songti SC', SimSun, serif",
      kai: "'KaiTi', 'STKaiti', 'Kaiti', serif",
    };
    body.style.fontFamily = fontMap[settings.fontFamily] || fontMap.sans;
  }
}

/* ===== Update Progress ===== */
function updateProgress(pct) {
  if (!readerEl) return;
  const fill = readerEl.querySelector('#readerProgressFill');
  const text = readerEl.querySelector('#readerPctText');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = Math.round(pct) + '%';
}

/* ===== Update Nav Buttons ===== */
function updateNavButtons(prevId, nextId) {
  if (!readerEl) return;
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevBtn && prevId) prevBtn.disabled = false;
  if (nextBtn && nextId) nextBtn.disabled = false;
}

/* ===== System Theme Listener ===== */
function setupThemeListener() {
  if (!window.matchMedia) return;
  _themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  _themeMediaQuery._handler = (e) => {
    // Only auto-switch if user hasn't explicitly chosen a non-matching mode
    const saved = loadSettings();
    if (saved.mode === 'light' || saved.mode === 'dark') {
      settings.mode = e.matches ? 'dark' : 'light';
      applySettings();
      persistSettings(settings);
      // Update mode buttons
      if (readerEl) {
        readerEl.querySelectorAll('.reader-mode-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = readerEl.querySelector(`.reader-mode-btn[data-mode="${settings.mode}"]`);
        if (activeBtn) activeBtn.classList.add('active');
      }
    }
  };
  _themeMediaQuery.addEventListener('change', _themeMediaQuery._handler);
}

function teardownThemeListener() {
  if (_themeMediaQuery && _themeMediaQuery._handler) {
    _themeMediaQuery.removeEventListener('change', _themeMediaQuery._handler);
    _themeMediaQuery = null;
  }
}

/* ===== Search Highlight ===== */
function highlightText(query) {
  if (!readerEl || !query) return;
  const body = readerEl.querySelector('#readerBody');
  if (!body) return;

  const stops = new Set(['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '这', '中', '大', '为', '上', '个', '到', '说', '也']);
  const keywords = [...query].filter(c => !stops.has(c) && c.trim()).join('');
  if (keywords.length < 2) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.textContent.indexOf(keywords);
    if (idx >= 0) {
      try {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + keywords.length);
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        range.surroundContents(mark);
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* cross-node boundary */ }
      return;
    }
  }
}
