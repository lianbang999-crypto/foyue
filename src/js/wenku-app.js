/* ===== 法音文库 独立页面入口 ===== */
import '../css/wenku-page.css';
import { getWenkuSeries, getWenkuDocuments, getWenkuDocument, searchWenku, recordWenkuRead } from './wenku-api.js';

/* --- 常量 --- */
const BM_KEY = 'wenku-bookmarks';
const BM_MAX = 100;
const SCROLL_KEY = 'wenku-reader-scroll';
const SETTINGS_KEY = 'wenku-reader-settings';

/* --- DOM 引用 --- */
const wkContent = document.getElementById('wkContent');
const wkReader = document.getElementById('wkReader');

/* --- 路由状态 --- */
let currentView = 'home'; // 'home' | 'series' | 'reader'
let activeViewRequestId = 0;

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
    wireContentClicks();
    wireHomeShare();
    const params = new URLSearchParams(location.search);
    const docId = params.get('doc');
    const series = params.get('series');
    const query = params.get('q');

    if (docId) {
        openReader(docId, query);
    } else if (series) {
        renderSeries(series);
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
        renderSeries(s.series, true);
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

function saveBookmark(docId, percent, title, seriesName) {
    const bm = getBookmarks();
    bm[docId] = { percent, title, seriesName, ts: Date.now() };
    const keys = Object.keys(bm);
    if (keys.length > BM_MAX) {
        keys.sort((a, b) => (bm[a].ts || 0) - (bm[b].ts || 0));
        keys.slice(0, keys.length - BM_MAX).forEach(k => delete bm[k]);
    }
    try { localStorage.setItem(BM_KEY, JSON.stringify(bm)); } catch { /* quota */ }
}

function getRecentBookmark() {
    const bm = getBookmarks();
    let best = null;
    for (const [id, v] of Object.entries(bm)) {
        if (!best || v.ts > best.ts) best = { id, ...v };
    }
    return best;
}

function getSeriesReadCount(seriesName) {
    const bm = getBookmarks();
    let count = 0;
    for (const v of Object.values(bm)) {
        if (v.seriesName === seriesName && v.percent > 0) count++;
    }
    return count;
}

function getSeriesLatestTs(seriesName) {
    const bm = getBookmarks();
    let latest = 0;
    for (const v of Object.values(bm)) {
        if (v.seriesName === seriesName && v.ts > latest) latest = v.ts;
    }
    return latest;
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
        return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || defaultSettings();
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

    // 继续阅读
    const recent = getRecentBookmark();
    if (recent?.percent > 0 && recent.percent < 100) {
        html += `
      <div class="wk-continue" data-action="read" data-doc="${esc(recent.id)}">
        <div class="wk-continue-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wk-continue-body">
          <div class="wk-continue-title">${esc(recent.title || recent.id)}</div>
          <div class="wk-continue-sub">${recent.seriesName ? esc(recent.seriesName) + ' · ' : ''}已读 ${Math.round(recent.percent)}%</div>
          <div class="wk-continue-progress"><div class="wk-continue-progress-fill" style="width:${recent.percent}%"></div></div>
        </div>
      </div>`;
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
    html += '<div class="wk-series-list">';
    sorted.forEach(s => {
        const readCount = getSeriesReadCount(s.series_name);
        const metaParts = [s.count + ' 讲'];
        if (readCount > 0) metaParts.push('已读 ' + readCount + '/' + s.count);
        html += `
      <div class="wk-series-item" data-action="series" data-series="${esc(s.series_name)}">
        <div class="wk-series-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="wk-series-body">
          <div class="wk-series-name">${esc(s.series_name)}</div>
          <div class="wk-series-meta">${metaParts.join(' · ')}</div>
        </div>
      </div>`;
    });
    html += '</div>';

    wkContent.innerHTML = html;
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
    let html = `<div class="wk-section-label">${data.documents.length} 讲</div>`;
    html += '<div class="wk-doc-list">';
    data.documents.forEach((doc, idx) => {
        const bm = bookmarks[doc.id];
        const badge = bm ? `<span class="wk-doc-badge">${Math.round(bm.percent)}%</span>` : '';
        html += `
      <div class="wk-doc-item" data-action="read" data-doc="${esc(doc.id)}">
        <span class="wk-doc-num">${idx + 1}</span>
        <span class="wk-doc-title">${esc(doc.title)}</span>
        ${badge}
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
    else if (action === 'read') openReader(el.dataset.doc);
}

/* ================================================================
   阅读器
   ================================================================ */
let _readerState = null;

async function openReader(docId, highlightQuery, skipPush) {
    const requestId = beginViewRequest('reader');
    if (!skipPush) history.pushState({ doc: docId, q: highlightQuery }, '', `/wenku?doc=${encodeURIComponent(docId)}${highlightQuery ? '&q=' + encodeURIComponent(highlightQuery) : ''}`);

    const settings = loadSettings();

    wkReader.style.display = 'flex';
    wkReader.setAttribute('data-mode', settings.mode);
    document.body.style.overflow = 'hidden';

    wkReader.innerHTML = `
    <div class="wk-reader-progress" id="readerProgress"></div>
    <div class="wk-reader-topbar">
      <button class="wk-reader-btn" id="readerClose">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="wk-reader-topbar-title" id="readerTopTitle"></span>
      <button class="wk-reader-btn" id="readerShareBtn" title="分享">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
      <button class="wk-reader-btn" id="readerSettingsBtn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-4.22-5.78 1.42-1.42M4.22 19.78l1.42-1.42M19.78 19.78l-1.42-1.42M4.22 4.22l1.42 1.42"/></svg>
      </button>
    </div>
    <div class="wk-reader-scroll" id="readerScroll">
      <div class="wk-empty" style="padding-top:30vh">加载中...</div>
    </div>
    <div class="wk-reader-settings" id="readerSettings">
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
        scroll.innerHTML = `<div class="wk-empty" style="padding-top:30vh"><p>加载失败</p><button class="wk-retry-btn" id="readerRetry">重试</button></div>`;
        scroll.querySelector('#readerRetry')?.addEventListener('click', () => openReader(docId, highlightQuery, true));
        wireReaderClose(docId);
        return;
    }

    const doc = data.document;

    // Record read
    recordWenkuRead(docId);

    // Render content
    const scroll = wkReader.querySelector('#readerScroll');
    const bodyHtml = textToHtml(doc.content || '');
    let nextHtml = '';
    if (data.nextId) {
        nextHtml = `<div class="wk-next-card"><p>第 ${doc.episode_num || '?'}/${data.totalEpisodes || '?'} 讲</p><button class="wk-next-btn" data-next="${esc(data.nextId)}">下一讲</button></div>`;
    } else {
        nextHtml = '<div class="wk-next-card"><p>已到最后一讲</p></div>';
    }

    scroll.innerHTML = `
    <div class="wk-reader-title">${esc(doc.title)}</div>
    <div class="wk-reader-meta">${esc(doc.series_name || '大安法师')}</div>
    <div class="wk-reader-body" id="readerBody" data-font="${settings.fontFamily}" style="font-size:${settings.fontSize}px">${bodyHtml}</div>
    ${nextHtml}`;

    // Top title
    wkReader.querySelector('#readerTopTitle').textContent = doc.series_name || '';

    // Save state for bookmark on close
    _readerState = { docId, title: doc.title, series: doc.series_name || '' };

    // Highlight search
    if (highlightQuery) highlightText(highlightQuery);

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

    // Wire events
    wireReaderClose(docId);
    wireReaderScroll(scroll, docId);
    wireReaderSettings(settings);
    wireReaderNext(scroll);
    wireReaderShare();

    // Preload next
    if (data.nextId) getWenkuDocument(data.nextId);
}

function closeReader() {
    if (_readerState) {
        const scroll = wkReader.querySelector('#readerScroll');
        if (scroll) {
            const sh = scroll.scrollHeight - scroll.clientHeight;
            const pct = sh > 0 ? Math.min(100, (scroll.scrollTop / sh) * 100) : 0;
            saveScrollProgress(_readerState.docId, pct);
            saveBookmark(_readerState.docId, pct, _readerState.title, _readerState.series);
        }
    }
    wkReader.style.display = 'none';
    wkReader.innerHTML = '';
    document.body.style.overflow = '';
    _readerState = null;
}

function wireReaderClose(docId) {
    wkReader.querySelector('#readerClose')?.addEventListener('click', () => {
        closeReader();
        history.back();
    });
}

function wireReaderScroll(scroll, docId) {
    let ticking = false;
    scroll.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const sh = scroll.scrollHeight - scroll.clientHeight;
            const pct = sh > 0 ? Math.min(100, (scroll.scrollTop / sh) * 100) : 0;
            const bar = wkReader.querySelector('#readerProgress');
            if (bar) bar.style.width = pct + '%';
            ticking = false;
        });
    }, { passive: true });
}

function wireReaderSettings(settings) {
    const panel = wkReader.querySelector('#readerSettings');
    const btn = wkReader.querySelector('#readerSettingsBtn');
    if (!panel || !btn) return;

    btn.addEventListener('click', () => {
        panel.classList.toggle('open');
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
        }
    });
}

function wireReaderShare() {
    wkReader.querySelector('#readerShareBtn')?.addEventListener('click', () => {
        if (!_readerState) return;
        const title = _readerState.title + (_readerState.series ? ' — ' + _readerState.series : '');
        const url = location.href;
        shareUrl(title, url);
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
    if (!text) return '<p></p>';
    return text
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');
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
    let h = '<div class="wk-skeleton wk-skeleton-title"></div>';
    for (let i = 0; i < n; i++) h += '<div class="wk-skeleton wk-skeleton-card"></div>';
    return h;
}

function emptyState(isError, retryFn) {
    if (!isError) return '<div class="wk-empty">暂无内容</div>';
    const id = 'wkRetry_' + Date.now();
    setTimeout(() => {
        document.getElementById(id)?.addEventListener('click', () => retryFn());
    }, 0);
    return `<div class="wk-empty"><p>加载失败</p><button class="wk-retry-btn" id="${id}">重试</button></div>`;
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
