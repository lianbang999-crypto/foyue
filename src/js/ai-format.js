const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

// 净土百问风格的推荐提问库
const QUESTION_POOL = [
    { question: '念佛时妄念很多怎么办', source: '净土百问' },
    { question: '有罪业的人还能往生净土吗', source: '净土百问' },
    { question: '临终助念需要做哪些准备', source: '净土百问' },
    { question: '什么是信愿行三资粮', source: '净土百问' },
    { question: '平时工作忙该怎么念佛', source: '净土百问' },
    { question: '为什么说净土法门是末法最契机的法门', source: '净土百问' },
    { question: '念佛号是大声好还是默念好', source: '净土百问' },
    { question: '什么是带业往生', source: '净土百问' },
    { question: '如何理解阿弥陀佛四十八大愿', source: '净土百问' },
    { question: '散心念佛有没有功德', source: '净土百问' },
    { question: '往生品位高低取决于什么', source: '净土百问' },
    { question: '如何发起真实的出离心', source: '净土百问' },
    { question: '亲人不信佛我该怎么做', source: '净土百问' },
    { question: '梦中念佛是不是好现象', source: '净土百问' },
    { question: '念佛和诵经如何分配时间', source: '净土百问' },
    { question: '什么是一心不乱', source: '净土百问' },
    { question: '在家居士如何修行净土法门', source: '净土百问' },
    { question: '如何克服念佛中的昏沉', source: '净土百问' },
    { question: '净土法门和禅宗有什么区别', source: '净土百问' },
    { question: '回向是什么意思，怎么回向', source: '净土百问' },
    { question: '业障深重的人怎么忏悔', source: '净土百问' },
    { question: '佛说的极乐世界到底是什么样的', source: '净土百问' },
    { question: '念佛要念多少才够', source: '净土百问' },
    { question: '什么叫至诚心、深心、回向发愿心', source: '净土百问' },
    { question: '念佛之外还需要做其他功课吗', source: '净土百问' },
    { question: '如何理解「是心作佛，是心是佛」', source: '净土百问' },
    { question: '家人生病时怎么帮他念佛', source: '净土百问' },
    { question: '打佛七有什么特别的意义', source: '净土百问' },
    { question: '普通人临终时会经历什么', source: '净土百问' },
    { question: '如何坚持每天念佛不退转', source: '净土百问' },
];

function getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，还在用功呢';
    if (h < 9) return '早安，新的一天';
    if (h < 12) return '上午好';
    if (h < 14) return '午安';
    if (h < 18) return '下午好';
    if (h < 21) return '晚上好';
    return '夜深了，早点休息';
}

// 随机取 n 个不重复的问题
function pickRandomQuestions(n = 4) {
    const pool = [...QUESTION_POOL];
    const result = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        result.push(pool.splice(idx, 1)[0]);
    }
    return result;
}

export function buildWelcomeHTML() {
    const greeting = getGreeting();
    const questions = pickRandomQuestions(4);
    const chips = questions.map(item =>
        `<button class="ai-suggest-chip ai-suggest-card" data-source="${escapeHtml(item.source)}" data-question="${escapeHtml(item.question)}">
                        <span class="ai-suggest-source">${escapeHtml(item.source)}</span>
                        <span class="ai-suggest-text">${escapeHtml(item.question)}</span>
                        <span class="ai-chip-arrow">›</span>
                </button>`
    ).join('\n        ');

    return `
    <div class="ai-welcome">
            <p class="ai-welcome-kicker">法音 AI · 只引用文库原文</p>
      <h1>${greeting}</h1>
            <p>你提问，我从法师讲记里找原文，标出出处，再带你回到文库对应段落。</p>
    </div>
    <div class="ai-suggestions">
            <p class="ai-suggestions-label">从净土百问开始</p>
      <div class="ai-suggestions-list">
        ${chips}
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