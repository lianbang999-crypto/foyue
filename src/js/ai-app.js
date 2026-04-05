/* ===== 法音AI 独立页面入口 ===== */
import '../css/ai-page.css';
import { syncSystemTheme } from './theme.js';
import { askQuestion, askQuestionStream } from './ai-client.js';
import { createAiConversationStore } from './ai-conversations.js';
import {
    buildWelcomeHTML,
    escapeHtml,
    extractFollowUps,
    extractHighlightQuery,
    formatAnswer,
} from './ai-format.js';
import { createAiPreviewController } from './ai-preview.js';
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

const conversationStore = createAiConversationStore({
    storageKey: LS_CONV_KEY,
    legacyKey: LS_KEY,
    maxPersist: MAX_PERSIST,
    maxConversations: MAX_CONVERSATIONS,
});

function saveConversations() {
    conversationStore.saveConversations(conversations);
}

let conversations = conversationStore.loadConversations();
let activeConvId = conversations[0]?.id || null;

function getActiveConv() {
    return conversations.find(c => c.id === activeConvId) || null;
}

function ensureActiveConv() {
    if (!getActiveConv()) {
        const conv = conversationStore.createConversation();
        conversations.unshift(conv);
        activeConvId = conv.id;
    }
    return getActiveConv();
}

/* --- 状态 --- */
let isLoading = false;
let _lastQuestion = '';
let aiContext = loadAiContext();
let _streamAbortController = null;
let _inputAreaResizeObserver = null;
let _layoutResizeCleanup = null;
let _visualViewportCleanup = null;

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
const btnStop = document.getElementById('btnStop');
const charCount = document.getElementById('charCount');
const inputArea = document.querySelector('.ai-input-area');
const previewDrawer = document.getElementById('previewDrawer');
const previewBackdrop = document.getElementById('previewBackdrop');
const previewTitle = document.getElementById('previewTitle');
const previewMeta = document.getElementById('previewMeta');
const previewBody = document.getElementById('previewBody');
const previewOpenBtn = document.getElementById('previewOpenBtn');
const previewCloseBtn = document.getElementById('previewClose');

const previewController = createAiPreviewController({
    previewDrawer,
    previewBackdrop,
    previewTitle,
    previewMeta,
    previewBody,
    previewOpenBtn,
    inputArea,
    getWenkuDocument,
});

function init() {
    setupLayoutSync();
    renderWelcomeOrHistory();
    renderConvList();
    wireEvents();
    syncSystemTheme(THEME_COLORS);
    initOfflineDetection();
}

function setupLayoutSync() {
    syncChatBottomOffset();
    setupInputAreaResizeSync();
    setupVisualViewportSync();
}

function syncChatBottomOffset() {
    if (!chatArea) return;
    const dockHeight = Math.max(0, Math.ceil(inputArea?.offsetHeight || 0));
    chatArea.style.setProperty('--ai-chat-bottom-offset', `${dockHeight}px`);
}

function setupInputAreaResizeSync() {
    if (!inputArea) return;

    // 等 DOM 布局完成后再同步一次，避免首次取到 offsetHeight=0
    requestAnimationFrame(() => requestAnimationFrame(syncChatBottomOffset));

    if (typeof ResizeObserver !== 'undefined') {
        _inputAreaResizeObserver = new ResizeObserver(() => {
            syncChatBottomOffset();
        });
        _inputAreaResizeObserver.observe(inputArea);
        return;
    }

    const onResize = () => {
        syncChatBottomOffset();
    };
    window.addEventListener('resize', onResize);
    _layoutResizeCleanup = () => {
        window.removeEventListener('resize', onResize);
    };
}

function setupVisualViewportSync() {
    // iOS 上直接改容器高度容易触发页面被顶到顶部；这里只在 Android 上跟随 viewport 改高度。
    if (!window.visualViewport) return;

    const app = document.getElementById('ai-app');
    if (!app) return;

    let _vvRafPending = false;

    const onViewportResize = () => {
        if (_vvRafPending) return;
        _vvRafPending = true;
        requestAnimationFrame(() => {
            _vvRafPending = false;
            const vv = window.visualViewport;
            const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

            if (isAndroid()) {
                app.style.setProperty('--ai-app-height', `${Math.round(vv.height)}px`);
                app.style.transform = `translateY(${vv.offsetTop}px)`;
            } else {
                app.style.removeProperty('--ai-app-height');
                app.style.transform = '';
            }

            syncChatBottomOffset();

            if (document.activeElement === chatInput && keyboardHeight > 40) {
                setTimeout(() => {
                    scrollToBottom();
                }, isAndroid() ? 80 : 140);
            }
        });
    };

    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', onViewportResize);
    _visualViewportCleanup = () => {
        window.visualViewport.removeEventListener('resize', onViewportResize);
        window.visualViewport.removeEventListener('scroll', onViewportResize);
        app.style.removeProperty('--ai-app-height');
        app.style.transform = '';
    };
    onViewportResize(); // 立即同步，修复首屏渲染时 iOS 地址栏遮挡问题
}

/* --- 事件绑定 --- */
function wireEvents() {
    // 输入框自动调整高度 + 发送按钮状态 + 字数计数
    chatInput.addEventListener('input', () => {
        autoResize();
        updateCharCount();
        btnSend.disabled = !chatInput.value.trim();
    });

    chatInput.addEventListener('focus', () => {
        if (!isMobile()) return;
        requestAnimationFrame(() => {
            setTimeout(() => {
                scrollToBottom();
            }, 120);
        });
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

    previewBackdrop?.addEventListener('click', previewController.closePreview);
    previewCloseBtn?.addEventListener('click', previewController.closePreview);
    previewBody?.addEventListener('click', previewController.handleBodyClick);

    // 推荐问题点击（事件委托）
    chatArea.addEventListener('click', (e) => {
        const chip = e.target.closest('.ai-suggest-chip');
        if (chip) {
            const text = chip.dataset.question
                || chip.querySelector('.ai-suggest-text')?.textContent.trim()
                || chip.textContent.trim();
            chatInput.value = text;
            btnSend.disabled = false;
            handleSubmit();
            return;
        }

        // 来源标签/卡片 → 打开预览
        const tag = e.target.closest('.ai-source-tag, .ai-source-card');
        if (tag) {
            e.preventDefault();
            const docId = tag.dataset.docId;
            const query = tag.dataset.query || _lastQuestion;
            const snippet = tag.dataset.snippet || '';
            if (docId) {
                const titleEl = tag.querySelector('.ai-source-card-title');
                const title = titleEl ? titleEl.textContent.trim() : tag.textContent.trim();
                previewController.openPreview(docId, query, title, snippet);
            }
            return;
        }

        const inlineSourceLink = e.target.closest('.ai-inline-source-link');
        if (inlineSourceLink) {
            e.preventDefault();
            const docId = inlineSourceLink.dataset.docId;
            const query = inlineSourceLink.dataset.query || _lastQuestion;
            if (docId) {
                previewController.openPreview(docId, query, inlineSourceLink.textContent.trim());
                return;
            }
            const href = inlineSourceLink.getAttribute('href');
            if (href) {
                window.location.href = href;
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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (previewDrawer?.classList.contains('open')) {
                previewController.closePreview();
                return;
            }
            if (convDrawer?.classList.contains('open')) {
                closeConvDrawer();
            }
        }
    });

    // 粘贴长文本截断提示
    chatInput.addEventListener('paste', () => {
        requestAnimationFrame(() => {
            if (chatInput.value.length >= MAX_INPUT_LEN) {
                showAiToast(`内容已截断至 ${MAX_INPUT_LEN} 字`);
            }
            autoResize();
            updateCharCount();
            btnSend.disabled = !chatInput.value.trim();
        });
    });

    // 停止生成
    btnStop?.addEventListener('click', () => {
        if (_streamAbortController) {
            _streamAbortController.abort();
            _streamAbortController = null;
        }
    });

    // 桌面端自动聚焦（移动端不弹键盘）
    if (!isMobile()) chatInput.focus();
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

function trimConversationMessages(conv) {
    if (conv?.messages) {
        conversationStore.trimMessages(conv.messages);
    }
}

function setGeneratingUI(active) {
    if (active) {
        btnSend.disabled = true;
        btnSend.classList.add('hidden');
        btnStop?.classList.remove('hidden');
        return;
    }
    btnStop?.classList.add('hidden');
    btnSend.classList.remove('hidden');
    btnSend.disabled = !chatInput.value.trim();
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
    setGeneratingUI(true);
    isLoading = true;

    _streamAbortController = new AbortController();

    showTyping();

    let msgContent = null;
    let textEl = null;
    let fullText = '';

    try {
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
            },
            { signal: _streamAbortController?.signal }
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
        const answerText = String(finalData.answer || cleanText || '').trim()
            || '抱歉，AI 暂时无法生成回答。';
        const finalFollowUps = Array.isArray(finalData.followUps) && finalData.followUps.length
            ? finalData.followUps
            : followUps;
        textEl.innerHTML = formatAnswer(answerText);

        const renderedSources = attachSourcePreviewQuery(finalData.sources, question);

        // 来源标签
        if (renderedSources.length) {
            const sourceHeading = document.createElement('div');
            sourceHeading.className = 'ai-source-heading';
            sourceHeading.textContent = '出处 · 打开文库原文';
            msgContent.appendChild(sourceHeading);

            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = renderedSources.map(s => renderSourceTag(s)).join(' ');
            msgContent.appendChild(srcDiv);
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
        trimConversationMessages(conv);
        if (parentMsg) parentMsg.dataset.messageIndex = String(conv.messages.length - 1);
        conv.updatedAt = Date.now();
        saveConversations();
        renderConvList();

    } catch (err) {
        removeTyping();
        const isAborted = err?.name === 'AbortError' || err?.message === '请求已取消';
        // 用户主动停止：保留已生成内容并格式化
        if (isAborted && textEl && fullText.trim()) {
            textEl.classList.remove('ai-streaming');
            const { cleanText } = extractFollowUps(fullText);
            const partialText = cleanText.trim();
            textEl.innerHTML = formatAnswer(partialText);
            const parentMsg = textEl.closest('.ai-message');
            if (parentMsg) {
                const actions = buildMsgActions();
                const time = document.createElement('time');
                time.className = 'ai-msg-time';
                time.textContent = formatMsgTime(new Date()) + '（已停止）';
                actions.prepend(time);
                parentMsg.appendChild(actions);
            }
            conv.messages.push({ role: 'assistant', content: partialText });
            trimConversationMessages(conv);
            conv.updatedAt = Date.now();
            saveConversations();
            renderConvList();
            scrollToBottom();
        } else {
            const emptyStream = chatArea.querySelector('.ai-message--bot:last-child .ai-streaming');
            if (emptyStream && !emptyStream.textContent) emptyStream.closest('.ai-message').remove();
            if (!isAborted) {
                const fallbackSucceeded = await recoverWithNonStreamAnswer({
                    question,
                    conv,
                    streamMessageEl: textEl?.closest('.ai-message') || null,
                });
                if (!fallbackSucceeded) {
                    addErrorMessage(err.message || '请求失败，请稍后再试', question);
                }
            }
        }
    } finally {
        isLoading = false;
        _streamAbortController = null;
        setGeneratingUI(false);
        if (!isMobile()) chatInput.focus();
    }
}

async function recoverWithNonStreamAnswer({ question, conv, streamMessageEl }) {
    try {
        const requestHistory = buildRequestHistory(conv.messages, question);
        const fallbackData = await askQuestion(question, buildAskContext(requestHistory));

        streamMessageEl?.remove();

        const answerText = String(fallbackData?.answer || '').trim() || '抱歉，AI 暂时无法生成回答。';
        const renderedSources = attachSourcePreviewQuery(fallbackData?.sources || [], question);
        const messageIndex = conv.messages.length;
        addMessage('bot', answerText, renderedSources, fallbackData?.disclaimer, false, messageIndex, extractHighlightQuery(question));

        conv.messages.push({
            role: 'assistant',
            content: answerText,
            sources: renderedSources,
            disclaimer: fallbackData?.disclaimer,
        });
        trimConversationMessages(conv);
        conv.updatedAt = Date.now();
        saveConversations();
        renderConvList();
        showAiToast('网络波动，已自动切换稳态回复');
        return true;
    } catch {
        return false;
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
            const sourceHeading = document.createElement('div');
            sourceHeading.className = 'ai-source-heading';
            sourceHeading.textContent = '出处 · 打开文库原文';
            contentEl.appendChild(sourceHeading);

            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = sources.map(s => renderSourceTag(s, sourceQuery)).join(' ');
            contentEl.appendChild(srcDiv);
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
    el.innerHTML = '<div class="ai-typing"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div>';
    chatArea.appendChild(el);
    scrollToBottom();
}

function removeTyping() {
    const el = chatArea.querySelector('.ai-typing-msg');
    if (el) el.remove();
}

/* --- 来源引用卡片渲染 --- */
function renderSourceTag(s, fallbackQuery = '') {
    const title = escapeHtml(s.title);
    const snippet = escapeHtml(s.snippet || '');
    if (s.doc_id) {
        const rawQuery = String(s.preview_query || fallbackQuery || extractHighlightQuery(_lastQuestion) || '').trim();
        const queryAttr = rawQuery ? ` data-query="${escapeHtml(rawQuery)}"` : '';
        const snippetAttr = s.snippet ? ` data-snippet="${snippet}"` : '';
        // 有摘要时显示引用卡片，否则显示简洁标签
        if (snippet) {
            return `<button class="ai-source-card" data-doc-id="${escapeHtml(s.doc_id)}"${queryAttr}${snippetAttr}>
                <span class="ai-source-card-title">${title}</span>
                <span class="ai-source-card-snippet">${snippet}</span>
                <span class="ai-source-card-meta">
                    <span class="ai-source-card-action">查看文库原文</span>
                    <span class="ai-source-card-arrow" aria-hidden="true">›</span>
                </span>
            </button>`;
        }
        return `<button class="ai-source-tag" data-doc-id="${escapeHtml(s.doc_id)}"${queryAttr}${snippetAttr}>出处 · ${title}</button>`;
    }
    return `<span class="ai-source-tag">出处 · ${title}</span>`;
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


function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    syncChatBottomOffset();
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="regen" aria-label="重新生成" title="重新生成">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="good" aria-label="有帮助" title="有帮助">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
        </svg>
      </button>
      <button class="ai-action-btn" data-action="bad" aria-label="不准确" title="不准确">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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

/* 桌面/移动端自适应 */
function isDesktop() {
    return window.innerWidth >= 768;
}

function openSidebar() {
    convDrawer?.classList.add('open');
}

function closeSidebar() {
    convDrawer?.classList.remove('open');
    if (convDrawer) convDrawer.style.transform = '';
}

/* 同一个按钮：桌面端切换左侧边栏，移动端切换底部弹窗 */
document.getElementById('btnConvList')?.addEventListener('click', () => {
    if (isDesktop()) {
        const isOpen = convDrawer?.classList.contains('open');
        isOpen ? closeSidebar() : openSidebar();
    } else {
        toggleConvDrawer();
    }
});
document.getElementById('btnNewConv')?.addEventListener('click', () => {
    startNewConversation();
    if (isDesktop()) closeSidebar(); else closeConvDrawer();
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
        // 桌面端保持边栏开启，移动端关闭弹窗
        if (!isDesktop()) closeConvDrawer();
        if (!isMobile()) chatInput.focus();
    }
});

function toggleConvDrawer() {
    // 移动端底部弹窗模式
    const opening = !convDrawer?.classList.contains('open');
    convDrawer?.classList.toggle('open');
    convBackdrop?.classList.toggle('open');
    if (opening) {
        // 打开时收起键盘，防止 iPhone 上键盘与底部抽屉重叠
        chatInput?.blur();
    }
}

function closeConvDrawer() {
    if (isDesktop()) {
        closeSidebar();
        return;
    }
    convDrawer?.classList.remove('open');
    convBackdrop?.classList.remove('open');
    if (convDrawer) convDrawer.style.transform = '';
}

// 底部弹窗下拉关闭手势（仅移动端）
(function initDrawerSwipe() {
    if (!convDrawer) return;
    let startY = 0, tracking = false;
    convDrawer.addEventListener('touchstart', (e) => {
        if (!convDrawer.classList.contains('open')) return;
        if (isDesktop()) return; // 桌面端边栏不需要下拉手势
        startY = e.touches[0].clientY;
        tracking = true;
        convDrawer.style.transition = 'none';
    }, { passive: true });
    convDrawer.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const dy = e.touches[0].clientY - startY;
        if (dy < 0) { convDrawer.style.transform = ''; return; }
        convDrawer.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    convDrawer.addEventListener('touchend', (e) => {
        if (!tracking) { convDrawer.style.transition = ''; return; }
        tracking = false;
        convDrawer.style.transition = '';
        const dy = (e.changedTouches[0]?.clientY || startY) - startY;
        if (dy > 80) {
            closeConvDrawer();
        } else {
            convDrawer.style.transform = '';
        }
    }, { passive: true });
})();

function startNewConversation() {
    const conv = conversationStore.createConversation();
    conversations.unshift(conv);
    activeConvId = conv.id;
    if (conversations.length > MAX_CONVERSATIONS) conversations.length = MAX_CONVERSATIONS;
    saveConversations();
    renderWelcomeOrHistory();
    renderConvList();
    if (!isMobile()) chatInput.focus();
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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

/* --- 移动端检测 --- */
function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 768);
}

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function cleanupAiPage() {
    if (_streamAbortController) {
        _streamAbortController.abort();
        _streamAbortController = null;
    }
    _inputAreaResizeObserver?.disconnect();
    _inputAreaResizeObserver = null;
    _layoutResizeCleanup?.();
    _layoutResizeCleanup = null;
    _visualViewportCleanup?.();
    _visualViewportCleanup = null;
    previewController.destroy();
}

/* --- 初始化 --- */
init();
window.addEventListener('pagehide', cleanupAiPage, { once: true });

// bfcache 恢复时关闭所有抽屉，避免遮挡输入框
window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    previewController.closePreview();
    closeConvDrawer();
});
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
