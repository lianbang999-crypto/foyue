const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

const SUGGESTIONS = [
    '念佛时妄念多怎么办',
    '什么是信愿行',
    '临终助念要注意什么',
];

const BOT_MODE_LABELS = Object.freeze({
    answer: '文库回答',
    partial: '部分回答',
    search_only: '文库检索',
    no_result: '未找到直接依据',
});

const BOT_MODE_DETAILS = Object.freeze({
    partial: '仅保留已生成片段，请优先核对原文',
    search_only: '先看相关原文，再决定是否继续追问',
    no_result: '这次检索没有找到可直接支持结论的原文',
});

const DOWNGRADE_REASON_PRESENTATION = Object.freeze({
    insufficient_evidence: {
        label: '证据不足',
        detail: '当前证据更适合先返回相关原文，再决定是否继续追问。',
    },
    invalid_citation: {
        label: '引用校验未通过',
        detail: '这次回答没有通过最小引用校验，已回退为相关原文检索结果。',
    },
    no_documents: {
        label: '暂无直接原文',
        detail: '当前未检索到可直接支撑回答的文库原文。',
    },
    answer_generation_empty: {
        label: '未生成稳定回答',
        detail: '这次没有形成稳定回答，建议换个问法或先查看相关原文。',
    },
    answer_generation_failed: {
        label: '回答生成失败',
        detail: '这次回答生成失败，已回退到更保守的展示方式。',
    },
    stream_interrupted: {
        label: '回答中断',
        detail: '回答生成过程中断，仅保留已生成片段供参考。',
    },
});

const UNCERTAINTY_LEVELS = new Set(['low', 'medium', 'high']);
const DEFAULT_WENKU_ORIGIN = 'https://foyue.org';

function normalizeDisplayText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeNumeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getWenkuLinkOrigin() {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return DEFAULT_WENKU_ORIGIN;
}

function pickFirstText(...values) {
    for (const value of values) {
        const normalized = normalizeDisplayText(value);
        if (normalized) return normalized;
    }
    return '';
}

function pickFirstNumeric(...values) {
    for (const value of values) {
        const normalized = normalizeNumeric(value);
        if (normalized !== null) return normalized;
    }
    return null;
}

function toRelativeHref(url) {
    return `${url.pathname}${url.search}${url.hash}`;
}

function parseRelativeUrl(href) {
    const value = normalizeDisplayText(href);
    if (!value) return null;

    try {
        return new URL(value, getWenkuLinkOrigin());
    } catch {
        return null;
    }
}

export function buildAiWenkuLink({ docId = '', query = '', location = null, href = '' } = {}) {
    const sourceLocation = location && typeof location === 'object' ? location : null;
    const parsedHref = parseRelativeUrl(sourceLocation?.href || href);
    const hasWenkuHref = parsedHref?.pathname === '/wenku';
    const targetUrl = hasWenkuHref
        ? parsedHref
        : new URL('/wenku', getWenkuLinkOrigin());

    const resolvedDocId = pickFirstText(targetUrl.searchParams.get('doc'), docId);
    const resolvedQuery = pickFirstText(
        targetUrl.searchParams.get('q'),
        query,
        sourceLocation?.previewQuery,
        sourceLocation?.preview_query,
    );
    const paragraphIndex = pickFirstNumeric(
        sourceLocation?.paragraphIndex,
        sourceLocation?.paragraph_index,
    );
    const paragraphOffset = pickFirstNumeric(
        sourceLocation?.paragraphOffset,
        sourceLocation?.paragraph_offset,
    );
    const matchText = pickFirstText(
        sourceLocation?.anchorText,
        sourceLocation?.anchor_text,
        sourceLocation?.matchText,
        sourceLocation?.match_text,
        targetUrl.searchParams.get('mt'),
    );

    if (resolvedDocId) {
        targetUrl.searchParams.set('doc', resolvedDocId);
    }

    if (resolvedQuery) {
        targetUrl.searchParams.set('q', resolvedQuery);
    } else if (!targetUrl.searchParams.get('q')) {
        targetUrl.searchParams.delete('q');
    }

    targetUrl.searchParams.set('from', pickFirstText(targetUrl.searchParams.get('from')) || 'ai');

    if (paragraphIndex !== null) {
        targetUrl.searchParams.set('pi', String(paragraphIndex));
    }

    if (paragraphOffset !== null) {
        targetUrl.searchParams.set('po', String(paragraphOffset));
    }

    if (matchText) {
        targetUrl.searchParams.set('mt', matchText);
    }

    return {
        href: resolvedDocId ? toRelativeHref(targetUrl) : '',
        docId: resolvedDocId,
        query: resolvedQuery,
        paragraphIndex: paragraphIndex ?? pickFirstNumeric(targetUrl.searchParams.get('pi')),
        paragraphOffset: paragraphOffset ?? pickFirstNumeric(targetUrl.searchParams.get('po')),
        matchText,
    };
}

function normalizeCitationId(value) {
    const normalized = normalizeDisplayText(value).toUpperCase().replace(/\s+/g, '');
    const match = /^S(\d+)$/.exec(normalized);
    if (!match) return '';
    return `S${Number.parseInt(match[1], 10)}`;
}

function normalizeCitationIdList(values, maxLength = 4) {
    const items = Array.isArray(values)
        ? values
        : typeof values === 'string'
            ? values.split(/[\s,，、|]+/)
            : [];

    const normalized = [];
    const seen = new Set();

    for (const value of items) {
        const citationId = normalizeCitationId(value);
        if (!citationId || seen.has(citationId)) continue;
        seen.add(citationId);
        normalized.push(citationId);
        if (normalized.length >= maxLength) break;
    }

    return normalized;
}

function normalizeClaimMapEntry(entry, knownCitationIds) {
    if (!entry || typeof entry !== 'object') return null;

    const claim = normalizeDisplayText(entry.claim || entry.summary || entry.text);
    const citationIds = normalizeCitationIdList(
        entry.citationIds || entry.citation_ids || entry.citations || entry.sources,
        4,
    ).filter((citationId) => !knownCitationIds.size || knownCitationIds.has(citationId));

    if (!claim || !citationIds.length) return null;
    return { claim, citationIds };
}

function normalizeEvidenceItem(item, question, origin) {
    if (!item || typeof item !== 'object') return null;

    const previewQuery = normalizeDisplayText(item.preview_query || item.previewQuery || question);
    const refIndex = normalizeNumeric(item.ref_index ?? item.refIndex);
    const citationId = normalizeCitationId(item.citation_id || item.citationId || item.id || (refIndex ? `S${refIndex}` : ''));
    const normalized = {
        title: normalizeDisplayText(item.title),
        doc_id: normalizeDisplayText(item.doc_id || item.docId),
        score: normalizeNumeric(item.score),
        category: normalizeDisplayText(item.category),
        series_name: normalizeDisplayText(item.series_name || item.seriesName),
        audio_series_id: normalizeDisplayText(item.audio_series_id || item.audioSeriesId),
        audio_episode_num: normalizeNumeric(item.audio_episode_num ?? item.audioEpisodeNum),
        snippet: normalizeDisplayText(item.snippet || item.quote),
        preview_query: previewQuery,
        ref_index: refIndex,
        citation_id: citationId,
        location: item.location && typeof item.location === 'object' ? item.location : null,
        origin,
    };

    if (!normalized.title && !normalized.doc_id && !normalized.snippet) return null;
    return normalized;
}

function normalizeEvidenceList(items, question, origin, maxLength = 3) {
    if (!Array.isArray(items)) return [];

    const highlightQuery = extractHighlightQuery(question);
    const normalized = [];
    const seen = new Set();

    for (const item of items) {
        const next = normalizeEvidenceItem(item, highlightQuery, origin);
        if (!next) continue;

        const key = `${next.citation_id || next.doc_id || next.title}|${next.snippet}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(next);

        if (normalized.length >= maxLength) break;
    }

    return normalized;
}

export function normalizeAnswerMode(mode) {
    if (mode === 'partial' || mode === 'search_only' || mode === 'no_result') return mode;
    return 'answer';
}

export function getDowngradeReasonPresentation(reason) {
    const normalized = normalizeDisplayText(reason);
    return normalized ? (DOWNGRADE_REASON_PRESENTATION[normalized] || null) : null;
}

export function normalizeUncertainty(uncertainty, mode = 'answer', downgradeReason = null) {
    const normalizedMode = normalizeAnswerMode(mode);
    const fallbackReason = normalizeDisplayText(downgradeReason);
    const fallbackPresentation = getDowngradeReasonPresentation(fallbackReason);

    if (!uncertainty || typeof uncertainty !== 'object') {
        if (normalizedMode === 'answer' && !fallbackPresentation) return null;

        const fallbackLevel = normalizedMode === 'partial' || normalizedMode === 'no_result'
            ? 'high'
            : normalizedMode === 'search_only'
                ? 'medium'
                : 'low';

        return {
            level: fallbackLevel,
            message: fallbackPresentation?.detail || BOT_MODE_DETAILS[normalizedMode] || '',
            retrievalConfidence: null,
            citationCount: null,
            claimCount: null,
            reason: fallbackReason || null,
        };
    }

    const reason = normalizeDisplayText(uncertainty.reason || fallbackReason) || null;
    const reasonPresentation = getDowngradeReasonPresentation(reason);
    return {
        level: UNCERTAINTY_LEVELS.has(uncertainty.level) ? uncertainty.level : (normalizedMode === 'answer' ? 'low' : 'medium'),
        message: normalizeDisplayText(uncertainty.message) || reasonPresentation?.detail || BOT_MODE_DETAILS[normalizedMode] || '',
        retrievalConfidence: normalizeNumeric(uncertainty.retrievalConfidence),
        citationCount: normalizeNumeric(uncertainty.citationCount),
        claimCount: normalizeNumeric(uncertainty.claimCount),
        reason,
    };
}

export function formatConfidenceHint(confidence) {
    const numeric = Number(confidence);
    if (!Number.isFinite(numeric)) return '';

    const ratio = Math.max(0, Math.min(1, numeric));
    return `依据匹配约 ${Math.round(ratio * 100)}%`;
}

export function getAnswerModePresentation(mode, confidence, options = {}) {
    const normalizedMode = normalizeAnswerMode(mode);
    const uncertainty = normalizeUncertainty(options.uncertainty, normalizedMode, options.downgradeReason);
    const downgrade = getDowngradeReasonPresentation(options.downgradeReason || uncertainty?.reason);

    let detail;
    if (normalizedMode === 'answer') {
        // 简化：answer 模式不再显示百分比，只显示"已附出处"
        detail = '已附出处';
    } else {
        detail = downgrade?.label || BOT_MODE_DETAILS[normalizedMode];
    }

    return {
        mode: normalizedMode,
        label: BOT_MODE_LABELS[normalizedMode],
        detail,
        uncertainty,
        downgrade,
    };
}

export function normalizeEvidenceItems({ citations = [], sources = [], question = '' } = {}) {
    const citationItems = normalizeEvidenceList(citations, question, 'citation');
    if (citationItems.length) {
        return {
            items: citationItems,
            source: 'citations',
        };
    }

    return {
        items: normalizeEvidenceList(sources, question, 'source'),
        source: 'sources',
    };
}

export function normalizeClaimMapItems({ claimMap = [], citations = [], maxLength = 4 } = {}) {
    if (!Array.isArray(claimMap)) return [];

    const knownCitationIds = new Set(
        (Array.isArray(citations) ? citations : [])
            .map((item) => {
                if (typeof item === 'string') return normalizeCitationId(item);
                return normalizeCitationId(
                    item?.citation_id
                    || item?.citationId
                    || item?.id
                    || (item?.ref_index ? `S${item.ref_index}` : '')
                    || (item?.refIndex ? `S${item.refIndex}` : ''),
                );
            })
            .filter(Boolean),
    );

    const normalized = [];
    const seen = new Set();

    for (const entry of claimMap) {
        const next = normalizeClaimMapEntry(entry, knownCitationIds);
        if (!next) continue;

        const key = `${next.claim}|${next.citationIds.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(next);

        if (normalized.length >= maxLength) break;
    }

    return normalized;
}

export function mergeQuestionSuggestions(rewriteSuggestions = [], followUps = [], maxCount = 4) {
    const merged = [];
    const seen = new Set();

    // LLM 生成的追问优先，然后是模板化建议
    for (const value of [...followUps, ...rewriteSuggestions]) {
        const normalized = String(value || '').trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        merged.push(normalized);
        if (merged.length >= maxCount) break;
    }

    return merged;
}

export function summarizeEvidenceSnippet(snippet, maxLength = 120) {
    const normalized = String(snippet || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildWelcomeContextQuestion(context = {}) {
    const episodeNum = Number.isFinite(Number(context?.episodeNum)) && Number(context.episodeNum) > 0
        ? Number(context.episodeNum)
        : null;
    if (episodeNum) {
        return `请结合我正在听的第${episodeNum}讲，概括这一讲的要点。`;
    }
    return '请结合我正在听的内容，概括这一段开示的要点。';
}

export function buildWelcomeHTML(options = {}) {
    const normalizedOptions = Array.isArray(options) ? { questions: options } : (options || {});
    const list = ((normalizedOptions.questions && normalizedOptions.questions.length > 0)
        ? normalizedOptions.questions
        : SUGGESTIONS).slice(0, 3);
    const context = normalizedOptions.context && normalizedOptions.context.seriesId
        ? normalizedOptions.context
        : null;
    const tags = list.map(t =>
        `<button class="ai-hot-tag" data-question="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ).join('');
    const contextBlock = context
        ? `<div class="ai-welcome-context">
                <div class="ai-welcome-context-meta">
                    <p class="ai-welcome-label">当前在听</p>
                    <p class="ai-welcome-context-title">${context.episodeNum ? `第 ${escapeHtml(String(context.episodeNum))} 讲` : '当前内容'}</p>
                    <p class="ai-welcome-context-sub">顺着正在听的开示继续问。</p>
                </div>
                <button class="ai-hot-tag ai-hot-tag--primary" data-question="${escapeHtml(buildWelcomeContextQuestion(context))}">继续问本讲</button>
            </div>`
        : '';
    return `
    <div class="ai-welcome">
            <div class="ai-welcome-copy">
                <h1>你现在有什么疑问？</h1>
                <p class="ai-welcome-sub">直接提问，回答附出处。</p>
            </div>
            ${contextBlock}
            <div class="ai-welcome-group">
                <p class="ai-welcome-label">常见困惑</p>
                <div class="ai-suggestions">${tags}</div>
            </div>
    </div>`;
}

export function renderSearchResults(results, keywords, question, audioResults) {
    const hasAudio = audioResults && audioResults.length > 0;
    const hasDocs = results && results.length > 0;

    if (!hasAudio && !hasDocs) {
        return `<div class="ai-no-results">
            <p>暂未找到相关内容</p>
            <p class="ai-no-results-hint">试试换个关键词，或用更具体的描述</p>
        </div>`;
    }

    let html = '';

    // 音频匹配结果
    if (hasAudio) {
        html += '<div class="ai-audio-results">';
        for (const item of audioResults) {
            const epInfo = item.total_episodes ? `${item.total_episodes}讲` : '';
            html += `<a class="ai-audio-item" href="/?series=${encodeURIComponent(item.series_id)}">
                <svg class="ai-audio-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span class="ai-audio-title">${escapeHtml(item.title)}</span>
                ${epInfo ? `<span class="ai-audio-meta">${epInfo}</span>` : ''}
            </a>`;
        }
        html += '</div>';
    }

    // 讲记搜索结果
    if (hasDocs) {
        if (hasAudio) {
            html += '<div class="ai-section-divider"><span>相关开示</span></div>';
        }
        html += '<div class="ai-results-list">';
        for (const item of results) {
            const highlightedSnippet = highlightKeywords(escapeHtml(item.snippet), keywords);
            const hasAudioLink = item.audio_series_id && item.audio_episode_num;
            const source = item.series_name
                ? `${escapeHtml(item.series_name)}${item.audio_episode_num ? ` · 第${item.audio_episode_num}讲` : ''}`
                : '';
            const wenkuLink = buildAiWenkuLink({
                docId: item.doc_id,
                query: item.preview_query || question,
                location: item.location,
            });
            const snippetAttr = item.snippet ? ` data-snippet="${escapeHtml(item.snippet)}"` : '';

            html += `<div class="ai-quote-block" data-doc-id="${escapeHtml(item.doc_id)}">
                <blockquote class="ai-quote-text">${highlightedSnippet}</blockquote>
                <div class="ai-quote-footer">
                    ${source ? `<cite class="ai-quote-source">— ${source}</cite>` : ''}
                    <span class="ai-quote-actions">
                        ${hasAudioLink
                    ? `<a class="ai-result-play" href="/?series=${encodeURIComponent(item.audio_series_id)}&ep=${item.audio_episode_num}" data-series="${escapeHtml(item.audio_series_id)}" data-ep="${item.audio_episode_num}" title="播放此讲">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
                        </a>`
                    : ''}
                        ${wenkuLink.href
                    ? `<a class="ai-result-read" href="${escapeHtml(wenkuLink.href)}"${snippetAttr} title="读讲记">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                        </a>`
                    : ''}
                    </span>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    return html;
}

function highlightKeywords(escapedText, keywords) {
    if (!keywords || !keywords.length) return escapedText;
    const pattern = keywords.map(k => escapeRegExp(k)).join('|');
    if (!pattern) return escapedText;
    return escapedText.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(str) {
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function sanitizeMarkdownHref(href) {
    const value = String(href || '').trim();
    if (!value) return null;

    if (value.startsWith('#') || value.startsWith('?') || value.startsWith('/')) {
        const parsed = new URL(value, window.location.origin);
        const normalizedHref = parsed.pathname === '/wenku'
            ? (buildAiWenkuLink({ href: `${parsed.pathname}${parsed.search}${parsed.hash}` }).href || `${parsed.pathname}${parsed.search}${parsed.hash}`)
            : `${parsed.pathname}${parsed.search}${parsed.hash}`;
        const normalizedUrl = new URL(normalizedHref, window.location.origin);
        return {
            href: normalizedHref,
            isExternal: false,
            docId: normalizedUrl.pathname === '/wenku' ? (normalizedUrl.searchParams.get('doc') || '').trim() : '',
            query: normalizedUrl.searchParams.get('q') || '',
        };
    }

    if (value.startsWith('./') || value.startsWith('../')) {
        const parsed = new URL(value, window.location.origin);
        const normalizedHref = parsed.pathname === '/wenku'
            ? (buildAiWenkuLink({ href: `${parsed.pathname}${parsed.search}${parsed.hash}` }).href || `${parsed.pathname}${parsed.search}${parsed.hash}`)
            : `${parsed.pathname}${parsed.search}${parsed.hash}`;
        const normalizedUrl = new URL(normalizedHref, window.location.origin);
        return {
            href: normalizedHref,
            isExternal: false,
            docId: normalizedUrl.pathname === '/wenku' ? (normalizedUrl.searchParams.get('doc') || '').trim() : '',
            query: normalizedUrl.searchParams.get('q') || '',
        };
    }

    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const isExternal = parsed.origin !== window.location.origin;
            const normalizedHref = !isExternal && parsed.pathname === '/wenku'
                ? (buildAiWenkuLink({ href: `${parsed.pathname}${parsed.search}${parsed.hash}` }).href || `${parsed.pathname}${parsed.search}${parsed.hash}`)
                : (isExternal ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`);
            const normalizedUrl = !isExternal ? new URL(normalizedHref, window.location.origin) : parsed;
            return {
                href: normalizedHref,
                isExternal,
                docId: !isExternal && normalizedUrl.pathname === '/wenku' ? (normalizedUrl.searchParams.get('doc') || '').trim() : '',
                query: !isExternal ? (normalizedUrl.searchParams.get('q') || '') : '',
            };
        }
    } catch {
        return null;
    }

    return null;
}

function inlineFormat(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
        const linkMeta = sanitizeMarkdownHref(decodeHtmlEntities(href));
        if (!linkMeta) return label;
        const escapedHref = escapeHtml(linkMeta.href);
        const escapedQuery = linkMeta.query ? ` data-query="${escapeHtml(linkMeta.query)}"` : '';
        if (linkMeta.docId) {
            return `<a href="${escapedHref}" class="ai-inline-link ai-inline-source-link" data-doc-id="${escapeHtml(linkMeta.docId)}"${escapedQuery}>${label}</a>`;
        }
        if (linkMeta.isExternal) {
            return `<a href="${escapedHref}" class="ai-inline-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        return `<a href="${escapedHref}" class="ai-inline-link">${label}</a>`;
    });
    s = s.replace(/\[(S\d+)\](?!\()/gi, (_match, rawId) => {
        const citationId = normalizeCitationId(rawId);
        if (!citationId) return _match;
        return `<span class="ai-inline-citation" data-citation-id="${escapeHtml(citationId)}">${escapeHtml(citationId)}</span>`;
    });
    return s;
}

export function formatAnswer(text) {
    if (!text) return '';
    // 剥离来源标注（来源已独立展示为按钮，无需内联显示）
    // 匹配 "——资料N，出处名称" 整行 和 "（资料N）" 内联
    let cleaned = text.replace(/^[\u2014\u2500\-]{1,3}\s*资料\s*\d+[，,、\s].*$/gm, '');
    cleaned = cleaned.replace(/[（(]\s*资料\s*\d+\s*[）)]/g, '');
    const lines = cleaned.split('\n');
    let html = '';
    let inQuote = false;
    let inList = false;
    let inOl = false;
    let inCode = false;
    let codeLang = '';

    for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            if (inCode) {
                html += '</code></pre>';
                inCode = false;
                codeLang = '';
            } else {
                closeLists();
                if (inQuote) {
                    html += '</blockquote>';
                    inQuote = false;
                }
                codeLang = trimmed.slice(3).trim();
                html += `<pre class="ai-code-block"><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>`;
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            html += escapeHtml(line) + '\n';
            continue;
        }

        if (!trimmed) {
            closeLists();
            if (inQuote) {
                html += '</blockquote>';
                inQuote = false;
            }
            continue;
        }

        const headMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
        if (headMatch) {
            closeLists();
            if (inQuote) {
                html += '</blockquote>';
                inQuote = false;
            }
            const level = Math.min(headMatch[1].length + 2, 6);
            html += `<h${level}>${inlineFormat(headMatch[2])}</h${level}>`;
            continue;
        }

        const ulMatch = trimmed.match(/^[-*•]\s+(.+)/);
        if (ulMatch) {
            if (inOl) {
                html += '</ol>';
                inOl = false;
            }
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${inlineFormat(ulMatch[1])}</li>`;
            continue;
        }

        const olMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
        if (olMatch) {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            if (!inOl) {
                html += '<ol>';
                inOl = true;
            }
            html += `<li>${inlineFormat(olMatch[1])}</li>`;
            continue;
        }

        closeLists();

        const bqMatch = trimmed.match(/^>\s*(.*)/);
        const isQuoteLine = bqMatch || /^[\u201C\u201D"\u300A""]/.test(trimmed);
        const isSourceLine = /^[\u2014\u2500\-]{1,3}/.test(trimmed);

        if (isQuoteLine) {
            if (!inQuote) {
                html += '<blockquote>';
                inQuote = true;
            }
            html += `<p>${inlineFormat(bqMatch ? bqMatch[1] : trimmed)}</p>`;
        } else if (isSourceLine && inQuote) {
            html += `<cite>${escapeHtml(trimmed)}</cite></blockquote>`;
            inQuote = false;
        } else {
            if (inQuote) {
                html += '</blockquote>';
                inQuote = false;
            }
            html += `<p>${inlineFormat(trimmed)}</p>`;
        }
    }

    if (inCode) html += '</code></pre>';
    closeLists();
    if (inQuote) html += '</blockquote>';
    return html;

    function closeLists() {
        if (inList) {
            html += '</ul>';
            inList = false;
        }
        if (inOl) {
            html += '</ol>';
            inOl = false;
        }
    }
}

export function extractFollowUps(text) {
    const match = text.match(/\[FOLLOWUP\](.*?)\[\/FOLLOWUP\]/s);
    if (!match) return { cleanText: text, followUps: [] };
    const cleanText = text.replace(/\[FOLLOWUP\].*?\[\/FOLLOWUP\]/s, '').trim();
    const followUps = match[1].split('|').map(q => q.trim()).filter(q => q.length > 0 && q.length < 100);
    return { cleanText, followUps };
}

// 仅清理 FOLLOWUP 标签，不解析内容
export function stripFollowUpTags(text) {
    return String(text || '').replace(/\[FOLLOWUP\][\s\S]*?(?:\[\/FOLLOWUP\]|$)/s, '').trim();
}

export function extractHighlightQuery(question) {
    if (!question) return '';
    STOP_WORDS_RE.lastIndex = 0;
    const cleaned = question.replace(STOP_WORDS_RE, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || question;
}

export function renderHighlightedParagraph(text, terms) {
    if (!terms.length) return escapeHtml(text);

    const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'g');
    return text
        .split(regex)
        .map(segment => {
            if (!segment) return '';
            return terms.includes(segment)
                ? `<mark>${escapeHtml(segment)}</mark>`
                : escapeHtml(segment);
        })
        .join('');
}