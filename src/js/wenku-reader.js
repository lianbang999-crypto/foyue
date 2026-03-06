/* ===== Wenku Immersive Reader ===== */
import { escapeHtml, debounce, showToast } from './utils.js';
import { getWenkuDocument, recordWenkuRead } from './wenku-api.js';
import { saveBookmark, getBookmark } from './wenku.js';
import { t } from './i18n.js';

/* Settings persistence */
const SETTINGS_KEY = 'wenku-reader-settings';

/** Resolve initial mode: follow app theme on first use, then persist user choice */
function defaultMode() {
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

let readerEl = null;
let currentDocId = null;
let settings = loadSettings();
let menuVisible = false;
let settingsVisible = false;

/* Pagination state */
let pages = [];
let currentPage = 0;
const CHARS_PER_PAGE = 2000;

/* Throttle read-count API */
let _lastReadId = null;
let _lastReadTs = 0;

/* ===== Open Reader ===== */
export async function openReader(docId, highlightQuery) {
  // Properly close existing reader (cleans up keydown listeners, restores body scroll)
  if (readerEl) closeReader(/* skipHistory */ true);

  currentDocId = docId;
  settings = loadSettings();
  menuVisible = false;
  settingsVisible = false;
  pages = [];
  currentPage = 0;

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

  // Fetch document (with error boundary)
  let data;
  try {
    data = await getWenkuDocument(docId);
  } catch { data = null; }
  if (!data || !data.document) {
    scrollArea.innerHTML = `<div class="wenku-empty" style="padding-top:30vh">
      <div style="margin-bottom:16px">${t('loading_fail') || '加载失败'}</div>
      <button class="reader-retry-btn" id="readerRetry" style="padding:8px 24px;border-radius:8px;border:1px solid var(--reader-text-secondary,#999);background:transparent;color:var(--reader-text,#333);font-size:.82rem;cursor:pointer;margin-right:8px">${t('retry') || '重试'}</button>
      <button class="reader-retry-btn" id="readerRetryClose" style="padding:8px 24px;border-radius:8px;border:1px solid var(--reader-text-secondary,#999);background:transparent;color:var(--reader-text,#333);font-size:.82rem;cursor:pointer">${t('wenku_back') || '返回'}</button>
    </div>`;
    const retryBtn = scrollArea.querySelector('#readerRetry');
    const closeBtn = scrollArea.querySelector('#readerRetryClose');
    if (retryBtn) retryBtn.addEventListener('click', () => openReader(docId, highlightQuery));
    if (closeBtn) closeBtn.addEventListener('click', () => history.back());
    return;
  }

  const doc = data.document;

  // Record read (throttled — skip if same doc within 60s)
  if (docId !== _lastReadId || Date.now() - _lastReadTs > 60000) {
    recordWenkuRead(docId);
    _lastReadId = docId;
    _lastReadTs = Date.now();
  }

  // Build header HTML
  const titleHtml = `<div class="reader-scroll-title">${escapeHtml(doc.title)}</div>`;
  const metaHtml = `<div class="reader-scroll-meta">${escapeHtml(doc.series_name || t('wenku_da_an') || '大安法师')}</div>`;

  // Audio link (if mapped)
  let audioLinkHtml = '';
  if (doc.audio_series_id) {
    audioLinkHtml = `<a class="reader-audio-link" id="readerAudioLink" data-series="${escapeHtml(doc.audio_series_id)}">
      <svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>
      ${t('wenku_listen_audio') || '收听音频'}
    </a>`;
  }

  // Paginate content
  pages = paginateContent(doc.content || '');

  // Restore page from bookmark
  if (!highlightQuery) {
    const bm = getBookmark(docId);
    if (bm && bm.percent > 0 && pages.length > 1) {
      currentPage = Math.min(Math.floor((bm.percent / 100) * pages.length), pages.length - 1);
    }
  }

  // If searching, find the page containing the match
  if (highlightQuery && pages.length > 1) {
    const stops = new Set(['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '这', '中', '大', '为', '上', '个', '到', '说', '也']);
    const kw = [...highlightQuery].filter(c => !stops.has(c) && c.trim()).join('');
    if (kw.length >= 2) {
      const idx = pages.findIndex(p => p.includes(escapeHtml(kw)));
      if (idx >= 0) currentPage = idx;
    }
  }

  const bodyHtml = pages[currentPage] || '';
  scrollArea.innerHTML = titleHtml + metaHtml + audioLinkHtml
    + `<div class="reader-scroll-body" id="readerBody">${bodyHtml}</div>`
    + buildPageNav();

  // Update topbar title
  const topTitle = readerEl.querySelector('.reader-topbar-title');
  if (topTitle) topTitle.textContent = doc.title;

  // Apply settings
  applySettings();

  // Prev/Next lecture buttons
  updateNavButtons(data.prevId, data.nextId, data.totalEpisodes, doc.episode_num);

  // Update progress bar to current page
  updateProgress();

  // Search highlight
  if (highlightQuery) {
    requestAnimationFrame(() => highlightText(highlightQuery));
  }

  // Wire up events
  wireEvents(data.prevId, data.nextId, doc);

  // Preload next document into cache (fire-and-forget)
  if (data.nextId) {
    getWenkuDocument(data.nextId);
  }
}

/* ===== Close Reader ===== */
export function closeReader(skipHistory) {
  if (readerEl) {
    // Save final bookmark immediately (avoid debounce loss)
    if (currentDocId && pages.length > 0) {
      const pct = pages.length > 1 ? (currentPage / (pages.length - 1)) * 100 : 0;
      const titleEl = readerEl.querySelector('.reader-topbar-title');
      const metaEl = readerEl.querySelector('.reader-scroll-meta');
      saveBookmark(currentDocId, pct, titleEl?.textContent || '', metaEl?.textContent || '');
    }
    if (readerEl._onKeydown) {
      document.removeEventListener('keydown', readerEl._onKeydown);
    }
    readerEl.remove();
    readerEl = null;
  }
  document.body.style.overflow = '';
  // Clean up URL if still on ?doc= page
  if (!skipHistory && new URLSearchParams(window.location.search).has('doc')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  currentDocId = null;
  pages = [];
  currentPage = 0;
}

/* ===== Pagination ===== */
function paginateContent(text) {
  if (!text) return ['<p></p>'];
  // Split on double newlines (paragraph breaks)
  const blocks = text.split(/\n\n+/).filter(b => b.trim());
  const result = [];
  let curParas = [];
  let curLen = 0;

  for (const block of blocks) {
    const paraHtml = `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`;
    const rawLen = block.length;
    if (curLen + rawLen > CHARS_PER_PAGE && curParas.length > 0) {
      result.push(curParas.join(''));
      curParas = [];
      curLen = 0;
    }
    curParas.push(paraHtml);
    curLen += rawLen;
  }
  if (curParas.length > 0) result.push(curParas.join(''));
  return result.length ? result : ['<p></p>'];
}

function buildPageNav() {
  if (pages.length <= 1) return '';
  return `
    <div class="reader-page-nav" id="readerPageNav">
      <button class="reader-page-btn" id="readerPagePrev" ${currentPage === 0 ? 'disabled' : ''} aria-label="上一页">
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="reader-page-indicator" id="readerPageIndicator">${currentPage + 1} / ${pages.length}</span>
      <button class="reader-page-btn" id="readerPageNext" ${currentPage >= pages.length - 1 ? 'disabled' : ''} aria-label="下一页">
        <svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
      </button>
    </div>`;
}

function goToPage(idx, direction) {
  if (idx < 0 || idx >= pages.length || !readerEl) return;
  const oldPage = currentPage;
  currentPage = idx;

  const body = readerEl.querySelector('#readerBody');
  const navEl = readerEl.querySelector('#readerPageNav');
  const scrollArea = readerEl.querySelector('#readerScroll');

  // Animate page transition
  if (body && direction !== undefined) {
    const dir = direction || (idx > oldPage ? 'left' : 'right');
    body.classList.add('page-exit-' + dir);
    requestAnimationFrame(() => {
      body.innerHTML = pages[currentPage];
      body.classList.remove('page-exit-' + dir);
      body.classList.add('page-enter-' + dir);
      requestAnimationFrame(() => body.classList.remove('page-enter-' + dir));
    });
  } else if (body) {
    body.innerHTML = pages[currentPage];
  }

  if (navEl) navEl.outerHTML = buildPageNav();

  wirePageNav();
  if (scrollArea) scrollArea.scrollTo(0, 0);
  applySettings();
  updateProgress();

  // Immediately save bookmark on page turn
  if (currentDocId) {
    const pct = pages.length > 1 ? (currentPage / (pages.length - 1)) * 100 : 0;
    const titleEl = readerEl.querySelector('.reader-topbar-title');
    const metaEl = readerEl.querySelector('.reader-scroll-meta');
    saveBookmark(currentDocId, pct, titleEl?.textContent || '', metaEl?.textContent || '');
  }
}

function wirePageNav() {
  if (!readerEl) return;
  const prev = readerEl.querySelector('#readerPagePrev');
  const next = readerEl.querySelector('#readerPageNext');
  if (prev) prev.addEventListener('click', () => goToPage(currentPage - 1));
  if (next) next.addEventListener('click', () => goToPage(currentPage + 1));
}

function updateProgress() {
  if (!readerEl) return;
  const pct = pages.length > 1 ? (currentPage / (pages.length - 1)) * 100 : 0;
  const fill = readerEl.querySelector('.reader-progress-fill');
  const text = readerEl.querySelector('.reader-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = Math.round(pct) + '%';
}

/* ===== Build Reader Shell ===== */
function buildReaderShell() {
  return `
    <div class="reader-topbar" id="readerTopbar">
      <button class="reader-topbar-btn" id="readerClose" aria-label="${t('wenku_reader_close') || '关闭阅读器'}">
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <div class="reader-topbar-title"></div>
      <button class="reader-topbar-btn" id="readerShare" aria-label="${t('wenku_reader_share') || '分享'}">
        <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
      <button class="reader-topbar-btn" id="readerSettingsBtn" aria-label="${t('wenku_reader_settings') || '阅读设置'}">
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
        <button class="reader-nav-btn" id="readerPrev" disabled aria-label="${t('wenku_prev_lecture') || '上一讲'}">
          <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> ${t('wenku_prev_lecture') || '上一讲'}
        </button>
        <button class="reader-nav-btn" id="readerNext" disabled aria-label="${t('wenku_next_lecture') || '下一讲'}">
          ${t('wenku_next_lecture') || '下一讲'} <svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
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

  // Close — trigger history.back() so popstate handler manages routing
  readerEl.querySelector('#readerClose').addEventListener('click', () => history.back());

  // Tap to toggle menu — middle 1/3 of screen
  const scrollArea = readerEl.querySelector('#readerScroll');
  scrollArea.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('button')) return;
    const rect = scrollArea.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (y > h * 0.33 && y < h * 0.67) {
      toggleMenu();
    }
  });

  // Settings button
  readerEl.querySelector('#readerSettingsBtn').addEventListener('click', () => toggleSettings());

  // Settings backdrop — click to dismiss
  const settingsBackdrop = readerEl.querySelector('#readerSettingsBackdrop');
  if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => { if (settingsVisible) toggleSettings(); });

  // Share button — use toast instead of flash
  readerEl.querySelector('#readerShare').addEventListener('click', async () => {
    const docTitle = readerEl.querySelector('.reader-topbar-title')?.textContent || '';
    const seriesName = readerEl.querySelector('.reader-scroll-meta')?.textContent || '';
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

  // Prev/Next lecture with loading state
  let navLocked = false;
  async function navTo(id, btn) {
    if (navLocked) return;
    navLocked = true;
    if (btn) { btn.disabled = true; btn.textContent = t('search_wenku_loading') || '加载中...'; }
    try {
      await openReader(id);
    } catch {
      navLocked = false;
      if (btn) { btn.disabled = false; }
    }
  }
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevId) { prevBtn.disabled = false; prevBtn.addEventListener('click', () => navTo(prevId, prevBtn)); }
  if (nextId) { nextBtn.disabled = false; nextBtn.addEventListener('click', () => navTo(nextId, nextBtn)); }

  // Wire page navigation buttons
  wirePageNav();

  // Touch swipe for page navigation
  let touchStartX = 0, touchStartY = 0;
  scrollArea.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  scrollArea.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToPage(currentPage + 1, 'left');
      else goToPage(currentPage - 1, 'right');
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

  // ESC to close, arrow keys for pages
  function onKeydown(e) {
    if (e.key === 'Escape') {
      if (settingsVisible) toggleSettings();
      else history.back();
    } else if (e.key === 'ArrowLeft') {
      goToPage(currentPage - 1);
    } else if (e.key === 'ArrowRight') {
      goToPage(currentPage + 1);
    }
  }
  document.addEventListener('keydown', onKeydown);
  readerEl._onKeydown = onKeydown;

  // Scroll tracking — save bookmark with page-based progress
  const onScroll = debounce(() => {
    if (!readerEl || !currentDocId) return;
    const pct = pages.length > 1
      ? (currentPage / (pages.length - 1)) * 100
      : (() => { const sh = scrollArea.scrollHeight - scrollArea.clientHeight; return sh > 0 ? Math.min(100, (scrollArea.scrollTop / sh) * 100) : 0; })();
    saveBookmark(currentDocId, pct, doc.title, doc.series_name);
    updateProgress();
  }, 400);
  scrollArea.addEventListener('scroll', onScroll, { passive: true });
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
  const backdrop = readerEl.querySelector('#readerSettingsBackdrop');
  panel.classList.toggle('visible', settingsVisible);
  if (backdrop) backdrop.classList.toggle('visible', settingsVisible);
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
function updateNavButtons(prevId, nextId) {
  if (!readerEl) return;
  const prevBtn = readerEl.querySelector('#readerPrev');
  const nextBtn = readerEl.querySelector('#readerNext');
  if (prevBtn && prevId) prevBtn.disabled = false;
  if (nextBtn && nextId) nextBtn.disabled = false;
}

/* ===== Text to HTML (kept for highlight fallback) ===== */
function textToHtml(text) {
  if (!text) return '<p></p>';
  return text
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
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
      } catch { /* cross-node boundary, skip */ }
      return;
    }
  }
}
