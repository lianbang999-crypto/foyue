/* ===== 法音文库 独立页面入口 ===== */
import '../css/wenku-page.css';
import { getWenkuSeries, getWenkuDocuments, getWenkuDocument, searchWenku, recordWenkuRead } from './wenku-api.js';
import { initTheme } from './theme.js';

/* --- 常量 --- */
const BM_KEY = 'wenku-bookmarks';
const BM_MAX = 100;
const BOOKMARK_DONE_THRESHOLD = 99.5;
const SCROLL_KEY = 'wenku-reader-scroll';
const SETTINGS_KEY = 'wenku-reader-settings';
const RECENT_MAX = 5;
const AI_RETURN_KEY = 'ai-return-context';
const WENKU_AI_ORIGIN_KEY = 'wenku-origin-ai';
const SERIES_COLORS = [
    '#C4704F', '#A8674D', '#8A6B55', '#A17A5C', '#7D675A',
    '#B77C61', '#8F715F', '#C78B74', '#9A7B67', '#AE6E57',
];
const THEME_COLORS = {
    light: '#F7F5F0',
    dark: '#1A1614',
};

function syncWenkuThemeColor() {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
}

/* --- DOM 引用 --- */
const wkContent = document.getElementById('wkContent');
const wkReader = document.getElementById('wkReader');
const wkHeaderActions = document.querySelector('.wk-header-actions');

/* --- 路由状态 --- */
let currentView = 'home'; // 'home' | 'reader'
let activeViewRequestId = 0;
let _readerState = null;
let _readerScrollHandler = null;
let _bookSheetEl = null;
let _bottombarDragging = false;

function beginViewRequest(view) {
    currentView = view;
    activeViewRequestId += 1;
    return activeViewRequestId;
}

function isActiveViewRequest(requestId, view) {
    return activeViewRequestId === requestId && currentView === view;
}

/* --- 初始化 --- */
init();

function init() {
    initTheme();
    syncWenkuThemeColor();
    wireContentClicks();
    const params = new URLSearchParams(location.search);
    syncAiOriginState(params);
    renderHeaderActions();
    const docId = params.get('doc');
    const series = params.get('series');
    const query = params.get('q');

    if (docId) {
        openReader(docId, query);
    } else if (series) {
        renderHome(true);
        openBookSheet(series);
    } else {
        renderHome();
    }

    window.addEventListener('popstate', onPopState);
}



function onPopState(e) {
    syncAiOriginState(new URLSearchParams(location.search));
    renderHeaderActions();
    const s = e.state;
    if (!s?.doc && wkReader.style.display !== 'none') {
        closeReader();
    }
    if (s?.doc) {
        openReader(s.doc, s.q, true);
    } else if (s?.series) {
        renderHome(true);
        openBookSheet(s.series);
    } else {
        renderHome(true);
    }
}

function getAiReturnContext() {
    try {
        return JSON.parse(sessionStorage.getItem(AI_RETURN_KEY) || 'null');
    } catch {
        return null;
    }
}

function hasAiOrigin(params = new URLSearchParams(location.search)) {
    try {
        return params.get('from') === 'ai' || sessionStorage.getItem(WENKU_AI_ORIGIN_KEY) === 'ai';
    } catch {
        return params.get('from') === 'ai';
    }
}

function syncAiOriginState(params = new URLSearchParams(location.search)) {
    const fromAi = params.get('from') === 'ai';
    try {
        if (fromAi) {
            sessionStorage.setItem(WENKU_AI_ORIGIN_KEY, 'ai');
            return true;
        }
        if (!getAiReturnContext()) {
            sessionStorage.removeItem(WENKU_AI_ORIGIN_KEY);
        }
        return sessionStorage.getItem(WENKU_AI_ORIGIN_KEY) === 'ai';
    } catch {
        return fromAi;
    }
}

function clearAiReturnState() {
    try {
        sessionStorage.removeItem(WENKU_AI_ORIGIN_KEY);
        sessionStorage.removeItem(AI_RETURN_KEY);
    } catch { /* 忽略 */ }
}

function getAiReturnHref() {
    const context = getAiReturnContext();
    return typeof context?.href === 'string' && context.href ? context.href : '/ai';
}

function handleAiReturnClick(event) {
    event.preventDefault();
    const href = event.currentTarget.getAttribute('href') || getAiReturnHref();
    clearAiReturnState();
    window.location.href = href;
}

function renderHeaderActions() {
    if (!wkHeaderActions) return;
    if (!hasAiOrigin()) {
        wkHeaderActions.innerHTML = '';
        return;
    }
    wkHeaderActions.innerHTML = `<a href="${esc(getAiReturnHref())}" class="wk-header-link wk-header-link--ai" id="wkReturnAiLink">返回AI</a>`;
    wkHeaderActions.querySelector('#wkReturnAiLink')?.addEventListener('click', handleAiReturnClick);
}

/* ================================================================
   书签系统（localStorage）
   ================================================================ */
function getBookmarks() {
    try { return JSON.parse(localStorage.getItem(BM_KEY) || '{}'); } catch { return {}; }
}

function normalizeBookmarkPercent(percent) {
    const value = Number(percent);
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.max(0, Math.min(100, value));
    return clamped >= BOOKMARK_DONE_THRESHOLD ? 100 : clamped;
}

function hasStartedReading(percent) {
    return normalizeBookmarkPercent(percent) > 0;
}

function hasCompletedReading(percent) {
    return normalizeBookmarkPercent(percent) >= 100;
}

function isReadingInProgress(percent) {
    const normalized = normalizeBookmarkPercent(percent);
    return normalized > 0 && normalized < 100;
}

function getDisplayPercent(percent) {
    return Math.max(0, Math.round(normalizeBookmarkPercent(percent)));
}

function saveBookmark(docId, percent, title, seriesName) {
    const bm = getBookmarks();
    const normalized = normalizeBookmarkPercent(percent);
    if (!hasStartedReading(normalized)) {
        delete bm[docId];
    } else {
        bm[docId] = { percent: normalized, title, seriesName, ts: Date.now() };
    }
    const keys = Object.keys(bm);
    if (keys.length > BM_MAX) {
        keys.sort((a, b) => (bm[a].ts || 0) - (bm[b].ts || 0));
        keys.slice(0, keys.length - BM_MAX).forEach(k => delete bm[k]);
    }
    try { localStorage.setItem(BM_KEY, JSON.stringify(bm)); } catch { /* quota */ }
}

function getRecentBookmarks(max = RECENT_MAX) {
    const bm = getBookmarks();
    return Object.entries(bm)
        .filter(([, v]) => isReadingInProgress(v.percent))
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, max);
}

function getSeriesColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return SERIES_COLORS[Math.abs(hash) % SERIES_COLORS.length];
}

function getSeriesReadCount(seriesName) {
    const bm = getBookmarks();
    let count = 0;
    for (const v of Object.values(bm)) {
        if (v.seriesName === seriesName && hasStartedReading(v.percent)) count++;
    }
    return count;
}

function getSeriesLatestTs(seriesName) {
    const bm = getBookmarks();
    let latest = 0;
    for (const v of Object.values(bm)) {
        if (v.seriesName === seriesName && hasStartedReading(v.percent) && v.ts > latest) latest = v.ts;
    }
    return latest;
}

function getSeriesResumeState(seriesName, documents) {
    const bookmarks = getBookmarks();
    const inProgress = [];
    const touched = [];

    for (const doc of documents) {
        const bookmark = bookmarks[doc.id];
        if (!bookmark || bookmark.seriesName !== seriesName) continue;
        if (!hasStartedReading(bookmark.percent)) continue;
        touched.push({ docId: doc.id, bookmark });
        if (isReadingInProgress(bookmark.percent)) {
            inProgress.push({ docId: doc.id, bookmark });
        }
    }

    inProgress.sort((a, b) => (b.bookmark.ts || 0) - (a.bookmark.ts || 0));
    touched.sort((a, b) => (b.bookmark.ts || 0) - (a.bookmark.ts || 0));

    if (inProgress[0]) {
        return { docId: inProgress[0].docId, mode: 'continue', bookmark: inProgress[0].bookmark };
    }
    if (touched[0]) {
        return { docId: documents[0]?.id || touched[0].docId, mode: 'restart', bookmark: touched[0].bookmark };
    }
    return { docId: documents[0]?.id || '', mode: 'start', bookmark: null };
}

function ensureBookSheet() {
    if (_bookSheetEl) return _bookSheetEl;
    const el = document.createElement('div');
    el.className = 'wk-book-sheet';
    el.innerHTML = `
            <div class="wk-book-sheet-backdrop" data-action="book-sheet-close"></div>
            <div class="wk-book-sheet-panel" role="dialog" aria-modal="true" aria-label="书本目录">
                <div class="wk-book-sheet-body"></div>
            </div>`;
    el.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        const action = actionEl?.dataset.action;
        if (action === 'book-sheet-close') {
            closeBookSheet();
        } else if (action === 'book-sheet-read') {
            const docId = actionEl.dataset.doc;
            closeBookSheet();
            if (docId) openReader(docId);
        }
    });
    // 下滑关闭手势
    const panel = el.querySelector('.wk-book-sheet-panel');
    let _swipeStartY = 0, _swipeDeltaY = 0, _swiping = false;
    panel.addEventListener('touchstart', (e) => {
        _swipeStartY = e.touches[0].clientY;
        _swipeDeltaY = 0;
        _swiping = true;
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
        if (!_swiping) return;
        const y = e.touches[0].clientY;
        // 内容未滚到顶部时，持续更新起始点，等滚到顶部再下拉才触发关闭手势
        if (panel.scrollTop > 0) {
            _swipeStartY = y;
            _swipeDeltaY = 0;
            return;
        }
        _swipeDeltaY = y - _swipeStartY;
        if (_swipeDeltaY > 0) {
            panel.style.transform = `translateY(${_swipeDeltaY}px)`;
            panel.style.transition = 'none';
        } else {
            _swipeDeltaY = 0;
        }
    }, { passive: true });
    panel.addEventListener('touchend', () => {
        if (!_swiping) return;
        _swiping = false;
        panel.style.transition = '';
        if (_swipeDeltaY > 120) {
            closeBookSheet();
        }
        panel.style.transform = '';
    });
    document.body.appendChild(el);
    _bookSheetEl = el;
    return el;
}

function closeBookSheet() {
    if (!_bookSheetEl) return;
    _bookSheetEl.classList.remove('open');
    delete _bookSheetEl.dataset.seriesSummaryToken;
    document.body.classList.remove('wk-book-sheet-open');
}

async function openBookSheet(seriesName) {
    const sheet = ensureBookSheet();
    const body = sheet.querySelector('.wk-book-sheet-body');
    const color = getSeriesColor(seriesName);
    const summaryToken = `${seriesName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    sheet.dataset.seriesSummaryToken = summaryToken;

    body.innerHTML = `
            <div class="wk-book-sheet-loading">
                <div class="wk-series-header">
                    <div class="wk-series-header-avatar" style="background:${color}">${esc(seriesName.charAt(0))}</div>
                    <div class="wk-series-header-info">
                        <div class="wk-series-header-name">${esc(seriesName)}</div>
                        <div class="wk-series-header-stats">正在整理这本书的摘要与目录…</div>
                    </div>
                </div>
            </div>`;
    sheet.classList.add('open');
    document.body.classList.add('wk-book-sheet-open');

    let data;
    try { data = await getWenkuDocuments(seriesName); } catch { data = null; }

    const documents = Array.isArray(data?.documents) ? data.documents : [];
    if (!documents.length) {
        body.innerHTML = `<div class="wk-empty" style="padding:56px 20px">${buildEmptyStateMarkup('目录暂时无法打开', '这本书的讲次还没有顺利载入，可稍后再试。')}</div>`;
        return;
    }

    const bookmarks = getBookmarks();
    const resumeState = getSeriesResumeState(seriesName, documents);
    const resumeDocId = resumeState.docId;
    const resumeBookmark = resumeState.bookmark;
    const readCount = documents.filter(doc => {
        const bookmark = bookmarks[doc.id];
        return bookmark && hasStartedReading(bookmark.percent);
    }).length;
    const ctaText = resumeState.mode === 'continue' ? '继续阅读' : resumeState.mode === 'restart' ? '重新开始' : '开始阅读';
    const ctaMeta = resumeState.mode === 'continue'
        ? `上次读到 ${getDisplayPercent(resumeBookmark?.percent || 0)}%`
        : resumeState.mode === 'restart'
            ? `已读过，从第 1 讲开始`
            : `共 ${documents.length} 讲`;

    let html = `
            <div class="wk-book-sheet-head">
                <button class="wk-book-sheet-close" type="button" data-action="book-sheet-close" aria-label="关闭目录">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="wk-book-sheet-cover" style="--series-color:${color}">
                <div class="wk-book-sheet-mark">${esc(seriesName.charAt(0))}</div>
                <div class="wk-book-sheet-title">${esc(seriesName)}</div>
                <div class="wk-book-sheet-meta">共 ${documents.length} 讲${readCount > 0 ? ` · 已读 ${readCount}/${documents.length}` : ''}</div>
                <button class="wk-book-sheet-primary" type="button" data-action="book-sheet-read" data-doc="${esc(resumeDocId)}">
                    <span>${ctaText}</span>
                    <span class="wk-book-sheet-primary-meta">${esc(ctaMeta)}</span>
                </button>
            </div>
            <div class="wk-book-sheet-section">本书目录</div>
            <div class="wk-doc-list wk-book-sheet-list">`;

    documents.forEach((doc, idx) => {
        const bookmark = bookmarks[doc.id];
        const pct = bookmark ? getDisplayPercent(bookmark.percent || 0) : 0;
        let badge = '';
        if (doc.id === resumeDocId && resumeState.mode === 'continue') badge = '<span class="wk-doc-badge">继续读</span>';
        else if (doc.id === resumeDocId && resumeState.mode === 'restart') badge = '<span class="wk-doc-badge">重读</span>';
        else if (doc.id === resumeDocId) badge = '<span class="wk-doc-badge">首讲</span>';
        else if (hasCompletedReading(pct)) badge = '<span class="wk-doc-badge">已读</span>';
        else if (pct > 0) badge = `<span class="wk-doc-badge">${pct}%</span>`;
        html += `
                    <button class="wk-doc-item ${hasCompletedReading(pct) ? 'wk-doc-done' : pct > 0 ? 'wk-doc-reading' : ''}" type="button" data-action="book-sheet-read" data-doc="${esc(doc.id)}" aria-label="打开第 ${idx + 1} 讲 ${esc(doc.title)}">
                        <div class="wk-doc-num-circle" style="${doc.id === resumeDocId ? `background:${color};color:#fff` : ''}">${idx + 1}</div>
                        <div class="wk-doc-info">
                            <div class="wk-doc-title">${esc(doc.title)}</div>
                        </div>
                        ${badge}
                    </button>`;
    });

    html += '</div>';
    body.innerHTML = html;

    // 自动滚动到当前阅读位置
    if (resumeDocId) {
        const resumeEl = body.querySelector(`[data-doc="${CSS.escape(resumeDocId)}"]`);
        if (resumeEl) {
            requestAnimationFrame(() => {
                resumeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
        }
    }
}

/* 阅读进度 */
function saveScrollProgress(docId, percent) {
    try {
        const data = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
        data[docId] = { percent, ts: Date.now() };
        const keys = Object.keys(data);
        if (keys.length > 200) {
            keys.sort((a, b) => (data[a].ts || 0) - (data[b].ts || 0));
            keys.slice(0, keys.length - 200).forEach(k => delete data[k]);
        }
        localStorage.setItem(SCROLL_KEY, JSON.stringify(data));
    } catch { /* quota */ }
}

function getScrollProgress(docId) {
    try { const d = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}'); return d[docId]?.percent || 0; } catch { return 0; }
}

/* 阅读器设置 */
function loadSettings() {
    try {
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (!raw || typeof raw !== 'object') return defaultSettings();
        return {
            mode: ['light', 'sepia', 'dark', 'eink'].includes(raw.mode) ? raw.mode : defaultSettings().mode,
            fontSize: Number.isFinite(raw.fontSize) ? raw.fontSize : 17,
            fontFamily: ['sans', 'serif', 'kai'].includes(raw.fontFamily) ? raw.fontFamily : 'sans',
        };
    } catch { return defaultSettings(); }
}

function defaultSettings() {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return { mode: dark ? 'dark' : 'light', fontSize: 17, fontFamily: 'sans' };
}

function persistSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { }
}

/* ================================================================
   首页
   ================================================================ */
async function renderHome(skipPush) {
    const requestId = beginViewRequest('home');
    if (!skipPush) history.pushState({}, '', '/wenku');
    closeBookSheet();
    wkContent.innerHTML = skeleton(4);

    let data;
    try { data = await getWenkuSeries(); } catch { data = null; }

    if (!isActiveViewRequest(requestId, 'home')) return;

    if (!data?.series?.length) {
        wkContent.innerHTML = emptyState(data === null, () => renderHome());
        return;
    }

    let html = '';
    const recents = getRecentBookmarks(3);
    const sorted = [...data.series].sort((a, b) => {
        const tsA = getSeriesLatestTs(a.series_name);
        const tsB = getSeriesLatestTs(b.series_name);
        if (tsA && !tsB) return -1;
        if (!tsA && tsB) return 1;
        return (tsB || 0) - (tsA || 0);
    });

    html += `
      <div class="wk-home-search">
        <svg class="wk-home-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="wk-home-search-input" id="wkHomeSearch" type="search" placeholder="搜索讲记内容..." enterkeyhint="search" autocomplete="off">
      </div>
      <div class="wk-search-results" id="wkSearchResults" style="display:none"></div>`;

    if (recents.length > 0) {
        html += `<div class="wk-section-label">继续阅读</div>`;
        recents.forEach(recent => {
            const recentPercent = getDisplayPercent(recent.percent || 0);
            html += `
            <div class="wk-continue wk-home-continue" data-action="read" data-doc="${esc(recent.id)}">
                <div class="wk-continue-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 19.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 7h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </div>
                <div class="wk-continue-body">
                    <div class="wk-continue-title">${esc(recent.title || recent.id)}</div>
                    <div class="wk-continue-sub">${recent.seriesName ? `${esc(recent.seriesName)} · ` : ''}${recentPercent > 0 ? `上次读到 ${recentPercent}%` : '刚开始阅读'}</div>
                    <div class="wk-continue-progress"><div class="wk-continue-progress-fill" style="width:${recentPercent}%"></div></div>
                </div>
                <div class="wk-home-continue-side">${recentPercent}%</div>
            </div>`;
        });
    }

    html += `<div class="wk-section-label" id="wkSeriesSection">大安法师讲记 · ${data.series.length} 部</div>`;
    html += '<div class="wk-series-grid">';
    sorted.forEach(s => {
        const readCount = getSeriesReadCount(s.series_name);
        const color = getSeriesColor(s.series_name);
        const firstChar = s.series_name.charAt(0);
        const progress = readCount > 0 ? Math.round((readCount / s.count) * 100) : 0;
        html += `
            <div class="wk-series-card" data-action="book" data-series="${esc(s.series_name)}" style="--series-color:${color}">
                <div class="wk-series-avatar">${esc(firstChar)}</div>
        <div class="wk-series-card-body">
          <div class="wk-series-name">${esc(s.series_name)}</div>
          <div class="wk-series-meta">${s.count} 讲${readCount > 0 ? ' · 已读 ' + readCount : ''}</div>
                    ${progress > 0 ? `<div class="wk-series-progress"><div class="wk-series-progress-fill" style="width:${progress}%;background:${color}"></div></div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';

    wkContent.innerHTML = html;
    wireHomeSearch();
}

/* --- 首页搜索 --- */
let _searchTimer = null;
let _searchAbort = null;
function wireHomeSearch() {
    const input = document.getElementById('wkHomeSearch');
    const results = document.getElementById('wkSearchResults');
    if (!input || !results) return;

    input.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        if (_searchAbort) { _searchAbort.abort(); _searchAbort = null; }
        const q = input.value.trim();
        if (!q) {
            results.style.display = 'none';
            results.innerHTML = '';
            return;
        }
        _searchTimer = setTimeout(() => doHomeSearch(q, results), 400);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(_searchTimer);
            const q = input.value.trim();
            if (q) doHomeSearch(q, results);
        }
    });
}

async function doHomeSearch(query, container) {
    container.style.display = 'block';
    container.innerHTML = '<div class="wk-empty" style="padding:16px 0">搜索中...</div>';

    // 取消上一次未完成的请求
    if (_searchAbort) _searchAbort.abort();
    const ctrl = new AbortController();
    _searchAbort = ctrl;

    let data;
    try {
        data = await searchWenku(query, ctrl.signal);
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = `<div class="wk-empty" style="padding:16px 0">${e.name === 'TimeoutError' ? '搜索超时，请稍后再试' : '搜索失败，请稍后再试'}</div>`;
        return;
    }

    // 如果已被新搜索取代，丢弃过期结果
    if (ctrl.signal.aborted) return;

    const results = Array.isArray(data?.documents) ? data.documents : Array.isArray(data?.results) ? data.results : [];
    if (!results.length) {
        container.innerHTML = '<div class="wk-empty" style="padding:16px 0">未找到相关内容，试试换个关键词</div>';
        return;
    }
    let html = '';
    results.forEach(r => {
        const snippet = (r.snippet || '').slice(0, 80);
        html += `
            <button class="wk-search-item" type="button" data-action="read" data-doc="${esc(r.id)}" data-query="${esc(query)}" aria-label="打开 ${esc(r.title)} 正文">
        <div class="wk-search-item-title">${esc(r.title)}</div>
                <div class="wk-search-item-series">${esc(r.series_name || '')}${r.episode_num ? ` · 第 ${esc(r.episode_num)} 讲` : ''}</div>
        ${snippet ? `<div class="wk-search-item-snippet">${esc(snippet)}</div>` : ''}
                <div class="wk-search-item-action">打开正文</div>
            </button>`;
    });
    container.innerHTML = html;
}

/* 内容区域点击事件委托 */
function wireContentClicks() {
    if (wkContent.dataset.bound === 'true') return;
    wkContent.dataset.bound = 'true';
    wkContent.addEventListener('click', handleContentClick);
}

function handleContentClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'book') openBookSheet(el.dataset.series);
    else if (action === 'read') openReader(el.dataset.doc, el.dataset.query);
}

/* ================================================================
    阅读器
    ================================================================ */

function getCurrentReaderProgress() {
    const scroll = wkReader.querySelector('#readerScroll');
    if (!scroll) return 0;
    const sh = scroll.scrollHeight - scroll.clientHeight;
    return sh > 0 ? Math.min(100, (scroll.scrollTop / sh) * 100) : 0;
}

function snapshotReaderProgress() {
    if (!_readerState) return;
    const pct = getCurrentReaderProgress();
    saveScrollProgress(_readerState.docId, pct);
    saveBookmark(_readerState.docId, pct, _readerState.title, _readerState.series);
}

function getReaderOriginType(fromAi, highlightQuery) {
    if (fromAi) return 'ai';
    if (highlightQuery) return 'search';
    return 'catalog';
}

function getReaderOriginLabel(originType) {
    if (originType === 'ai') return '来自 AI';
    if (originType === 'search') return '来自搜索';
    return '来自目录';
}

function getReaderCloseLabel(originType) {
    if (originType === 'search') return '返回搜索结果';
    return '返回目录';
}

function updateReaderLocation() {
    const el = document.getElementById('readerLocation');
    if (!el || !_readerState) return;

    const parts = [];
    if (_readerState.episodeNum) {
        const total = _readerState.totalEpisodes || '?';
        parts.push(`第 ${_readerState.episodeNum}/${total} 讲`);
        if (_readerState.totalEpisodes) {
            const progress = Math.max(1, Math.round((_readerState.episodeNum / _readerState.totalEpisodes) * 100));
            parts.push(`全书进度 ${progress}%`);
        }
    }
    parts.push(getReaderOriginLabel(_readerState.originType));
    el.textContent = parts.join(' · ');
}

async function restoreSearchContext(query) {
    history.replaceState({ q: query }, '', `/wenku?q=${encodeURIComponent(query)}`);
    await renderHome(true);
    renderHeaderActions();

    const input = document.getElementById('wkHomeSearch');
    const results = document.getElementById('wkSearchResults');
    if (input) input.value = query;
    if (results) await doHomeSearch(query, results);
}

async function openReader(docId, highlightQuery, skipPush) {
    const wasReaderOpen = wkReader.style.display !== 'none' && !!_readerState;
    const fromAi = hasAiOrigin();
    const originType = getReaderOriginType(fromAi, highlightQuery);
    const closeLabel = getReaderCloseLabel(originType);
    snapshotReaderProgress();

    const requestId = beginViewRequest('reader');
    if (!skipPush) {
        const readerUrl = `/wenku?doc=${encodeURIComponent(docId)}${highlightQuery ? '&q=' + encodeURIComponent(highlightQuery) : ''}${fromAi ? '&from=ai' : ''}`;
        const readerState = { doc: docId, q: highlightQuery, fromAi };
        if (wasReaderOpen) history.replaceState(readerState, '', readerUrl);
        else history.pushState(readerState, '', readerUrl);
    }

    const settings = loadSettings();

    wkReader.style.display = 'flex';
    wkReader.setAttribute('data-mode', settings.mode);
    document.body.style.overflow = 'hidden';

    wkReader.innerHTML = `
    <div class="wk-reader-progress" id="readerProgress"></div>
        <div class="wk-reader-settings-backdrop" id="readerSettingsBackdrop"></div>
    <div class="wk-reader-topbar">
            <button class="wk-reader-btn" id="readerClose" aria-label="${esc(closeLabel)}" title="${esc(closeLabel)}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
            <div class="wk-reader-topbar-center">
                <span class="wk-reader-topbar-title" id="readerTopTitle"></span>
            </div>
        ${fromAi ? `<a class="wk-reader-return" id="readerReturnAi" href="${esc(getAiReturnHref())}">回到 AI</a>` : ''}
    </div>
    <div class="wk-reader-scroll" id="readerScroll">
            <div class="wk-empty wk-empty--reader" style="padding-top:30vh">${buildEmptyStateMarkup('正在加载讲记…', '稍候片刻，法义原文即将展开。')}</div>
    </div>
    <div class="wk-reader-bottombar" id="readerBottombar">
        <div class="wk-reader-bottombar-context">
            <span class="wk-reader-location" id="readerLocation">当前位置</span>
        </div>
        <div class="wk-reader-bottombar-controls">
            <span class="wk-reader-bottombar-pct" id="bottombarPct">0%</span>
            <input class="wk-reader-bottombar-slider" id="bottombarSlider" type="range" min="0" max="100" step="1" value="0" aria-label="阅读进度">
            <button class="wk-reader-bottombar-btn" id="bottombarSettingsBtn" aria-label="打开阅读设置" aria-controls="readerSettings" aria-expanded="false">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-4.22-5.78 1.42-1.42M4.22 19.78l1.42-1.42M19.78 19.78l-1.42-1.42M4.22 4.22l1.42 1.42"/></svg>
            </button>
        </div>
    </div>
    <div class="wk-reader-settings" id="readerSettings" role="dialog" aria-modal="true" aria-label="阅读设置">
            <div class="wk-reader-settings-handle"></div>
      <div class="wk-settings-title">字号</div>
      <div class="wk-fontsize-row">
        <span class="wk-fontsize-label wk-fontsize-sm">A</span>
        <input class="wk-fontsize-slider" id="readerFontSlider" type="range" min="14" max="28" step="1" value="${settings.fontSize}">
        <span class="wk-fontsize-label wk-fontsize-lg">A</span>
      </div>
      <div class="wk-settings-title">背景</div>
      <div class="wk-modes-row">
                <button type="button" class="wk-mode-dot ${settings.mode === 'light' ? 'active' : ''}" data-mode="light" aria-pressed="${settings.mode === 'light' ? 'true' : 'false'}">白</button>
                <button type="button" class="wk-mode-dot ${settings.mode === 'sepia' ? 'active' : ''}" data-mode="sepia" aria-pressed="${settings.mode === 'sepia' ? 'true' : 'false'}">护眼</button>
                <button type="button" class="wk-mode-dot ${settings.mode === 'dark' ? 'active' : ''}" data-mode="dark" aria-pressed="${settings.mode === 'dark' ? 'true' : 'false'}">暗黑</button>
                <button type="button" class="wk-mode-dot ${settings.mode === 'eink' ? 'active' : ''}" data-mode="eink" aria-pressed="${settings.mode === 'eink' ? 'true' : 'false'}">墨水</button>
      </div>
      <div class="wk-settings-title">字体</div>
      <div class="wk-fonts-row">
                <button class="wk-font-btn wk-font-sans ${settings.fontFamily === 'sans' ? 'active' : ''}" data-font="sans">黑体</button>
                <button class="wk-font-btn wk-font-serif ${settings.fontFamily === 'serif' ? 'active' : ''}" data-font="serif">宋体</button>
                <button class="wk-font-btn wk-font-kai ${settings.fontFamily === 'kai' ? 'active' : ''}" data-font="kai">楷体</button>
      </div>
    </div>`;

    // Fetch data
    let data;
    try { data = await getWenkuDocument(docId); } catch { data = null; }

    if (!isActiveViewRequest(requestId, 'reader')) return;

    if (!data?.document) {
        const scroll = wkReader.querySelector('#readerScroll');
        scroll.innerHTML = `<div class="wk-empty wk-empty--reader" style="padding-top:22vh">${buildEmptyStateMarkup('加载失败', '当前讲记未能成功打开，可稍后重试。')}<button class="wk-retry-btn" id="readerRetry">重试</button></div>`;
        scroll.querySelector('#readerRetry')?.addEventListener('click', () => openReader(docId, highlightQuery, true));
        wireReaderClose();
        return;
    }

    const doc = data.document;

    // Record read
    recordWenkuRead(docId);

    // Render content
    const scroll = wkReader.querySelector('#readerScroll');
    const { html: bodyHtml, contributor } = textToHtml(doc.content || '', doc.title);
    const chapterNavHtml = `
        <div class="wk-reader-chapter-nav">
            ${data.prevId ? `<button class="wk-chapter-nav-btn wk-chapter-nav-btn--ghost" data-prev="${esc(data.prevId)}">上一讲</button>` : '<span class="wk-chapter-nav-spacer"></span>'}
            <div class="wk-reader-chapter-meta">${doc.episode_num ? `第 ${esc(doc.episode_num)} 讲` : '当前讲'}</div>
            ${data.nextId ? `<button class="wk-chapter-nav-btn" data-next="${esc(data.nextId)}">下一讲</button>` : '<span class="wk-chapter-nav-spacer"></span>'}
        </div>`;
    let nextHtml = '';
    if (!data.nextId) {
        nextHtml = `
        <div class="wk-next-card wk-next-card--done">
            <div class="wk-next-done-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <p>这一讲已经读完</p>
            <div class="wk-next-done-copy">已到本系列最后一讲，愿解如来真实义。</div>
            <button class="wk-next-btn" data-open-book="${esc(doc.series_name || '')}">查看目录</button>
        </div>`;
    }

    const contributorHtml = contributor ? `<span class="wk-reader-contributor">整理：${esc(contributor)}</span>` : '';
    scroll.innerHTML = `
    <div class="wk-reader-title">${esc(doc.title)}</div>
    <div class="wk-reader-meta">${esc(doc.series_name || '大安法师')}${doc.episode_num ? ` · 第 ${esc(doc.episode_num)} 讲` : ''}${contributorHtml}</div>
    <div class="wk-reader-body" id="readerBody" data-font="${settings.fontFamily}" style="font-size:${settings.fontSize}px">${bodyHtml}</div>
    ${chapterNavHtml}
    ${nextHtml}`;

    // Top title
    wkReader.querySelector('#readerTopTitle').textContent = doc.title || doc.series_name || '';

    // Save state for bookmark on close
    _readerState = {
        docId,
        title: doc.title,
        series: doc.series_name || '',
        episodeNum: doc.episode_num || null,
        totalEpisodes: data.totalEpisodes || 0,
        query: highlightQuery || '',
        originType,
    };

    updateReaderLocation();

    // Highlight search
    if (highlightQuery) highlightText(highlightQuery);

    // 恢复滚动位置
    if (!highlightQuery) {
        const pct = getScrollProgress(docId);
        if (pct > 0) {
            requestAnimationFrame(() => {
                const sh = scroll.scrollHeight - scroll.clientHeight;
                if (sh > 0) scroll.scrollTo(0, (pct / 100) * sh);
            });
        }
    }
    wireReaderScroll(scroll, docId);

    // Wire events
    wireReaderClose();
    wireReaderSettings(settings);
    wireReaderNext(scroll);
    wireBottombar();
    wireScrollCenterTap(scroll);
    wkReader.querySelector('#readerReturnAi')?.addEventListener('click', handleAiReturnClick);

    // Preload next
    if (data.nextId) getWenkuDocument(data.nextId);
}

/* 工具栏显隐 */
function toggleReaderBars() {
    wkReader.classList.toggle('bars-hidden');
}

/* 底部栏进度同步 */
function updateBottombar(pct) {
    if (_bottombarDragging) return;
    const slider = document.getElementById('bottombarSlider');
    const pctEl = document.getElementById('bottombarPct');
    if (slider) slider.value = Math.round(pct);
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
}

/* 滚动模式中央点击切换工具栏 */
function wireScrollCenterTap(scroll) {
    scroll.addEventListener('click', (e) => {
        if (e.target.closest('button, a, .wk-next-btn, .wk-reader-settings, .wk-reader-bottombar')) return;
        if (window.getSelection()?.toString()) return;
        const w = scroll.clientWidth;
        const rect = scroll.getBoundingClientRect();
        const tapX = e.clientX - rect.left;
        // 中间 50% 区域切换工具栏
        if (tapX > w * 0.25 && tapX < w * 0.75) {
            toggleReaderBars();
        }
    });
}

/* 底部工具栏事件绑定 */
function wireBottombar() {
    const slider = document.getElementById('bottombarSlider');

    if (slider) {
        slider.addEventListener('input', () => {
            _bottombarDragging = true;
            const pct = parseInt(slider.value, 10);
            const pctEl = document.getElementById('bottombarPct');
            if (pctEl) pctEl.textContent = pct + '%';

            // 滚动到对应位置
            const scroll = wkReader.querySelector('#readerScroll');
            if (scroll) {
                const sh = scroll.scrollHeight - scroll.clientHeight;
                if (sh > 0) scroll.scrollTo({ top: (pct / 100) * sh });
            }
        });
        slider.addEventListener('change', () => {
            _bottombarDragging = false;
        });
    }
}

function closeReader() {
    snapshotReaderProgress();
    cleanupReaderScroll();
    wkReader.style.display = 'none';
    wkReader.classList.remove('bars-hidden');
    wkReader.innerHTML = '';
    document.body.style.overflow = '';
    _readerState = null;
}

async function closeReaderToContext() {
    const state = _readerState ? { ..._readerState } : null;
    const fromAi = hasAiOrigin();
    closeReader();

    if (state?.originType === 'search' && state.query && !fromAi) {
        await restoreSearchContext(state.query);
        return;
    }

    if (state?.series) {
        const url = `/wenku?series=${encodeURIComponent(state.series)}${fromAi ? '&from=ai' : ''}`;
        history.replaceState({ series: state.series }, '', url);
        await renderHome(true);
        openBookSheet(state.series);
        renderHeaderActions();
        return;
    }

    history.replaceState({}, '', `/wenku${fromAi ? '?from=ai' : ''}`);
    await renderHome(true);
    renderHeaderActions();
}

function wireReaderClose() {
    wkReader.querySelector('#readerClose')?.addEventListener('click', () => {
        void closeReaderToContext();
    });
}

function wireReaderScroll(scroll, docId) {
    cleanupReaderScroll();
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const sh = scroll.scrollHeight - scroll.clientHeight;
            const pct = sh > 0 ? Math.min(100, (scroll.scrollTop / sh) * 100) : 0;
            const bar = wkReader.querySelector('#readerProgress');
            if (bar) bar.style.width = pct + '%';
            updateBottombar(pct);
            ticking = false;
        });
    };
    _readerScrollHandler = { scroll, onScroll };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

function cleanupReaderScroll() {
    if (_readerScrollHandler?.scroll && _readerScrollHandler?.onScroll) {
        _readerScrollHandler.scroll.removeEventListener('scroll', _readerScrollHandler.onScroll);
    }
    _readerScrollHandler = null;
}

function wireReaderSettings(settings) {
    const panel = wkReader.querySelector('#readerSettings');
    const btn = wkReader.querySelector('#bottombarSettingsBtn');
    const backdrop = wkReader.querySelector('#readerSettingsBackdrop');
    if (!panel || !btn) return;

    const syncExpanded = () => {
        btn.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
    };

    btn.addEventListener('click', () => {
        panel.classList.toggle('open');
        backdrop?.classList.toggle('open', panel.classList.contains('open'));
        syncExpanded();
    });

    backdrop?.addEventListener('click', () => {
        panel.classList.remove('open');
        backdrop.classList.remove('open');
        syncExpanded();
    });

    // Font size slider
    const slider = panel.querySelector('#readerFontSlider');
    if (slider) {
        slider.addEventListener('input', () => {
            settings.fontSize = parseInt(slider.value, 10);
            const body = wkReader.querySelector('#readerBody');
            if (body) body.style.fontSize = settings.fontSize + 'px';
            persistSettings(settings);
        });
    }

    // Font family
    panel.querySelectorAll('[data-font]').forEach(b => {
        b.addEventListener('click', () => {
            settings.fontFamily = b.dataset.font;
            const body = wkReader.querySelector('#readerBody');
            if (body) body.setAttribute('data-font', settings.fontFamily);
            panel.querySelectorAll('[data-font]').forEach(bb => bb.classList.toggle('active', bb.dataset.font === settings.fontFamily));
            persistSettings(settings);
        });
    });

    // Mode
    panel.querySelectorAll('.wk-mode-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            settings.mode = dot.dataset.mode;
            wkReader.setAttribute('data-mode', settings.mode);
            panel.querySelectorAll('.wk-mode-dot').forEach(d => {
                const active = d.dataset.mode === settings.mode;
                d.classList.toggle('active', active);
                d.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            persistSettings(settings);
        });
    });
}

function wireReaderNext(scroll) {
    scroll.addEventListener('click', (e) => {
        const btn = e.target.closest('.wk-next-btn');
        if (btn) {
            const nextId = btn.dataset.next;
            if (nextId) openReader(nextId);
            const openBook = btn.dataset.openBook;
            if (openBook) openBookSheet(openBook);
        }
        const prevBtn = e.target.closest('[data-prev]');
        if (prevBtn?.dataset.prev) {
            openReader(prevBtn.dataset.prev);
            return;
        }
    });
}

/* ================================================================
   工具函数
   ================================================================ */
function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function textToHtml(text, title) {
    if (!text) return { html: '<p></p>', contributor: '' };
    // Clean up messy formatting from source files
    let cleaned = text
        .replace(/\r\n/g, '\n')          // normalize line endings
        .replace(/\t/g, ' ')             // tabs → spaces
        .replace(/\u3000/g, ' ')         // fullwidth spaces → normal spaces
        .replace(/ {2,}/g, ' ')          // collapse multiple spaces
        .replace(/^ +| +$/gm, '')        // trim each line
        .replace(/\n{3,}/g, '\n\n');     // collapse 3+ newlines → 2

    // 移除文末残留的孤立数字（页码/脚注标记）
    cleaned = cleaned.replace(/\n\d{1,3}\s*$/, '');

    // 移除与标题重复的首行（content 首行常常是标题的另一种格式）
    if (title) {
        const firstNewline = cleaned.indexOf('\n');
        if (firstNewline > 0) {
            const firstLine = cleaned.slice(0, firstNewline).trim();
            // 去掉书名号和标点后比较核心内容
            const norm = s => s.replace(/[《》〈〉【】\[\]「」『』\s第讲·\-—]/g, '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾]/g, '');
            const normTitle = s => s.replace(/[《》〈〉【】\[\]「」『』\s第讲·\-—]/g, '').replace(/\d+/g, '');
            if (normTitle(firstLine) === normTitle(title)) {
                cleaned = cleaned.slice(firstNewline + 1);
            }
        }
    }

    // Extract contributor from first/last lines
    const contributor = extractContributor(cleaned);

    // 按单个换行分段（源文本多数以 \n 分段，少数用 \n\n）
    const html = cleaned
        .split(/\n/)
        .filter(p => p.trim())
        .map(p => {
            const t = p.trim();
            // 佛号结语居中展示
            if (/^南无.{1,10}佛[！!。]?$/.test(t)) {
                return `<p class="wk-closing-namo">${esc(t)}</p>`;
            }
            return `<p>${esc(t)}</p>`;
        })
        .join('');

    return { html, contributor };
}

function extractContributor(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const candidates = [...lines.slice(0, 5), ...lines.slice(-5)];
    for (const line of candidates) {
        const patterns = [
            /^(.{2,10})(?:整理|校对|记录|記錄|校對|編輯|编辑)$/,
            /^(?:整理|校对|记录|記錄|校對|編輯|编辑)[：:\s]+(.{2,20})$/,
            /(?:整理人|校对人|记录人|編輯)[：:\s]+(.{2,20})$/,
        ];
        for (const pat of patterns) {
            const m = line.match(pat);
            if (m) return m[1].trim();
        }
    }
    return '';
}

function highlightText(query) {
    const body = wkReader.querySelector('#readerBody');
    if (!body || !query) return;

    // 从 sessionStorage 读取 AI 页传来的 snippet（用于精确定位）
    let snippet = '';
    try {
        snippet = sessionStorage.getItem('wenku-ai-snippet') || '';
        sessionStorage.removeItem('wenku-ai-snippet');
    } catch { /* 忽略 */ }

    // 策略1：用 snippet 精确定位并高亮
    if (snippet && snippet.length >= 10) {
        const snippetHit = highlightSnippet(body, snippet);
        if (snippetHit) return; // 成功定位，不需要关键词高亮
    }

    // 策略2：提取中文关键词（2-4字词组）
    const words = extractHighlightKeywords(query);
    if (!words.length) return;

    const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let firstHit = null;
    for (const node of nodes) {
        if (!pattern.test(node.textContent)) continue;
        pattern.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        while ((match = pattern.exec(node.textContent))) {
            if (match.index > lastIndex) frag.appendChild(document.createTextNode(node.textContent.slice(lastIndex, match.index)));
            const mark = document.createElement('span');
            mark.className = 'wk-highlight';
            mark.textContent = match[0];
            if (!firstHit) firstHit = mark;
            frag.appendChild(mark);
            lastIndex = pattern.lastIndex;
        }
        if (lastIndex < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(lastIndex)));
        node.parentNode.replaceChild(frag, node);
    }
    if (firstHit) {
        requestAnimationFrame(() => firstHit.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
}

// 用 snippet 子串在 DOM 中精确定位并高亮
function highlightSnippet(body, snippet) {
    // 取 snippet 中间一段（避免首尾截断问题）作为定位锚点
    const clean = snippet.replace(/\s+/g, '');
    const anchorLen = Math.min(30, clean.length);
    const anchorStart = Math.floor((clean.length - anchorLen) / 2);
    const anchor = clean.slice(anchorStart, anchorStart + anchorLen);
    if (anchor.length < 6) return false;

    // 遍历文本节点拼接全文，找到锚点位置
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let fullText = '';
    while (walker.nextNode()) {
        textNodes.push({ node: walker.currentNode, start: fullText.length });
        fullText += walker.currentNode.textContent;
    }

    const fullClean = fullText.replace(/\s+/g, '');
    const anchorIdx = fullClean.indexOf(anchor);
    if (anchorIdx < 0) return false;

    // 找到锚点所在的 DOM 段落元素
    // 将 cleanIndex 映射回原始 fullText 的位置
    let cleanCount = 0;
    let originalIdx = 0;
    for (let i = 0; i < fullText.length; i++) {
        if (!/\s/.test(fullText[i])) {
            if (cleanCount === anchorIdx) { originalIdx = i; break; }
            cleanCount++;
        }
    }

    // 找到包含该位置的文本节点
    let targetNode = null;
    for (const { node, start } of textNodes) {
        if (start + node.textContent.length > originalIdx) {
            targetNode = node;
            break;
        }
    }

    if (!targetNode) return false;

    // 找到最近的段落级元素并高亮整段
    const paragraph = targetNode.parentElement?.closest('p, blockquote, li, h1, h2, h3, h4, h5, h6, div.paragraph');
    const target = paragraph || targetNode.parentElement;
    if (!target) return false;

    target.classList.add('wk-highlight-block');
    requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return true;
}

// 从中文查询中提取关键词（比按空格拆分更适合中文）
function extractHighlightKeywords(query) {
    if (!query) return [];
    // 先按空格拆分
    let words = query.split(/\s+/).filter(w => w.length >= 2);
    if (words.length > 1) return words;
    // 中文无空格：去掉常见虚词，提取 2-4 字词组
    const cleaned = query
        .replace(/[，。！？、：；""''「」（）\s]/g, ' ')
        .replace(/\b(的|了|在|是|有|和|与|或|不|也|都|就|而|及|把|被|让|给|对|从|到|为|以|又|却|很|更|最|这|那|什么|怎么|如何|哪个|怎样|为什么|请问)\b/g, ' ')
        .trim();
    words = cleaned.split(/\s+/).filter(w => w.length >= 2);
    return words;
}

function skeleton(n) {
    let h = '<div class="wk-skeleton" style="height:46px;border-radius:var(--wk-radius);margin-bottom:24px"></div>';
    h += '<div class="wk-skeleton wk-skeleton-title"></div>';
    h += '<div class="wk-series-grid">';
    for (let i = 0; i < n; i++) h += '<div class="wk-skeleton" style="height:176px;border-radius:22px 22px 18px 18px"></div>';
    h += '</div>';
    return h;
}

function emptyState(isError, retryFn) {
    if (!isError) return `<div class="wk-empty">${buildEmptyStateMarkup('暂无内容', '这里暂时还没有可展示的文稿。')}</div>`;
    const id = 'wkRetry_' + Date.now();
    // 使用事件委托替代 setTimeout，通过 wkContent 捕获按钮点击
    const handler = (e) => {
        if (e.target.id === id) {
            wkContent.removeEventListener('click', handler);
            retryFn();
        }
    };
    wkContent.addEventListener('click', handler);
    return `<div class="wk-empty">${buildEmptyStateMarkup('加载失败', '数据暂时没有顺利抵达，请稍后重试。')}<button class="wk-retry-btn" id="${id}">重试</button></div>`;
}

function buildEmptyStateMarkup(title, description) {
    return `
        <div class="wk-empty-illustration" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 4c-1.5 2.5-2 5-2 7.5s.5 4 2 5c1.5-1 2-2.5 2-5S13.5 6.5 12 4z"/>
                <path d="M7.5 8c-2 1-3.5 3.5-3.5 6.5 0 1 .4 2 1.5 2.5"/>
                <path d="M16.5 8c2 1 3.5 3.5 3.5 6.5 0 1-.4 2-1.5 2.5"/>
                <line x1="12" y1="16.5" x2="12" y2="20"/>
                <path d="M9.5 20c.7-.5 1.6-.5 2.5 0 .9-.5 1.8-.5 2.5 0"/>
            </svg>
        </div>
        <p class="wk-empty-title">${title}</p>
        <p class="wk-empty-copy">${description}</p>`;
}

function showWkToast(msg) {
    let el = document.querySelector('.wk-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'wk-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}
