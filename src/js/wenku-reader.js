/* ===== Wenku Immersive Reader ===== */
import { escapeHtml, debounce } from './utils.js';
import { getWenkuDocument, recordWenkuRead } from './wenku-api.js';
import { saveBookmark, getBookmark } from './wenku.js';

/* Settings persistence */
const SETTINGS_KEY = 'wenku-reader-settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { mode: 'light', fontSize: 17, fontFamily: 'sans' };
  } catch { return { mode: 'light', fontSize: 17, fontFamily: 'sans' }; }
}

function persistSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* full */ }
}

let readerEl = null;
let currentDocId = null;
let settings = loadSettings();
let menuVisible = false;
let settingsVisible = false;

/* ===== Open Reader ===== */
export async function openReader(docId, highlightQuery) {
  currentDocId = docId;
  settings = loadSettings();
  menuVisible = false;
  settingsVisible = false;

  // Create reader container
  if (readerEl) readerEl.remove();
  readerEl = document.createElement('div');
  readerEl.className = 'wenku-reader';
  readerEl.setAttribute('data-mode', settings.mode);
  readerEl.innerHTML = buildReaderShell();
  document.body.appendChild(readerEl);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Show loading
  const scrollArea = readerEl.querySelector('#readerScroll');
  scrollArea.innerHTML = '<div class="wenku-loading" style="padding-top:40vh">加载中...</div>';

  // Fetch document
  const data = await getWenkuDocument(docId);
  if (!data || !data.document) {
    scrollArea.innerHTML = `<div class="wenku-empty" style="padding-top:30vh">
      <div style="margin-bottom:16px">文档加载失败</div>
      <button class="reader-retry-btn" id="readerRetry" style="padding:8px 24px;border-radius:8px;border:1px solid var(--reader-text-secondary,#999);background:transparent;color:var(--reader-text,#333);font-size:.82rem;cursor:pointer;margin-right:8px">重试</button>
      <button class="reader-retry-btn" id="readerRetryClose" style="padding:8px 24px;border-radius:8px;border:1px solid var(--reader-text-secondary,#999);background:transparent;color:var(--reader-text,#333);font-size:.82rem;cursor:pointer">返回</button>
    </div>`;
    const retryBtn = scrollArea.querySelector('#readerRetry');
    const closeBtn = scrollArea.querySelector('#readerRetryClose');
    if (retryBtn) retryBtn.addEventListener('click', () => openReader(docId, highlightQuery));
    if (closeBtn) closeBtn.addEventListener('click', () => closeReader());
    return;
  }

  const doc = data.document;

  // Record read
  recordWenkuRead(docId);

  // Render content
  const titleHtml = `<div class="reader-scroll-title">${escapeHtml(doc.title)}</div>`;
  const metaHtml = `<div class="reader-scroll-meta">${escapeHtml(doc.series_name || '大安法师')}</div>`;
  const bodyHtml = textToHtml(doc.content || '');

  // Audio link (if mapped)
  let audioLinkHtml = '';
  if (doc.audio_series_id) {
    audioLinkHtml = `<a class="reader-audio-link" id="readerAudioLink" data-series="${escapeHtml(doc.audio_series_id)}">
      <svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>
      收听音频
    </a>`;
  }

  scrollArea.innerHTML = titleHtml + metaHtml + audioLinkHtml + `<div class="reader-scroll-body" id="readerBody">${bodyHtml}</div>`;

  // Update topbar title
  const topTitle = readerEl.querySelector('.reader-topbar-title');
  if (topTitle) topTitle.textContent = doc.title;

  // Apply settings
  applySettings();

  // Prev/Next buttons
  updateNavButtons(data.prevId, data.nextId, data.totalEpisodes, doc.episode_num);

  // Restore scroll position
  if (!highlightQuery) {
    const bm = getBookmark(docId);
    if (bm && bm.percent > 0) {
      requestAnimationFrame(() => {
        const target = (scrollArea.scrollHeight - scrollArea.clientHeight) * (bm.percent / 100);
        scrollArea.scrollTo(0, target);
      });
    }
  }

  // Search highlight
  if (highlightQuery) {
    requestAnimationFrame(() => highlightText(highlightQuery));
  }

  // Wire up events
  wireEvents(data.prevId, data.nextId);

  // Scroll tracking
  const onScroll = debounce(() => {
    const sh = scrollArea.scrollHeight - scrollArea.clientHeight;
    if (sh > 0) {
      const pct = Math.min(100, (scrollArea.scrollTop / sh) * 100);
      saveBookmark(currentDocId, pct, doc.title, doc.series_name);
      // Update progress bar
      const fill = readerEl.querySelector('.reader-progress-fill');
      const text = readerEl.querySelector('.reader-progress-text');
      if (fill) fill.style.width = pct + '%';
      if (text) text.textContent = Math.round(pct) + '%';
    }
  }, 400);
  scrollArea.addEventListener('scroll', onScroll, { passive: true });
}

/* ===== Close Reader ===== */
export function closeReader() {
  if (readerEl) {
    // Clean up keydown listener
    if (readerEl._onKeydown) {
      document.removeEventListener('keydown', readerEl._onKeydown);
    }
    readerEl.remove();
    readerEl = null;
  }
  document.body.style.overflow = '';
  currentDocId = null;
}

/* ===== Build Reader Shell ===== */
function buildReaderShell() {
  return `
    <div class="reader-topbar" id="readerTopbar">
      <button class="reader-topbar-btn" id="readerClose" aria-label="关闭阅读器">
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <div class="reader-topbar-title"></div>
      <button class="reader-topbar-btn" id="readerSettingsBtn" aria-label="阅读设置">
        <svg viewBox="0 0 24 24"><text x="12" y="16" font-size="14" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle" font-family="serif">Aa</text></svg>
      </button>
    </div>
    <div class="reader-scroll" id="readerScroll"></div>
    <div class="reader-bottombar" id="readerBottombar">
      <div class="reader-progress-row">
        <div class="reader-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="reader-progress-fill"></div></div>
        <div class="reader-progress-text">0%</div>
      </div>
      <div class="reader-nav-row">
        <button class="reader-nav-btn" id="readerPrev" disabled aria-label="上一讲">
          <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> 上一讲
        </button>
        <button class="reader-nav-btn" id="readerNext" disabled aria-label="下一讲">
          下一讲 <svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </button>
      </div>
    </div>
    ${buildSettingsPanel()}
  `;
}

function buildSettingsPanel() {
  const s = settings;
  const modeActive = (m) => m === s.mode ? ' active' : '';
  const fontActive = (f) => f === s.fontFamily ? ' active' : '';

  return `
    <div class="reader-settings" id="readerSettings" role="dialog" aria-label="阅读设置">
      <div class="reader-settings-title" id="readerFontSizeLabel">字号</div>
      <div class="reader-fontsize">
        <span class="reader-fontsize-label reader-fontsize-sm">A</span>
        <input class="reader-fontsize-slider" id="readerFontSlider" type="range" min="14" max="24" step="1" value="${s.fontSize}" aria-labelledby="readerFontSizeLabel">
        <span class="reader-fontsize-label reader-fontsize-lg">A</span>
      </div>
      <div class="reader-settings-title">背景</div>
      <div class="reader-modes">
        <button class="reader-mode-btn reader-mode-light${modeActive('light')}" data-mode="light">白</button>
        <button class="reader-mode-btn reader-mode-sepia${modeActive('sepia')}" data-mode="sepia">护眼</button>
        <button class="reader-mode-btn reader-mode-dark${modeActive('dark')}" data-mode="dark">暗黑</button>
        <button class="reader-mode-btn reader-mode-eink${modeActive('eink')}" data-mode="eink">墨水</button>
      </div>
      <div class="reader-settings-title">字体</div>
      <div class="reader-fonts">
        <button class="reader-font-btn reader-font-sans${fontActive('sans')}" data-font="sans">黑体</button>
        <button class="reader-font-btn reader-font-serif${fontActive('serif')}" data-font="serif">宋体</button>
        <button class="reader-font-btn reader-font-kai${fontActive('kai')}" data-font="kai">楷体</button>
      </div>
    </div>
  `;
}

/* ===== Wire Events ===== */
function wireEvents(prevId, nextId) {
  if (!readerEl) return;

  // Close
  readerEl.querySelector('#readerClose').addEventListener('click', closeReader);

  // Tap to toggle menu — middle 1/3 of screen
  const scrollArea = readerEl.querySelector('#readerScroll');
  scrollArea.addEventListener('click', (e) => {
    // Don't toggle if clicking a link
    if (e.target.closest('a')) return;
    const rect = scrollArea.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    // Middle third toggles menu
    if (y > h * 0.33 && y < h * 0.67) {
      toggleMenu();
    }
  });

  // Settings button
  readerEl.querySelector('#readerSettingsBtn').addEventListener('click', () => {
    toggleSettings();
  });

  // Settings panel interactions
  const fontSlider = readerEl.querySelector('#readerFontSlider');
  fontSlider.addEventListener('input', () => {
    settings.fontSize = parseInt(fontSlider.value);
    applySettings();
    persistSettings(settings);
  });

  readerEl.querySelectorAll('.reader-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.mode = btn.dataset.mode;
      readerEl.querySelectorAll('.reader-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySettings();
      persistSettings(settings);
    });
  });

  readerEl.querySelectorAll('.reader-font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.fontFamily = btn.dataset.font;
      readerEl.querySelectorAll('.reader-font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySettings();
      persistSettings(settings);
    });
  });

  // Prev/Next with debounce to prevent rapid clicks
  let navLocked = false;
  function navTo(id) {
    if (navLocked) return;
    navLocked = true;
    openReader(id);
    // Lock released when new reader finishes loading (openReader recreates readerEl)
  }
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevId) {
    prevBtn.disabled = false;
    prevBtn.addEventListener('click', () => navTo(prevId));
  }
  if (nextId) {
    nextBtn.disabled = false;
    nextBtn.addEventListener('click', () => navTo(nextId));
  }

  // Audio link
  const audioLink = readerEl.querySelector('#readerAudioLink');
  if (audioLink) {
    audioLink.addEventListener('click', (e) => {
      e.preventDefault();
      const seriesId = audioLink.dataset.series;
      closeReader();
      // Navigate to audio series via deep link
      window.location.href = `/?series=${encodeURIComponent(seriesId)}`;
    });
  }

  // ESC to close
  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (settingsVisible) toggleSettings();
      else closeReader();
    }
  }
  document.addEventListener('keydown', onKeydown);
  // Store ref for cleanup
  readerEl._onKeydown = onKeydown;
}

/* ===== Toggle Menu ===== */
function toggleMenu() {
  if (settingsVisible) { toggleSettings(); return; }
  menuVisible = !menuVisible;
  const top = readerEl.querySelector('#readerTopbar');
  const bottom = readerEl.querySelector('#readerBottombar');
  top.classList.toggle('visible', menuVisible);
  bottom.classList.toggle('visible', menuVisible);
}

function toggleSettings() {
  settingsVisible = !settingsVisible;
  const panel = readerEl.querySelector('#readerSettings');
  panel.classList.toggle('visible', settingsVisible);
  // Also show topbar when settings visible
  if (settingsVisible) {
    readerEl.querySelector('#readerTopbar').classList.add('visible');
    readerEl.querySelector('#readerBottombar').classList.remove('visible');
    menuVisible = false;
  }
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

/* ===== Update Nav Buttons ===== */
function updateNavButtons(prevId, nextId, total, current) {
  if (!readerEl) return;
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevBtn && prevId) prevBtn.disabled = false;
  if (nextBtn && nextId) nextBtn.disabled = false;
}

/* ===== Text to HTML ===== */
function textToHtml(text) {
  if (!text) return '<p></p>';
  return text
    .split(/\n\n|\n/)
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
    .join('');
}

/* ===== Search Highlight ===== */
function highlightText(query) {
  if (!readerEl || !query) return;
  const body = readerEl.querySelector('#readerBody');
  if (!body) return;

  // Extract meaningful keywords (basic Chinese stop-word filter)
  const stops = new Set(['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '这', '中', '大', '为', '上', '个', '到', '说', '也']);
  const keywords = [...query].filter(c => !stops.has(c) && c.trim()).join('');
  if (keywords.length < 2) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
  const matches = [];
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.textContent.indexOf(keywords);
    if (idx >= 0) matches.push({ node, idx });
  }

  if (matches.length > 0) {
    const first = matches[0];
    const range = document.createRange();
    range.setStart(first.node, first.idx);
    range.setEnd(first.node, first.idx + keywords.length);
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    range.surroundContents(mark);
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
