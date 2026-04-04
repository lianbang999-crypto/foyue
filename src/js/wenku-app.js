/* ===== 法音文库 独立页面入口 ===== */
import '../css/wenku-page.css';
import { getWenkuSeries, getWenkuDocuments, getWenkuDocument, searchWenku, recordWenkuRead } from './wenku-api.js';
import { syncSystemTheme } from './theme.js';

/* --- 常量 --- */
const BM_KEY = 'wenku-bookmarks';
const BM_MAX = 100;
const BOOKMARK_DONE_THRESHOLD = 99.5;
const SCROLL_KEY = 'wenku-reader-scroll';
const SETTINGS_KEY = 'wenku-reader-settings';
const SETTINGS_VERSION = 2;
const RECENT_MAX = 5;
const SERIES_COLORS = [
    '#C4704F', '#A8674D', '#8A6B55', '#A17A5C', '#7D675A',
    '#B77C61', '#8F715F', '#C78B74', '#9A7B67', '#AE6E57',
];
const THEME_COLORS = {
    light: '#F7F5F0',
    dark: '#1A1614',
};

/* --- DOM 引用 --- */
const wkContent = document.getElementById('wkContent');
const wkReader = document.getElementById('wkReader');

/* --- 路由状态 --- */
let currentView = 'home'; // 'home' | 'series' | 'reader'
let activeViewRequestId = 0;
let _readerState = null;
let _pager = null; // paged mode state
let _readerScrollHandler = null;
let _bookSheetEl = null;

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
    syncSystemTheme(THEME_COLORS);
    wireContentClicks();
    wireHomeShare();
    const params = new URLSearchParams(location.search);
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

function pickIntro(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
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

function normalizeIntroText(text) {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')
        .replace(/[。！？；\s]*$/, '')
        .trim();
}

function inferSeriesTone(seriesName, total) {
    if (total === 1) return 'single';
    if (/(女士书|和尚书|书$|函遍复|复.*书)/.test(seriesName)) return 'letter';
    if (/(经|论|章|文|要解|述义|悬谈|注)/.test(seriesName)) return 'scripture';
    return 'general';
}

function buildFallbackIntro(seriesName, total) {
    const tone = inferSeriesTone(seriesName, total);
    if (tone === 'single') {
        return '这是一篇篇幅较短的讲记，适合安静地一气读完，先把整篇意思读顺，再回头细看关键处。';
    }
    if (tone === 'letter') {
        return `这部讲记围绕“${seriesName}”展开，文字更接近书信式开示，适合顺着语气慢慢读，不必急着跳到后面找结论。`;
    }
    if (tone === 'scripture') {
        return `这部讲记围绕“${seriesName}”展开，适合按讲次顺着读下去，先把主线听明白，再回到细处慢慢体会。`;
    }
    return `这部讲记围绕“${seriesName}”展开，适合从前往后慢慢阅读，先把整体脉络建立起来，再按目录回看重点。`;
}

function buildReadingHint(total, resumeState) {
    if (resumeState.mode === 'continue') {
        return total === 1
            ? '你上次已经读到中途，这次直接接着读完会最顺。'
            : '你之前已经读到一半，这次可以直接回到上次的位置；如果想重新理一遍脉络，也可以先从目录里换到别的讲次。';
    }
    if (resumeState.mode === 'restart') {
        return total === 1
            ? '这一篇你之前已经读过，如果想再看一遍，直接重新开始就可以。'
            : '这本书你之前已经读过，若想重新进入，直接从第 1 讲开始会更自然；如果只是回看，也可以先从目录挑到想重读的那一讲。';
    }
    return total === 1
        ? '第一次打开时，直接进入正文就可以；如果想先有个把握，也可以先看一眼下面的目录。'
        : '如果这是第一次打开，建议先看一下目录，再从第 1 讲进入正文，后面读到哪里都可以随时回来切换。';
}

function buildSeriesIntroText(seriesName, documents, intro, resumeState) {
    const total = documents.length;
    const lead = normalizeIntroText(intro) || buildFallbackIntro(seriesName, total);
    const tail = buildReadingHint(total, resumeState);
    return `${lead.replace(/[。！？；\s]*$/, '。')}${tail}`;
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
    document.body.classList.remove('wk-book-sheet-open');
}

async function openBookSheet(seriesName) {
    const sheet = ensureBookSheet();
    const body = sheet.querySelector('.wk-book-sheet-body');
    const color = getSeriesColor(seriesName);

    body.innerHTML = `
            <div class="wk-book-sheet-loading">
                <div class="wk-series-header">
                    <div class="wk-series-header-avatar" style="background:${color}">${esc(seriesName.charAt(0))}</div>
                    <div class="wk-series-header-info">
                        <div class="wk-series-header-name">${esc(seriesName)}</div>
                        <div class="wk-series-header-stats">正在整理这本书的目录…</div>
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
    const firstDocument = documents[0] || null;
    const intro = pickIntro(
        data?.seriesIntro,
        data?.series_intro,
        data?.intro,
        data?.description,
        data?.desc,
        firstDocument?.seriesIntro,
        firstDocument?.series_intro,
        firstDocument?.seriesDescription,
        firstDocument?.series_description,
    );
    const introText = buildSeriesIntroText(seriesName, documents, intro, resumeState);
    const ctaText = resumeState.mode === 'continue' ? '继续阅读' : resumeState.mode === 'restart' ? '重新开始' : '开始阅读';
    const ctaMeta = resumeState.mode === 'continue'
        ? `上次读到 ${getDisplayPercent(resumeBookmark?.percent || 0)}%`
        : resumeState.mode === 'restart'
            ? `已读过这本书，从第 1 讲重新开始`
            : `从第 1 讲开始，共 ${documents.length} 讲`;

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
                <p class="wk-book-sheet-intro">${esc(introText)}</p>
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
                    <div class="wk-doc-item ${hasCompletedReading(pct) ? 'wk-doc-done' : pct > 0 ? 'wk-doc-reading' : ''}" data-action="book-sheet-read" data-doc="${esc(doc.id)}">
                        <div class="wk-doc-num-circle" style="${doc.id === resumeDocId ? `background:${color};color:#fff` : ''}">${idx + 1}</div>
                        <div class="wk-doc-info">
                            <div class="wk-doc-title">${esc(doc.title)}</div>
                        </div>
                        ${badge}
                    </div>`;
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
        const settings = {
            version: Number.isFinite(raw.version) ? raw.version : 0,
            mode: ['light', 'sepia', 'dark', 'eink'].includes(raw.mode) ? raw.mode : defaultSettings().mode,
            fontSize: Number.isFinite(raw.fontSize) ? raw.fontSize : 17,
            fontFamily: ['sans', 'serif', 'kai'].includes(raw.fontFamily) ? raw.fontFamily : 'sans',
            readMode: ['paged', 'scroll'].includes(raw.readMode) ? raw.readMode : 'scroll',
        };

        // 旧版本默认是翻页模式，长文首开会先做分页布局，体感更慢。
        if (settings.version < SETTINGS_VERSION) {
            settings.version = SETTINGS_VERSION;
            settings.readMode = 'scroll';
            persistSettings(settings);
        }

        return settings;
    } catch { return defaultSettings(); }
}

function defaultSettings() {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return { version: SETTINGS_VERSION, mode: dark ? 'dark' : 'light', fontSize: 17, fontFamily: 'sans', readMode: 'scroll' };
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
    resetHeader();
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

    // 搜索框
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

    // 按最近阅读排序
    const sorted = [...data.series].sort((a, b) => {
        const tsA = getSeriesLatestTs(a.series_name);
        const tsB = getSeriesLatestTs(b.series_name);
        if (tsA && !tsB) return -1;
        if (!tsA && tsB) return 1;
        return (tsB || 0) - (tsA || 0);
    });

    html += `<div class="wk-section-label">大安法师讲记 · ${data.series.length} 部</div>`;
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
      <div class="wk-search-item" data-action="read" data-doc="${esc(r.id)}" data-query="${esc(query)}">
        <div class="wk-search-item-title">${esc(r.title)}</div>
        <div class="wk-search-item-series">${esc(r.series_name || '')}</div>
        ${snippet ? `<div class="wk-search-item-snippet">${esc(snippet)}</div>` : ''}
      </div>`;
    });
    container.innerHTML = html;
}

/* ================================================================
   系列详情
   ================================================================ */
async function renderSeries(seriesName, skipPush) {
    const requestId = beginViewRequest('series');
    if (!skipPush) history.pushState({ series: seriesName }, '', `/wenku?series=${encodeURIComponent(seriesName)}`);

    // 更新顶栏
    updateHeader(seriesName, () => history.back());

    wkContent.innerHTML = skeleton(3);

    let data;
    try { data = await getWenkuDocuments(seriesName); } catch { data = null; }

    if (!isActiveViewRequest(requestId, 'series')) return;

    if (!data?.documents?.length) {
        wkContent.innerHTML = emptyState(data === null, () => renderSeries(seriesName));
        return;
    }

    const bookmarks = getBookmarks();
    const total = data.documents.length;
    const readDocs = data.documents.filter(d => hasStartedReading(bookmarks[d.id]?.percent)).length;
    const color = getSeriesColor(seriesName);
    const overallProgress = readDocs > 0 ? Math.round((readDocs / total) * 100) : 0;
    const firstDocument = data.documents.find(Boolean) || null;
    const seriesIntro = pickIntro(
        data.seriesIntro,
        data.series_intro,
        data.intro,
        data.description,
        data.desc,
        firstDocument?.seriesIntro,
        firstDocument?.series_intro,
        firstDocument?.seriesDescription,
        firstDocument?.series_description,
    );

    // 系列头部信息
    let html = `
      <div class="wk-series-header">
        <div class="wk-series-header-avatar" style="background:${color}">${esc(seriesName.charAt(0))}</div>
        <div class="wk-series-header-info">
          <div class="wk-series-header-name">${esc(seriesName)}</div>
          <div class="wk-series-header-stats">共 ${total} 讲${readDocs > 0 ? ` · 已读 ${readDocs}/${total}` : ''}</div>
                    ${seriesIntro ? `<div class="wk-series-header-intro">${esc(seriesIntro)}</div>` : ''}
          ${overallProgress > 0 ? `<div class="wk-series-header-progress"><div class="wk-series-header-progress-fill" style="width:${overallProgress}%;background:${color}"></div></div>` : ''}
        </div>
      </div>`;

    // 文章列表
    html += '<div class="wk-doc-list">';
    data.documents.forEach((doc, idx) => {
        const bm = bookmarks[doc.id];
        const pct = bm ? getDisplayPercent(bm.percent) : 0;
        const statusClass = hasCompletedReading(pct) ? 'wk-doc-done' : pct > 0 ? 'wk-doc-reading' : '';
        html += `
      <div class="wk-doc-item ${statusClass}" data-action="read" data-doc="${esc(doc.id)}">
                <div class="wk-doc-num-circle" style="${hasCompletedReading(pct) ? 'background:' + color + ';color:#fff' : ''}">${idx + 1}</div>
        <div class="wk-doc-info">
          <div class="wk-doc-title">${esc(doc.title)}</div>
                    ${pct > 0 && !hasCompletedReading(pct) ? `<div class="wk-doc-progress"><div class="wk-doc-progress-fill" style="width:${pct}%;background:${color}"></div></div>` : ''}
        </div>
                ${pct > 0 ? `<span class="wk-doc-badge">${hasCompletedReading(pct) ? '已读' : pct + '%'}</span>` : ''}
      </div>`;
    });
    html += '</div>';

    wkContent.innerHTML = html;
}

/* 更新顶栏为带返回按钮的样式 */
function updateHeader(title, backFn) {
    const inner = document.querySelector('.wk-header-inner');
    if (!inner) return;
    // 保存原始内容
    if (!inner._original) inner._original = inner.innerHTML;
    inner.innerHTML = `
    <button class="wk-header-back" id="wkBack">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
    </button>
    <span class="wk-header-title">${esc(title)}</span>
    <a href="/ai" class="wk-header-link">AI 问答</a>`;
    inner.querySelector('#wkBack').addEventListener('click', backFn);
}

function resetHeader() {
    const inner = document.querySelector('.wk-header-inner');
    if (inner?._original) {
        inner.innerHTML = inner._original;
        inner._original = null;
        wireHomeShare();
    }
}

/* 内容区域点击事件委托 */
function wireContentClicks() {
    if (wkContent.dataset.bound === 'true') return;
    wkContent.dataset.bound = 'true';
    wkContent.addEventListener('click', handleContentClick);
}

function wireHomeShare() {
    const btn = document.getElementById('wkShareBtn');
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
        shareUrl('法音文库 · 净土讲记文稿', location.href);
    });
}

function handleContentClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'series') renderSeries(el.dataset.series);
    else if (action === 'book') openBookSheet(el.dataset.series);
    else if (action === 'read') openReader(el.dataset.doc, el.dataset.query);
}

/* ================================================================
    阅读器
    ================================================================ */

function getCurrentReaderProgress() {
    if (_pager && _pager.total > 1) {
        return (_pager.page / (_pager.total - 1)) * 100;
    }

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

async function openReader(docId, highlightQuery, skipPush) {
    const wasReaderOpen = wkReader.style.display !== 'none' && !!_readerState;
    snapshotReaderProgress();
    cleanupPager();

    const requestId = beginViewRequest('reader');
    if (!skipPush) {
        const readerUrl = `/wenku?doc=${encodeURIComponent(docId)}${highlightQuery ? '&q=' + encodeURIComponent(highlightQuery) : ''}`;
        const readerState = { doc: docId, q: highlightQuery };
        if (wasReaderOpen) history.replaceState(readerState, '', readerUrl);
        else history.pushState(readerState, '', readerUrl);
    }

    const settings = loadSettings();
    if (!settings.readMode) settings.readMode = 'paged';

    wkReader.style.display = 'flex';
    wkReader.setAttribute('data-mode', settings.mode);
    wkReader.setAttribute('data-read-mode', settings.readMode);
    document.body.style.overflow = 'hidden';

    wkReader.innerHTML = `
    <div class="wk-reader-progress" id="readerProgress"></div>
        <div class="wk-reader-settings-backdrop" id="readerSettingsBackdrop"></div>
    <div class="wk-reader-topbar">
      <button class="wk-reader-btn" id="readerClose">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
            <button class="wk-reader-btn" id="readerCatalogBtn" aria-label="打开目录">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12"></path><path d="M8 12h12"></path><path d="M8 18h12"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>
            </button>
            <div class="wk-reader-topbar-center">
                <span class="wk-reader-topbar-title" id="readerTopTitle"></span>
                <span class="wk-reader-topbar-meta" id="readerTopMeta">已读 0%</span>
            </div>
      <button class="wk-reader-btn" id="readerSettingsBtn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-4.22-5.78 1.42-1.42M4.22 19.78l1.42-1.42M19.78 19.78l-1.42-1.42M4.22 4.22l1.42 1.42"/></svg>
      </button>
    </div>
    <div class="wk-reader-scroll" id="readerScroll">
            <div class="wk-empty wk-empty--reader" style="padding-top:30vh">${buildEmptyStateMarkup('正在加载讲记…', '稍候片刻，法义原文即将展开。')}</div>
    </div>
    <div class="wk-pager-info" id="pagerInfo" style="display:none">
      <span id="pagerText">1 / 1</span>
    </div>
    <div class="wk-reader-settings" id="readerSettings">
            <div class="wk-reader-settings-handle"></div>
      <div class="wk-settings-title">阅读模式</div>
      <div class="wk-readmode-row">
        <button class="wk-font-btn ${settings.readMode === 'paged' ? 'active' : ''}" data-readmode="paged">翻页</button>
        <button class="wk-font-btn ${settings.readMode === 'scroll' ? 'active' : ''}" data-readmode="scroll">滚动</button>
      </div>
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
    const { html: bodyHtml, contributor } = textToHtml(doc.content || '');
    let nextHtml = '';
    if (data.nextId) {
        nextHtml = `<div class="wk-next-card"><p>第 ${doc.episode_num || '?'}/${data.totalEpisodes || '?'} 讲</p><button class="wk-next-btn" data-next="${esc(data.nextId)}">下一讲</button></div>`;
    } else {
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
    <div class="wk-reader-meta">${esc(doc.series_name || '大安法师')}${contributorHtml}</div>
    <div class="wk-reader-body" id="readerBody" data-font="${settings.fontFamily}" style="font-size:${settings.fontSize}px">${bodyHtml}</div>
    ${nextHtml}`;

    // Top title
    wkReader.querySelector('#readerTopTitle').textContent = doc.series_name || '';

    // Save state for bookmark on close
    _readerState = { docId, title: doc.title, series: doc.series_name || '', query: highlightQuery || '' };

    // Highlight search
    if (highlightQuery) highlightText(highlightQuery);

    // Initialize paged mode or scroll mode
    if (settings.readMode === 'paged') {
        initPagedMode(scroll, docId, highlightQuery);
    } else {
        // Restore scroll
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
    }

    // Wire events
    wireReaderClose();
    wireReaderCatalog(doc.series_name || '');
    wireReaderSettings(settings);
    wireReaderNext(scroll);

    // Preload next
    if (data.nextId) getWenkuDocument(data.nextId);
}

/* --- 翻页阅读模式 --- */
function initPagedMode(scroll, docId, highlightQuery) {
    scroll.classList.add('wk-paged');

    // 动态设置 column-width 为容器可见宽度，让内容自动水平分列
    const colW = scroll.clientWidth;
    if (colW > 0) scroll.style.columnWidth = colW + 'px';

    const pagerInfo = document.getElementById('pagerInfo');
    const pagerText = document.getElementById('pagerText');
    if (pagerInfo) pagerInfo.style.display = 'flex';

    _pager = { page: 0, total: 1, scroll };

    // 等待布局稳定（双帧确保CSS已渲染）
    const doInitRecalc = () => {
        if (!_pager) return;
        recalcPages();
        if (!highlightQuery) {
            const pct = getScrollProgress(docId);
            if (pct > 0 && _pager.total > 1) {
                _pager.page = Math.min(Math.round((pct / 100) * (_pager.total - 1)), _pager.total - 1);
                applyPageTransform();
            }
        }
        updatePagerDisplay();
        updateProgressBar();
    };
    requestAnimationFrame(() => requestAnimationFrame(doInitRecalc));
    // 字体加载完成后重算（中文网络字体可能晚于双帧到达）
    document.fonts.ready.then(() => { if (_pager) { recalcPages(); updatePagerDisplay(); updateProgressBar(); } });

    // Touch/click navigation
    wirePagerGestures(scroll);

    // Keyboard navigation
    const onKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); pageNext(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pagePrev(); }
    };
    document.addEventListener('keydown', onKey);

    // 设备旋转/窗口大小变化时重新分页
    let resizeTimer = null;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!_pager) return;
            // 记住当前阅读进度比例
            const pctBefore = _pager.total > 1 ? _pager.page / (_pager.total - 1) : 0;
            recalcPages();
            // 恢复到同等进度位置
            if (_pager.total > 1) {
                _pager.page = Math.min(Math.round(pctBefore * (_pager.total - 1)), _pager.total - 1);
            }
            applyPageTransform();
            updatePagerDisplay();
            updateProgressBar();
        }, 200);
    };
    window.addEventListener('resize', onResize);

    scroll._cleanupPager = () => {
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        clearTimeout(resizeTimer);
    };
}

function recalcPages() {
    if (!_pager) return;
    const s = _pager.scroll;
    const colWidth = s.clientWidth;
    if (colWidth <= 0) return;
    // 更新 column-width 以匹配当前容器宽度（应对 resize / 旋转）
    s.style.columnWidth = colWidth + 'px';
    _pager.total = Math.max(1, Math.ceil(s.scrollWidth / colWidth));
    if (_pager.page >= _pager.total) _pager.page = _pager.total - 1;
}

function applyPageTransform() {
    if (!_pager) return;
    const colWidth = _pager.scroll.clientWidth;
    _pager.scroll.style.transform = `translateX(-${_pager.page * colWidth}px)`;
}

function pageNext() {
    if (!_pager || _pager.page >= _pager.total - 1) return;
    _pager.page++;
    applyPageTransform();
    updatePagerDisplay();
    updateProgressBar();
}

function pagePrev() {
    if (!_pager || _pager.page <= 0) return;
    _pager.page--;
    applyPageTransform();
    updatePagerDisplay();
    updateProgressBar();
}

function updatePagerDisplay() {
    const el = document.getElementById('pagerText');
    if (el && _pager) el.textContent = `${_pager.page + 1} / ${_pager.total}`;
}

function updateProgressBar() {
    const bar = document.getElementById('readerProgress');
    if (bar && _pager) {
        const pct = _pager.total > 1 ? (_pager.page / (_pager.total - 1)) * 100 : 0;
        bar.style.width = pct + '%';
        updateReaderTopMeta(pct, `${_pager.page + 1} / ${_pager.total} 页`);
    }
}

function updateReaderTopMeta(pct = 0, suffix = '') {
    const el = document.getElementById('readerTopMeta');
    if (!el) return;
    const value = Number.isFinite(pct) ? Math.round(pct) : 0;
    el.textContent = suffix ? `已读 ${value}% · ${suffix}` : `已读 ${value}%`;
}

function wirePagerGestures(scroll) {
    let startX = 0, startY = 0, startTime = 0, tracking = false;

    scroll.addEventListener('touchstart', (e) => {
        // Don't interfere with settings panel or buttons
        if (e.target.closest('.wk-reader-settings') || e.target.closest('.wk-next-btn')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        tracking = true;
    }, { passive: true });

    scroll.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - startX;
        const dy = endY - startY;
        const dt = Date.now() - startTime;

        // Swipe detection: horizontal > vertical, minimum distance, max time
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
            if (dx < 0) pageNext();
            else pagePrev();
            return;
        }

        // Tap detection: minimal movement, short press
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
            // Don't handle taps on interactive elements
            if (e.target.closest('button, a, .wk-next-btn')) return;
            const w = scroll.clientWidth;
            const rect = scroll.getBoundingClientRect();
            const tapX = endX - rect.left;
            // Center 1/3 = toggle topbar visibility (reserved for future)
            // Left 1/3 = prev, Right 1/3 = next
            if (tapX < w * 0.33) pagePrev();
            else if (tapX > w * 0.67) pageNext();
            // Center tap: could toggle toolbar visibility in future
        }
    }, { passive: true });

    // Click fallback for desktop
    scroll.addEventListener('click', (e) => {
        if (e.target.closest('button, a, .wk-next-btn, .wk-reader-settings')) return;
        if (!_pager || wkReader.getAttribute('data-read-mode') !== 'paged') return;
        const w = scroll.clientWidth;
        const rect = scroll.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < w * 0.33) pagePrev();
        else if (clickX > w * 0.67) pageNext();
    });
}

function cleanupPager() {
    if (_pager?.scroll) {
        if (_pager.scroll._cleanupPager) _pager.scroll._cleanupPager();
        _pager.scroll.style.columnWidth = '';
        _pager.scroll.style.transform = '';
    }
    _pager = null;
    const pagerInfo = document.getElementById('pagerInfo');
    if (pagerInfo) pagerInfo.style.display = 'none';
}

function closeReader() {
    snapshotReaderProgress();
    cleanupPager();
    cleanupReaderScroll();
    wkReader.style.display = 'none';
    wkReader.removeAttribute('data-read-mode');
    wkReader.innerHTML = '';
    document.body.style.overflow = '';
    _readerState = null;
}

function wireReaderClose() {
    wkReader.querySelector('#readerClose')?.addEventListener('click', () => {
        closeReader();
        history.back();
    });
}

function wireReaderCatalog(seriesName) {
    wkReader.querySelector('#readerCatalogBtn')?.addEventListener('click', () => {
        if (!seriesName) return;
        openBookSheet(seriesName);
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
            updateReaderTopMeta(pct);
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
    const btn = wkReader.querySelector('#readerSettingsBtn');
    const backdrop = wkReader.querySelector('#readerSettingsBackdrop');
    if (!panel || !btn) return;

    btn.addEventListener('click', () => {
        panel.classList.toggle('open');
        backdrop?.classList.toggle('open', panel.classList.contains('open'));
    });

    backdrop?.addEventListener('click', () => {
        panel.classList.remove('open');
        backdrop.classList.remove('open');
    });

    // Read mode toggle
    panel.querySelectorAll('[data-readmode]').forEach(b => {
        b.addEventListener('click', () => {
            const newMode = b.dataset.readmode;
            if (newMode === settings.readMode) return;
            settings.readMode = newMode;
            panel.querySelectorAll('[data-readmode]').forEach(bb => bb.classList.toggle('active', bb.dataset.readmode === newMode));
            persistSettings(settings);
            panel.classList.remove('open');
            backdrop?.classList.remove('open');
            // Re-open with new mode
            if (_readerState) openReader(_readerState.docId, _readerState.query, true);
        });
    });

    // Font size slider
    const slider = panel.querySelector('#readerFontSlider');
    if (slider) {
        slider.addEventListener('input', () => {
            settings.fontSize = parseInt(slider.value, 10);
            const body = wkReader.querySelector('#readerBody');
            if (body) body.style.fontSize = settings.fontSize + 'px';
            persistSettings(settings);
            // Recalc pages in paged mode
            if (_pager) {
                requestAnimationFrame(() => requestAnimationFrame(() => { recalcPages(); updatePagerDisplay(); updateProgressBar(); applyPageTransform(); }));
            }
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
            // Recalc pages in paged mode
            if (_pager) {
                requestAnimationFrame(() => requestAnimationFrame(() => { recalcPages(); updatePagerDisplay(); updateProgressBar(); applyPageTransform(); }));
            }
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
            const seriesName = btn.dataset.completeSeries;
            if (seriesName) {
                closeReader();
                renderSeries(seriesName, true);
                history.replaceState({ series: seriesName }, '', `/wenku?series=${encodeURIComponent(seriesName)}`);
            }
            const openBook = btn.dataset.openBook;
            if (openBook) openBookSheet(openBook);
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

function textToHtml(text) {
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

    // Extract contributor from first/last lines
    const contributor = extractContributor(cleaned);

    // 按单个换行分段（源文本多数以 \n 分段，少数用 \n\n）
    const html = cleaned
        .split(/\n/)
        .filter(p => p.trim())
        .map(p => `<p>${esc(p.trim())}</p>`)
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
    const words = query.split(/\s+/).filter(w => w.length >= 2);
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

/* --- 分享 --- */
function shareUrl(title, url) {
    if (navigator.share) {
        navigator.share({ title, url }).catch(err => {
            if (err.name === 'AbortError') return;
            copyToClipboard(title + '\n' + url);
        });
        return;
    }
    copyToClipboard(title + '\n' + url);
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showWkToast('链接已复制'))
            .catch(() => fallbackCopyToClipboard(text));
        return;
    }
    fallbackCopyToClipboard(text);
}

function fallbackCopyToClipboard(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }

    document.body.removeChild(ta);
    showWkToast(copied ? '链接已复制' : '复制失败，请手动复制');
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
