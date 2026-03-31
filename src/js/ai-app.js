/* ===== 法音AI 独立页面入口 ===== */
import '../css/ai-page.css';
import { syncSystemTheme } from './theme.js';
import { askQuestionStream } from './ai-client.js';
import { getWenkuDocument } from './wenku-api.js';

const AI_CONTEXT_KEY = 'ai-latest-context';

/* --- 常量 --- */
const MAX_INPUT_LEN = 500;
const MAX_MESSAGES = 50;
const MAX_PERSIST = 20;
const MAX_CONVERSATIONS = 20;
const LS_KEY = 'ai-page-history';       // 废弃的旧 key（迁移用）
const LS_CONV_KEY = 'ai-conversations'; // 新 key
const CHAR_WARN_RATIO = 0.85;
const THEME_COLORS = {
    light: '#F7F5F0',
    dark: '#1A1614',
};

/* --- 多对话管理 --- */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadConversations() {
    try {
        const raw = localStorage.getItem(LS_CONV_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr.slice(0, MAX_CONVERSATIONS);
        }
    } catch { /* ignore */ }

    // 迁移旧格式
    try {
        const old = localStorage.getItem(LS_KEY);
        if (old) {
            const msgs = JSON.parse(old);
            if (Array.isArray(msgs) && msgs.length) {
                const first = msgs.find(m => m.role === 'user');
                const conv = {
                    id: generateId(),
                    title: first ? first.content.slice(0, 20) : '旧对话',
                    messages: msgs.slice(-MAX_PERSIST),
                    updatedAt: Date.now(),
                };
                localStorage.removeItem(LS_KEY);
                return [conv];
            }
        }
    } catch { /* ignore */ }

    return [];
}

function saveConversations() {
    try {
        localStorage.setItem(LS_CONV_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
    } catch { /* quota exceeded */ }
}

let conversations = loadConversations();
let activeConvId = conversations[0]?.id || null;

function getActiveConv() {
    return conversations.find(c => c.id === activeConvId) || null;
}

function ensureActiveConv() {
    if (!getActiveConv()) {
        const conv = { id: generateId(), title: '', messages: [], updatedAt: Date.now() };
        conversations.unshift(conv);
        activeConvId = conv.id;
    }
    return getActiveConv();
}

/* --- 状态 --- */
let isLoading = false;
let _lastQuestion = '';
let aiContext = loadAiContext();

/* 兼容性：chatHistory 代理到当前对话 */
function getChatHistory() {
    const conv = getActiveConv();
    return conv ? conv.messages : [];
}

/* --- DOM 引用 --- */
const chatArea = document.getElementById('chatArea');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const btnClear = document.getElementById('btnClear');
const charCount = document.getElementById('charCount');
const previewDrawer = document.getElementById('previewDrawer');
const previewBackdrop = document.getElementById('previewBackdrop');
const previewTitle = document.getElementById('previewTitle');
const previewMeta = document.getElementById('previewMeta');
const previewBody = document.getElementById('previewBody');
const previewOpenBtn = document.getElementById('previewOpenBtn');
const previewCloseBtn = document.getElementById('previewClose');

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

function init() {
    renderWelcomeOrHistory();
    renderConvList();
    wireEvents();
    syncSystemTheme(THEME_COLORS);
    initOfflineDetection();
}

/* --- 事件绑定 --- */
function wireEvents() {
    // 输入框自动调整高度 + 发送按钮状态 + 字数计数
    chatInput.addEventListener('input', () => {
        autoResize();
        updateCharCount();
        btnSend.disabled = !chatInput.value.trim();
    });

    // Enter 发送，Shift+Enter 换行
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // 发送按钮
    btnSend.addEventListener('click', handleSubmit);

    // 清空当前对话
    btnClear.addEventListener('click', () => {
        const conv = getActiveConv();
        if (!conv || !conv.messages.length) return;
        if (!confirm('确定清空当前对话的所有消息？')) return;
        conv.messages = [];
        conv.title = '';
        saveConversations();
        renderWelcomeOrHistory();
        renderConvList();
    });

    // 分享
    document.getElementById('btnShare')?.addEventListener('click', () => {
        const title = '法音AI · 净土智慧问答';
        const url = location.href;
        if (navigator.share) {
            navigator.share({ title, url }).catch(err => {
                if (err.name === 'AbortError') return;
                _aiCopy(title + '\n' + url, '链接已复制');
            });
        } else {
            _aiCopy(title + '\n' + url, '链接已复制');
        }
    });

    previewBackdrop?.addEventListener('click', closeWenkuPreview);
    previewCloseBtn?.addEventListener('click', closeWenkuPreview);
    previewBody?.addEventListener('click', handlePreviewBodyClick);

    // 推荐问题点击（事件委托）
    chatArea.addEventListener('click', (e) => {
        const chip = e.target.closest('.ai-suggest-chip');
        if (chip) {
            // 卡片模式取最后一个 span 文本，否则取全文本
            const spans = chip.querySelectorAll('span');
            const text = spans.length > 1 ? spans[spans.length - 1].textContent.trim() : chip.textContent.trim();
            chatInput.value = text;
            btnSend.disabled = false;
            handleSubmit();
            return;
        }

        // 来源标签 → 跳转文库
        const tag = e.target.closest('.ai-source-tag');
        if (tag) {
            e.preventDefault();
            const docId = tag.dataset.docId;
            const query = tag.dataset.query || _lastQuestion;
            if (docId) {
                openWenkuPreview(docId, query, tag.textContent.trim());
            }
            return;
        }

        // 重试按钮
        const retry = e.target.closest('.ai-retry-btn');
        if (retry && !isLoading) {
            const question = retry.dataset.question;
            if (question) {
                const errMsg = retry.closest('.ai-message--error');
                if (errMsg) errMsg.remove();
                chatInput.value = question;
                btnSend.disabled = false;
                handleSubmit();
            }
            return;
        }

        // 消息操作按钮
        const actionBtn = e.target.closest('.ai-action-btn');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            const msgEl = actionBtn.closest('.ai-message');
            if (action === 'copy') {
                const text = msgEl.querySelector('.ai-message-content')?.innerText || '';
                _aiCopy(text, '已复制');
            } else if (action === 'regen' && !isLoading) {
                handleRegenerate(msgEl);
            } else if (action === 'good' || action === 'bad') {
                actionBtn.classList.toggle('active');
                // 反对按钮互斥
                const sibling = action === 'good' ? 'bad' : 'good';
                msgEl.querySelector(`.ai-action-btn[data-action="${sibling}"]`)?.classList.remove('active');
            }
            return;
        }
    });

    // Android 虚拟键盘适配：使用 visualViewport 动态调整
    if (window.visualViewport) {
        const app = document.getElementById('ai-app');
        const onViewportResize = () => {
            const vv = window.visualViewport;
            const offset = window.innerHeight - vv.height;
            app.style.height = vv.height + 'px';
            app.style.transform = `translateY(${vv.offsetTop}px)`;
            if (offset > 50) scrollToBottom(); // 键盘弹起时自动滚到底
        };
        window.visualViewport.addEventListener('resize', onViewportResize);
        window.visualViewport.addEventListener('scroll', onViewportResize);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (previewDrawer?.classList.contains('open')) {
                closeWenkuPreview();
                return;
            }
            if (convDrawer?.classList.contains('open')) {
                closeConvDrawer();
            }
        }
    });
}

/* --- 渲染欢迎页或历史记录 --- */
function renderWelcomeOrHistory() {
    const chatHistory = getChatHistory();
    if (chatHistory.length > 0) {
        chatArea.innerHTML = '';
        for (const [index, msg] of chatHistory.entries()) {
            const sourceQuery = msg.role === 'assistant'
                ? getMessageSourceQuery(chatHistory, index, msg)
                : '';
            addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, msg.sources, msg.disclaimer, true, index, sourceQuery);
        }
        scrollToBottom();
    } else {
        chatArea.innerHTML = buildWelcomeHTML();
    }
}

function getMessageSourceQuery(chatHistory, messageIndex, message) {
    const savedQuery = Array.isArray(message?.sources)
        ? message.sources.find(item => typeof item?.preview_query === 'string' && item.preview_query.trim())?.preview_query
        : '';

    if (savedQuery) return savedQuery.trim();

    for (let index = messageIndex - 1; index >= 0; index -= 1) {
        if (chatHistory[index]?.role === 'user') {
            return extractHighlightQuery(chatHistory[index].content || '');
        }
    }

    return '';
}

function attachSourcePreviewQuery(sources, question) {
    if (!Array.isArray(sources) || !sources.length) return [];

    const previewQuery = extractHighlightQuery(question);
    return sources.map(source => ({
        ...source,
        preview_query: source?.preview_query || previewQuery || '',
    }));
}

/* --- 提交问题 --- */
async function handleSubmit(options = {}) {
    const question = (options.question ?? chatInput.value).trim();
    if (!question || isLoading) return;
    if (question.length > MAX_INPUT_LEN) return;

    // 移除欢迎内容
    const welcome = chatArea.querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    const suggestions = chatArea.querySelector('.ai-suggestions');
    if (suggestions) suggestions.remove();

    _lastQuestion = question;
    const conv = ensureActiveConv();
    if (!options.skipUserMessage) {
        addMessage('user', question, null, null, false, conv.messages.length);
        conv.messages.push({ role: 'user', content: question });
    }
    if (!conv.title) conv.title = question.slice(0, 20);

    chatInput.value = '';
    chatInput.style.height = '';
    updateCharCount();
    btnSend.disabled = true;
    isLoading = true;

    showTyping();

    try {
        let msgContent = null;
        let textEl = null;
        let fullText = '';
        const requestHistory = buildRequestHistory(conv.messages, question);

        const finalData = await askQuestionStream(
            question,
            buildAskContext(requestHistory),
            (token) => {
                if (!textEl) {
                    removeTyping();
                    const stream = createStreamingMessage();
                    msgContent = stream.msgContent;
                    textEl = stream.textEl;
                }
                fullText += token;
                textEl.textContent = fullText;
                scrollToBottom();
            }
        );

        removeTyping();
        if (!textEl) {
            const stream = createStreamingMessage();
            msgContent = stream.msgContent;
            textEl = stream.textEl;
        }

        // 完成：格式化 HTML
        textEl.classList.remove('ai-streaming');
        const { cleanText, followUps } = extractFollowUps(fullText);
        const answerText = String(finalData.answer || cleanText || '').trim();
        const finalFollowUps = Array.isArray(finalData.followUps) && finalData.followUps.length
            ? finalData.followUps
            : followUps;
        textEl.innerHTML = formatAnswer(answerText);

        const renderedSources = attachSourcePreviewQuery(finalData.sources, question);

        // 来源标签
        if (renderedSources.length) {
            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = renderedSources.map(s => renderSourceTag(s)).join(' ');
            msgContent.appendChild(srcDiv);
        }

        // 免责声明
        if (finalData.disclaimer) {
            const disc = document.createElement('p');
            disc.className = 'ai-disclaimer';
            disc.textContent = finalData.disclaimer;
            msgContent.appendChild(disc);
        }

        // 追问建议
        if (finalFollowUps.length > 0) {
            const wrap = document.createElement('div');
            wrap.className = 'ai-followups';
            finalFollowUps.forEach(q => {
                const chip = document.createElement('button');
                chip.className = 'ai-suggest-chip';
                chip.textContent = q;
                chip.addEventListener('click', () => {
                    chatInput.value = q;
                    btnSend.disabled = false;
                    handleSubmit();
                });
                wrap.appendChild(chip);
            });
            msgContent.appendChild(wrap);
        }

        // 添加操作栏 + 时间
        const parentMsg = msgContent.closest('.ai-message');
        if (parentMsg) {
            const actions = buildMsgActions();
            const time = document.createElement('time');
            time.className = 'ai-msg-time';
            time.textContent = formatMsgTime(new Date());
            actions.prepend(time);
            parentMsg.appendChild(actions);
        }

        scrollToBottom();

        // 持久化
        const answer = answerText || '抱歉，AI 暂时无法生成回答。';
        conv.messages.push({ role: 'assistant', content: answer, sources: renderedSources, disclaimer: finalData.disclaimer });
        if (conv.messages.length > MAX_PERSIST) conv.messages.splice(0, conv.messages.length - MAX_PERSIST);
        if (parentMsg) parentMsg.dataset.messageIndex = String(conv.messages.length - 1);
        conv.updatedAt = Date.now();
        saveConversations();
        renderConvList();

    } catch (err) {
        removeTyping();
        const emptyStream = chatArea.querySelector('.ai-message--bot:last-child .ai-streaming');
        if (emptyStream && !emptyStream.textContent) emptyStream.closest('.ai-message').remove();
        addErrorMessage(err.message || '请求失败，请稍后再试', question);
    } finally {
        isLoading = false;
    }
}

/* --- 消息渲染 --- */
function addMessage(role, content, sources, disclaimer, silent, messageIndex, sourceQuery = '') {
    while (chatArea.children.length > MAX_MESSAGES) {
        chatArea.removeChild(chatArea.children[0]);
    }
    const msg = document.createElement('div');
    msg.className = `ai-message ai-message--${role === 'user' ? 'user' : 'bot'}`;
    if (!silent) msg.classList.add('ai-enter');
    if (Number.isInteger(messageIndex) && messageIndex >= 0) {
        msg.dataset.messageIndex = String(messageIndex);
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'ai-message-content';

    if (role === 'user') {
        contentEl.innerHTML = `<p>${escapeHtml(content)}</p>`;
    } else {
        contentEl.innerHTML = formatAnswer(content);
        if (sources?.length) {
            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = sources.map(s => renderSourceTag(s, sourceQuery)).join(' ');
            contentEl.appendChild(srcDiv);
        }
        if (disclaimer) {
            const disc = document.createElement('p');
            disc.className = 'ai-disclaimer';
            disc.textContent = disclaimer;
            contentEl.appendChild(disc);
        }
    }

    msg.appendChild(contentEl);

    // bot 消息底部操作栏 + 时间
    if (role !== 'user' && content) {
        const actions = buildMsgActions();
        const time = document.createElement('time');
        time.className = 'ai-msg-time';
        time.textContent = formatMsgTime(new Date());
        actions.prepend(time);
        msg.appendChild(actions);
    }

    chatArea.appendChild(msg);
    if (!silent) scrollToBottom();
}

/* --- 重新生成上一条 AI 回复 --- */
function handleRegenerate(msgEl) {
    const conv = getActiveConv();
    if (!conv?.messages?.length) return;

    const latestAssistantIndex = conv.messages.length - 1;
    if (latestAssistantIndex < 0 || conv.messages[latestAssistantIndex]?.role !== 'assistant') {
        showAiToast('当前没有可重新生成的回答');
        return;
    }

    const targetIndex = Number.parseInt(msgEl?.dataset?.messageIndex || '', 10);
    if (!Number.isInteger(targetIndex) || targetIndex !== latestAssistantIndex) {
        showAiToast('仅支持重新生成最后一条回答');
        return;
    }

    const questionMsg = conv.messages.slice(0, latestAssistantIndex).reverse().find(item => item.role === 'user');
    const question = questionMsg?.content?.trim();
    if (!question) return;

    conv.messages.splice(latestAssistantIndex, 1);
    conv.updatedAt = Date.now();
    saveConversations();
    renderWelcomeOrHistory();
    renderConvList();

    handleSubmit({ question, skipUserMessage: true });
}

function addErrorMessage(errText, question) {
    const msg = document.createElement('div');
    msg.className = 'ai-message ai-message--error';
    const retryHtml = question
        ? `<button class="ai-retry-btn" data-question="${escapeHtml(question)}">↩ 重试</button>`
        : '';
    msg.innerHTML = `<div class="ai-message-content"><p>${escapeHtml(errText)}</p>${retryHtml}</div>`;
    chatArea.appendChild(msg);
    scrollToBottom();
}

function createStreamingMessage() {
    const msg = document.createElement('div');
    msg.className = 'ai-message ai-message--bot';
    const msgContent = document.createElement('div');
    msgContent.className = 'ai-message-content';
    const textEl = document.createElement('div');
    textEl.className = 'ai-streaming';
    msgContent.appendChild(textEl);
    msg.appendChild(msgContent);
    chatArea.appendChild(msg);
    scrollToBottom();
    return { msgContent, textEl };
}

function showTyping() {
    const el = document.createElement('div');
    el.className = 'ai-message ai-message--bot ai-typing-msg';
    el.innerHTML = '<div class="ai-typing"><span class="ai-typing-dot"></span><span>参悟中...</span></div>';
    chatArea.appendChild(el);
    scrollToBottom();
}

function removeTyping() {
    const el = chatArea.querySelector('.ai-typing-msg');
    if (el) el.remove();
}

/* --- 来源标签渲染 --- */
function renderSourceTag(s, fallbackQuery = '') {
    const title = escapeHtml(s.title);
    if (s.doc_id) {
        const rawQuery = String(s.preview_query || s.snippet || fallbackQuery || extractHighlightQuery(_lastQuestion) || '').trim();
        const queryAttr = rawQuery ? ` data-query="${escapeHtml(rawQuery)}"` : '';
        return `<button class="ai-source-tag" data-doc-id="${escapeHtml(s.doc_id)}"${queryAttr}>${title}</button>`;
    }
    return `<span class="ai-source-tag">${title}</span>`;
}

function loadAiContext() {
    try {
        const raw = sessionStorage.getItem(AI_CONTEXT_KEY);
        if (!raw) return { seriesId: null, episodeNum: null };
        const parsed = JSON.parse(raw);
        return {
            seriesId: typeof parsed?.seriesId === 'string' && parsed.seriesId ? parsed.seriesId : null,
            episodeNum: Number.isFinite(Number(parsed?.episodeNum)) && Number(parsed.episodeNum) > 0 ? Number(parsed.episodeNum) : null,
        };
    } catch {
        return { seriesId: null, episodeNum: null };
    }
}

function buildAskContext(history) {
    const context = { history: history.slice(-6) };
    if (aiContext.seriesId) context.series_id = aiContext.seriesId;
    if (aiContext.episodeNum) context.episode_num = aiContext.episodeNum;
    return context;
}

function buildRequestHistory(messages, question) {
    const history = Array.isArray(messages) ? messages.slice() : [];
    const last = history[history.length - 1];
    if (last?.role === 'user' && String(last.content || '').trim() === String(question || '').trim()) {
        history.pop();
    }
    return history;
}

function buildWenkuUrl(docId, query) {
    return `/wenku?doc=${encodeURIComponent(docId)}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
}

async function openWenkuPreview(docId, query, fallbackTitle = '') {
    if (!previewDrawer || !previewBody || !previewOpenBtn) {
        window.location.href = buildWenkuUrl(docId, query);
        return;
    }

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
    } catch (_error) {
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

function closeWenkuPreview() {
    previewDrawer?.classList.remove('open');
    previewBackdrop?.classList.remove('open');
    previewDrawer?.setAttribute('aria-hidden', 'true');
}

function handlePreviewBodyClick(e) {
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

function extractFocusSentence(text, terms) {
    if (!text) return '';
    if (!terms.length) return text.length > 66 ? text.slice(0, 66) + '…' : text;

    const sentences = text.split(/(?<=[。！？!?])/).map(item => item.trim()).filter(Boolean);
    const hit = sentences.find(sentence => terms.some(term => sentence.includes(term)));
    if (hit) return hit;
    return text.length > 66 ? text.slice(0, 66) + '…' : text;
}

function splitPreviewParagraphs(text) {
    const blocks = String(text || '')
        .replace(/\r\n/g, '\n')
        .split(/\n\n+/)
        .map(item => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    return blocks.flatMap(splitLongPreviewBlock);
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

function hardSplitPreviewBlock(text, maxChars) {
    const chunks = [];
    for (let start = 0; start < text.length; start += maxChars) {
        chunks.push(text.slice(start, start + maxChars).trim());
    }
    return chunks.filter(Boolean);
}

function getPreviewTerms(query) {
    const raw = String(query || '').trim();
    if (!raw) return [];

    const parts = raw
        .split(/[\s，。！？、；：,.!?()[\]【】《》“”"'‘’/\\|+-]+/)
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

function renderHighlightedParagraph(text, terms) {
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

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

function extractHighlightQuery(question) {
    if (!question) return '';
    STOP_WORDS_RE.lastIndex = 0;
    const cleaned = question.replace(STOP_WORDS_RE, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || question;
}

/* --- 文本格式化（轻量 Markdown） --- */
function formatAnswer(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inQuote = false;
    let inList = false;  // ul
    let inOl = false;    // ol
    let inCode = false;
    let codeLang = '';

    for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        // 代码块 ```
        if (trimmed.startsWith('```')) {
            if (inCode) {
                html += '</code></pre>';
                inCode = false;
                codeLang = '';
            } else {
                closeLists();
                if (inQuote) { html += '</blockquote>'; inQuote = false; }
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

        // 空行
        if (!trimmed) {
            closeLists();
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            continue;
        }

        // 标题 ## 
        const headMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
        if (headMatch) {
            closeLists();
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            const level = Math.min(headMatch[1].length + 2, 6); // ##→h4, ###→h5
            html += `<h${level}>${inlineFormat(headMatch[2])}</h${level}>`;
            continue;
        }

        // 无序列表 - / * / •
        const ulMatch = trimmed.match(/^[-*•]\s+(.+)/);
        if (ulMatch) {
            if (inOl) { html += '</ol>'; inOl = false; }
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${inlineFormat(ulMatch[1])}</li>`;
            continue;
        }

        // 有序列表 1. 
        const olMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
        if (olMatch) {
            if (inList) { html += '</ul>'; inList = false; }
            if (!inOl) { html += '<ol>'; inOl = true; }
            html += `<li>${inlineFormat(olMatch[1])}</li>`;
            continue;
        }

        closeLists();

        // 引用 > 或中文引号开头
        const bqMatch = trimmed.match(/^>\s*(.*)/);
        const isQuoteLine = bqMatch || /^[\u201C\u201D"\u300A""]/.test(trimmed);
        const isSourceLine = /^[\u2014\u2500\-]{1,3}/.test(trimmed);

        if (isQuoteLine) {
            if (!inQuote) { html += '<blockquote>'; inQuote = true; }
            html += `<p>${inlineFormat(bqMatch ? bqMatch[1] : trimmed)}</p>`;
        } else if (isSourceLine && inQuote) {
            html += `<cite>${escapeHtml(trimmed)}</cite></blockquote>`;
            inQuote = false;
        } else {
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += `<p>${inlineFormat(trimmed)}</p>`;
        }
    }

    if (inCode) html += '</code></pre>';
    closeLists();
    if (inQuote) html += '</blockquote>';
    return html;

    function closeLists() {
        if (inList) { html += '</ul>'; inList = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
    }
}

/** 行内格式化：加粗、斜体、行内代码、链接 */
function inlineFormat(text) {
    let s = escapeHtml(text);
    // 行内代码 `code`
    s = s.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    // 加粗 **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体 *text*
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
        const safeHref = sanitizeMarkdownHref(decodeHtmlEntities(href));
        if (!safeHref) return label;
        return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return s;
}

function extractFollowUps(text) {
    const match = text.match(/\[FOLLOWUP\](.*?)\[\/FOLLOWUP\]/s);
    if (!match) return { cleanText: text, followUps: [] };
    const cleanText = text.replace(/\[FOLLOWUP\].*?\[\/FOLLOWUP\]/s, '').trim();
    const followUps = match[1].split('|').map(q => q.trim()).filter(q => q.length > 0 && q.length < 100);
    return { cleanText, followUps };
}

/* --- 欢迎页 HTML --- */
function buildWelcomeHTML() {
    return `
    <div class="ai-welcome">
      <svg class="ai-welcome-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 4c-1.5 2.5-2 5-2 7.5s.5 4 2 5c1.5-1 2-2.5 2-5s-.5-5-2-7.5z"/>
        <path d="M7.5 8c-2 1-3.5 3.5-3.5 6.5 0 1 .4 2 1.5 2.5"/>
        <path d="M16.5 8c2 1 3.5 3.5 3.5 6.5 0 1-.4 2-1.5 2.5"/>
        <path d="M9.5 7.5c-1.5.5-2.5 2-3 4"/>
        <path d="M14.5 7.5c1.5.5 2.5 2 3 4"/>
        <line x1="12" y1="16.5" x2="12" y2="20"/>
        <path d="M9.5 20c.7-.5 1.6-.5 2.5 0 .9-.5 1.8-.5 2.5 0"/>
      </svg>
      <h1>法音AI</h1>
      <p>基于大安法师讲经内容，为您解答净土法门相关问题。回答引用法音文库原文出处。</p>
    </div>
    <div class="ai-suggestions">
      <p class="ai-suggestions-label">试试这些问题</p>
      <div class="ai-suggestions-grid">
        <button class="ai-suggest-chip ai-suggest-card">什么是念佛法门</button>
        <button class="ai-suggest-chip ai-suggest-card">如何往生净土</button>
        <button class="ai-suggest-chip ai-suggest-card">信愿行是什么</button>
        <button class="ai-suggest-chip ai-suggest-card">临终助念方法</button>
      </div>
    </div>`;
}

/* --- 工具函数 --- */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    if (!value) return '';

    if (value.startsWith('#') || value.startsWith('?') || value.startsWith('/')) {
        return value;
    }

    if (value.startsWith('./') || value.startsWith('../')) {
        return value;
    }

    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch {
        return '';
    }

    return '';
}

function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

let _scrollRafPending = false;
function scrollToBottom() {
    if (_scrollRafPending) return;
    _scrollRafPending = true;
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
        _scrollRafPending = false;
    });
}

/* --- 消息操作栏 --- */
function formatMsgTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

function buildMsgActions() {
    const bar = document.createElement('div');
    bar.className = 'ai-msg-actions';
    bar.innerHTML = `
      <button class="ai-action-btn" data-action="copy" aria-label="复制" title="复制">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="regen" aria-label="重新生成" title="重新生成">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="good" aria-label="有帮助" title="有帮助">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="bad" aria-label="不准确" title="不准确">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 15V19a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/>
          <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
        </svg>
      </button>`;
    return bar;
}

/* --- 字数计数 --- */
function updateCharCount() {
    if (!charCount) return;
    const len = chatInput.value.length;
    if (len > MAX_INPUT_LEN * CHAR_WARN_RATIO) {
        charCount.textContent = `${len}/${MAX_INPUT_LEN}`;
        charCount.classList.add('visible');
        charCount.classList.toggle('warn', len >= MAX_INPUT_LEN);
    } else {
        charCount.classList.remove('visible', 'warn');
    }
}

/* --- 对话列表 UI --- */
const convDrawer = document.getElementById('convDrawer');
const convBackdrop = document.getElementById('convBackdrop');
const convListEl = document.getElementById('convList');
const convSearchInput = document.getElementById('convSearchInput');

document.getElementById('btnConvList')?.addEventListener('click', toggleConvDrawer);
document.getElementById('btnNewConv')?.addEventListener('click', () => {
    startNewConversation();
    closeConvDrawer();
});

convSearchInput?.addEventListener('input', () => renderConvList());
convBackdrop?.addEventListener('click', closeConvDrawer);
document.getElementById('btnExportConv')?.addEventListener('click', exportConversation);

convListEl?.addEventListener('click', (e) => {
    const del = e.target.closest('.ai-conv-del');
    if (del) {
        e.stopPropagation();
        const id = del.dataset.convId;
        const conv = conversations.find(c => c.id === id);
        const name = conv?.title || '该对话';
        if (!confirm(`确定删除「${name}」？此操作不可撤销。`)) return;
        conversations = conversations.filter(c => c.id !== id);
        if (activeConvId === id) {
            activeConvId = conversations[0]?.id || null;
            renderWelcomeOrHistory();
        }
        saveConversations();
        renderConvList();
        return;
    }
    const item = e.target.closest('.ai-conv-item');
    if (item) {
        const id = item.dataset.convId;
        if (id !== activeConvId) {
            activeConvId = id;
            // 更新 _lastQuestion 为该对话最后一个用户问题
            const switched = getActiveConv();
            const lastUserMsg = switched?.messages?.filter(m => m.role === 'user').pop();
            _lastQuestion = lastUserMsg?.content || '';
            renderWelcomeOrHistory();
            renderConvList();
        }
        closeConvDrawer();
        chatInput.focus();
    }
});

function toggleConvDrawer() {
    convDrawer?.classList.toggle('open');
    convBackdrop?.classList.toggle('open');
}

function closeConvDrawer() {
    convDrawer?.classList.remove('open');
    convBackdrop?.classList.remove('open');
    if (convDrawer) convDrawer.style.transform = '';
}

// 抽屉滑动关闭手势
(function initDrawerSwipe() {
    if (!convDrawer) return;
    let startX = 0, startY = 0, tracking = false;
    convDrawer.addEventListener('touchstart', (e) => {
        if (!convDrawer.classList.contains('open')) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
        convDrawer.style.transition = 'none';
    }, { passive: true });
    convDrawer.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        // 只处理水平向左滑
        if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
        if (dx > 0) { convDrawer.style.transform = ''; return; }
        convDrawer.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    convDrawer.addEventListener('touchend', (e) => {
        if (!tracking) { convDrawer.style.transition = ''; return; }
        tracking = false;
        convDrawer.style.transition = '';
        const dx = (e.changedTouches[0]?.clientX || startX) - startX;
        if (dx < -60) {
            closeConvDrawer();
        } else {
            convDrawer.style.transform = '';
        }
    }, { passive: true });
})();

function startNewConversation() {
    const conv = { id: generateId(), title: '', messages: [], updatedAt: Date.now() };
    conversations.unshift(conv);
    activeConvId = conv.id;
    if (conversations.length > MAX_CONVERSATIONS) conversations.length = MAX_CONVERSATIONS;
    saveConversations();
    renderWelcomeOrHistory();
    renderConvList();
    chatInput.focus();
}

function renderConvList() {
    if (!convListEl) return;
    const keyword = (convSearchInput?.value || '').trim().toLowerCase();
    let filtered = conversations;
    if (keyword) {
        filtered = conversations.filter(c =>
            (c.title || '').toLowerCase().includes(keyword) ||
            c.messages.some(m => m.content.toLowerCase().includes(keyword))
        );
    }
    if (!filtered.length) {
        convListEl.innerHTML = `<li class="ai-conv-empty">${keyword ? '无匹配对话' : '暂无对话记录'}</li>`;
        return;
    }
    convListEl.innerHTML = filtered.map(c => {
        const active = c.id === activeConvId ? ' active' : '';
        const title = escapeHtml(c.title || '新对话');
        const count = c.messages.filter(m => m.role === 'user').length;
        return `<li class="ai-conv-item${active}" data-conv-id="${c.id}">
            <span class="ai-conv-title">${title}</span>
            <span class="ai-conv-meta">${count}条</span>
            <button class="ai-conv-del" data-conv-id="${c.id}" aria-label="删除对话" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </li>`;
    }).join('');
}

/* --- 分享工具 --- */
function _aiCopy(text, toastMsg = '已复制') {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showAiToast(toastMsg))
            .catch(() => _aiLegacyCopy(text, toastMsg));
        return;
    }
    _aiLegacyCopy(text, toastMsg);
}

function _aiLegacyCopy(text, toastMsg = '已复制') {
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
    showAiToast(copied ? toastMsg : '复制失败，请手动复制');
}

function showAiToast(msg) {
    let el = document.querySelector('.ai-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'ai-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

/* --- 初始化 --- */
init();
/* --- 离线检测 --- */
function initOfflineDetection() {
    const updateOnlineStatus = () => {
        if (!navigator.onLine) {
            showAiToast('网络已断开，AI 问答暂不可用');
            btnSend.disabled = true;
        } else {
            btnSend.disabled = !chatInput.value.trim();
        }
    };
    window.addEventListener('online', () => {
        showAiToast('网络已恢复');
        btnSend.disabled = !chatInput.value.trim();
    });
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

/* --- 导出对话 --- */
function exportConversation() {
    const conv = getActiveConv();
    if (!conv || !conv.messages.length) {
        showAiToast('暂无对话可导出');
        return;
    }
    const lines = [];
    lines.push(`# ${conv.title || '法音AI对话'}`);
    lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
    for (const msg of conv.messages) {
        if (msg.role === 'user') {
            lines.push(`**问：** ${msg.content}`);
        } else {
            lines.push(`**答：** ${msg.content}`);
            if (msg.sources?.length) {
                lines.push('');
                lines.push(`来源：${msg.sources.map(s => s.title).join('、')}`);
            }
        }
        lines.push('');
    }
    const text = lines.join('\n');
    _aiCopy(text, '对话已复制到剪贴板');
}
