import { renderHighlightedParagraph } from './ai-format.js';

function buildWenkuUrl(docId, query) {
    return `/wenku?doc=${encodeURIComponent(docId)}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
}

function buildPreviewMeta(doc) {
    const parts = [];
    if (doc.series_name) parts.push(doc.series_name);
    if (Number.isFinite(Number(doc.episode_num)) && Number(doc.episode_num) > 0) {
        parts.push(`第 ${Number(doc.episode_num)} 讲`);
    }
    return parts.join(' · ') || '大安法师讲记';
}

function buildPreviewSkeleton() {
    return `
        <div class="ai-preview-skeleton">
            <div class="ai-preview-skeleton-line"></div>
            <div class="ai-preview-skeleton-line"></div>
            <div class="ai-preview-skeleton-line ai-preview-skeleton-line--short"></div>
            <div class="ai-preview-skeleton-block"></div>
            <div class="ai-preview-skeleton-line"></div>
            <div class="ai-preview-skeleton-line ai-preview-skeleton-line--mid"></div>
        </div>`;
}

function extractFocusSentence(text, terms) {
    if (!text) return '';
    if (!terms.length) return text.length > 66 ? text.slice(0, 66) + '…' : text;

    const sentences = text.split(/(?<=[。！？!?])/).map(item => item.trim()).filter(Boolean);
    const hit = sentences.find(sentence => terms.some(term => sentence.includes(term)));
    if (hit) return hit;
    return text.length > 66 ? text.slice(0, 66) + '…' : text;
}

function hardSplitPreviewBlock(text, maxChars) {
    const chunks = [];
    for (let start = 0; start < text.length; start += maxChars) {
        chunks.push(text.slice(start, start + maxChars).trim());
    }
    return chunks.filter(Boolean);
}

function splitLongPreviewBlock(text) {
    const maxPreviewChars = 360;
    if (text.length <= maxPreviewChars) return [text];

    const sentences = text
        .split(/(?<=[。！？!?])/)
        .map(item => item.trim())
        .filter(Boolean);

    if (sentences.length <= 1) {
        return hardSplitPreviewBlock(text, maxPreviewChars);
    }

    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
        if (!current) {
            current = sentence;
            continue;
        }

        if ((current + sentence).length <= maxPreviewChars) {
            current += sentence;
            continue;
        }

        chunks.push(current);
        current = sentence;
    }

    if (current) chunks.push(current);

    return chunks.flatMap(chunk => chunk.length > maxPreviewChars ? hardSplitPreviewBlock(chunk, maxPreviewChars) : [chunk]);
}

function splitPreviewParagraphs(text) {
    const blocks = String(text || '')
        .replace(/\r\n/g, '\n')
        .split(/\n\n+/)
        .map(item => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    return blocks.flatMap(splitLongPreviewBlock);
}

function getPreviewTerms(query) {
    const raw = String(query || '').trim();
    if (!raw) return [];

    const parts = raw
        .split(/[\s，。！？、；：,.!?()[\]【】《》“"'‘’/\\|+-]+/)
        .map(item => item.trim())
        .filter(item => item.length >= 2);

    const merged = parts.length ? parts : [raw];
    const unique = [];
    for (const item of merged) {
        if (item.length < 2) continue;
        if (!unique.includes(item)) unique.push(item);
        if (unique.length >= 6) break;
    }
    return unique;
}

function pickPreviewExcerpt(paragraphs, terms) {
    if (!paragraphs.length) return [];

    const matchIndex = paragraphs.findIndex(paragraph => {
        if (!terms.length) return false;
        return terms.some(term => paragraph.includes(term));
    });

    if (matchIndex >= 0) {
        const start = Math.max(0, matchIndex - 1);
        const end = Math.min(paragraphs.length, matchIndex + 2);
        return paragraphs.slice(start, end).map((text, index) => ({
            text,
            isMatch: start + index === matchIndex,
        }));
    }

    return paragraphs.slice(0, 3).map(text => ({ text, isMatch: false }));
}

function buildPreviewData(doc, query) {
    const paragraphs = splitPreviewParagraphs(doc.content || '');
    const terms = getPreviewTerms(query);
    const excerpt = pickPreviewExcerpt(paragraphs, terms);
    const hasMatch = excerpt.some(item => item.isMatch);

    return {
        excerpt: excerpt.map(item => ({
            ...item,
            focusText: extractFocusSentence(item.text, terms),
            terms,
        })),
        hasMatch,
        matchIndex: excerpt.findIndex(item => item.isMatch),
    };
}

export function createAiPreviewController(options) {
    const {
        previewDrawer,
        previewBackdrop,
        previewTitle,
        previewMeta,
        previewBody,
        previewOpenBtn,
        inputArea,
        getWenkuDocument,
    } = options;

    const previewState = {
        requestId: 0,
        docId: '',
        query: '',
        title: '',
        excerpt: [],
        activeIndex: 0,
        matchIndex: -1,
        hasMatch: false,
    };

    let inputAreaResizeObserver = null;

    function syncDockOffset() {
        const dockHeight = Math.max(0, Math.ceil(inputArea?.offsetHeight || 0));
        const offsetValue = `${dockHeight}px`;
        previewDrawer?.style.setProperty('--ai-preview-dock-offset', offsetValue);
        previewBackdrop?.style.setProperty('--ai-preview-dock-offset', offsetValue);
    }

    syncDockOffset();

    if (inputArea && typeof ResizeObserver !== 'undefined') {
        inputAreaResizeObserver = new ResizeObserver(() => {
            syncDockOffset();
        });
        inputAreaResizeObserver.observe(inputArea);
    } else {
        window.addEventListener('resize', syncDockOffset);
    }

    function closePreview() {
        previewDrawer?.classList.remove('open');
        previewBackdrop?.classList.remove('open');
        previewDrawer?.setAttribute('aria-hidden', 'true');
    }

    function renderPreviewView() {
        if (!previewBody) return;

        const excerpt = previewState.excerpt || [];
        const current = excerpt[previewState.activeIndex];

        if (!current) {
            previewBody.innerHTML = `
                <div class="ai-preview-state">
                    <p>这篇讲记暂时没有可展示的段落预览。</p>
                </div>`;
            return;
        }

        const hasMatch = previewState.hasMatch;
        const canPrev = previewState.activeIndex > 0;
        const canNext = previewState.activeIndex < excerpt.length - 1;
        const sectionLabel = current.isMatch
            ? '当前片段'
            : previewState.activeIndex < (previewState.matchIndex >= 0 ? previewState.matchIndex : 1)
                ? '前文'
                : '后文';

        previewBody.innerHTML = `
            <div class="ai-preview-summary">
                <span class="ai-preview-badge">${hasMatch ? '相关原文' : '相关内容'}</span>
                <p class="ai-preview-tip">${hasMatch ? '已为你找到相关原文。' : '先为你展示相关内容。'}</p>
            </div>
            <div class="ai-preview-quote-card">
                <div class="ai-preview-quote-head">
                    <span class="ai-preview-quote-kicker">${sectionLabel}</span>
                    <span class="ai-preview-quote-index">${previewState.activeIndex + 1} / ${excerpt.length}</span>
                </div>
                ${current.focusText ? `<blockquote class="ai-preview-focusquote">${renderHighlightedParagraph(current.focusText, current.terms)}</blockquote>` : ''}
                <div class="ai-preview-excerpt">
                    <p>${renderHighlightedParagraph(current.text, current.terms)}</p>
                </div>
            </div>
            <div class="ai-preview-nav">
                <button class="ai-preview-nav-btn" data-preview-action="prev" ${canPrev ? '' : 'disabled'}>上一段</button>
                ${hasMatch ? `<button class="ai-preview-nav-btn ai-preview-nav-btn--accent" data-preview-action="focus" ${current.isMatch ? 'disabled' : ''}>回到相关片段</button>` : ''}
                <button class="ai-preview-nav-btn" data-preview-action="next" ${canNext ? '' : 'disabled'}>下一段</button>
            </div>`;

        previewBody.scrollTop = 0;
    }

    async function openPreview(docId, query, fallbackTitle = '') {
        if (!previewDrawer || !previewBody || !previewOpenBtn) {
            window.location.href = buildWenkuUrl(docId, query);
            return;
        }

        syncDockOffset();

        const requestId = Date.now();
        previewState.requestId = requestId;
        previewState.docId = docId;
        previewState.query = query || '';
        previewState.title = fallbackTitle || '';
        previewState.excerpt = [];
        previewState.activeIndex = 0;
        previewState.matchIndex = -1;
        previewState.hasMatch = false;

        previewDrawer.classList.add('open');
        previewBackdrop?.classList.add('open');
        previewDrawer.setAttribute('aria-hidden', 'false');
        previewTitle.textContent = fallbackTitle || '文库引用';
        previewMeta.textContent = '正在提取原文片段…';
        previewBody.innerHTML = buildPreviewSkeleton();
        previewOpenBtn.href = buildWenkuUrl(docId, query);

        try {
            const data = await getWenkuDocument(docId);
            if (previewState.requestId !== requestId) return;

            const doc = data?.document;
            if (!doc) throw new Error('文稿加载失败');

            previewTitle.textContent = doc.title || fallbackTitle || '文库引用';
            previewMeta.textContent = buildPreviewMeta(doc);
            const previewData = buildPreviewData(doc, query);
            previewState.title = doc.title || fallbackTitle || '文库引用';
            previewState.excerpt = previewData.excerpt;
            previewState.matchIndex = previewData.matchIndex;
            previewState.hasMatch = previewData.hasMatch;
            previewState.activeIndex = previewData.matchIndex >= 0 ? previewData.matchIndex : 0;
            renderPreviewView();
            previewBody.scrollTop = 0;
            previewOpenBtn.href = buildWenkuUrl(docId, query);
        } catch {
            if (previewState.requestId !== requestId) return;
            previewMeta.textContent = '暂时无法提取引用原文';
            previewBody.innerHTML = `
                <div class="ai-preview-state ai-preview-state--error">
                    <p>当前无法在 AI 页内加载这篇讲记的预览。</p>
                    <p>你仍可直接进入文库独立页阅读全文。</p>
                </div>`;
            previewOpenBtn.href = buildWenkuUrl(docId, query);
        }
    }

    function handleBodyClick(e) {
        const button = e.target.closest('[data-preview-action]');
        if (!button) return;

        const action = button.dataset.previewAction;
        if (action === 'prev' && previewState.activeIndex > 0) {
            previewState.activeIndex -= 1;
            renderPreviewView();
        } else if (action === 'next' && previewState.activeIndex < previewState.excerpt.length - 1) {
            previewState.activeIndex += 1;
            renderPreviewView();
        } else if (action === 'focus' && previewState.matchIndex >= 0) {
            previewState.activeIndex = previewState.matchIndex;
            renderPreviewView();
        }
    }

    function destroy() {
        inputAreaResizeObserver?.disconnect();
        window.removeEventListener('resize', syncDockOffset);
    }

    return {
        openPreview,
        closePreview,
        handleBodyClick,
        destroy,
    };
}