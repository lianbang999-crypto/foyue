const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

export function buildWelcomeHTML() {
    return `
    <div class="ai-welcome">
      <h1>法音AI</h1>
      <p>以大安法师开示为根，引经据典为您解答净土疑问</p>
    </div>
    <div class="ai-suggestions">
      <p class="ai-suggestions-label">可以这样问</p>
      <div class="ai-suggestions-list">
        <button class="ai-suggest-chip ai-suggest-card">有罪业的人还能往生净土吗<span class="ai-chip-arrow">›</span></button>
        <button class="ai-suggest-chip ai-suggest-card">临终助念需要做哪些准备<span class="ai-chip-arrow">›</span></button>
        <button class="ai-suggest-chip ai-suggest-card">专称念佛和兼修哪个更殊胜<span class="ai-chip-arrow">›</span></button>
        <button class="ai-suggest-chip ai-suggest-card">什么是念佛功夫成片<span class="ai-chip-arrow">›</span></button>
      </div>
    </div>`;
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
        return {
            href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
            isExternal: false,
            docId: parsed.pathname === '/wenku' ? (parsed.searchParams.get('doc') || '').trim() : '',
            query: parsed.searchParams.get('q') || '',
        };
    }

    if (value.startsWith('./') || value.startsWith('../')) {
        const parsed = new URL(value, window.location.origin);
        return {
            href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
            isExternal: false,
            docId: parsed.pathname === '/wenku' ? (parsed.searchParams.get('doc') || '').trim() : '',
            query: parsed.searchParams.get('q') || '',
        };
    }

    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const isExternal = parsed.origin !== window.location.origin;
            return {
                href: isExternal ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`,
                isExternal,
                docId: !isExternal && parsed.pathname === '/wenku' ? (parsed.searchParams.get('doc') || '').trim() : '',
                query: !isExternal ? (parsed.searchParams.get('q') || '') : '',
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
    return s;
}

export function formatAnswer(text) {
    if (!text) return '';
    const lines = text.split('\n');
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