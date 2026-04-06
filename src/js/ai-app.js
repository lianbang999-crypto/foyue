/* ===== 法音AI 独立页面入口 ===== */
import '../css/ai-page.css';
import { syncSystemTheme } from './theme.js';
import { askQuestionStream } from './ai-client.js';
import { createAiConversationStore } from './ai-conversations.js';
import {
    buildWelcomeHTML,
    escapeHtml,
    extractHighlightQuery,
    formatAnswer,
    renderSearchResults,
} from './ai-format.js';

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
const charCount = document.getElementById('charCount');
const inputArea = document.querySelector('.ai-input-area');

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

            // iOS + Android 统一：跟随 visualViewport 调整容器高度
            app.style.setProperty('--ai-app-height', `${Math.round(vv.height)}px`);
            if (isAndroid()) {
                app.style.transform = `translateY(${vv.offsetTop}px)`;
            } else {
                app.style.transform = '';
            }

            syncChatBottomOffset();

            if (document.activeElement === chatInput && keyboardHeight > 40) {
                setTimeout(() => {
                    scrollToBottom();
                }, isAndroid() ? 80 : 60);
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
                // iOS 12 等无 visualViewport 的老设备：键盘弹起后手动将输入区域滚入视野
                if (!window.visualViewport) {
                    chatInput.scrollIntoView({ block: 'end', behavior: 'smooth' });
                }
                scrollToBottom();
            }, 120);
        });
    });

    // iOS 12 键盘收起时重置滚动位置
    chatInput.addEventListener('blur', () => {
        if (!isMobile() || window.visualViewport) return;
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 80);
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

    // 来源标签 → 跳转
    chatArea.addEventListener('click', (e) => {
        // 热门话题标签
        const hotTag = e.target.closest('.ai-hot-tag');
        if (hotTag) {
            e.preventDefault();
            const question = hotTag.dataset.question;
            if (question) {
                chatInput.value = question;
                btnSend.disabled = false;
                handleSubmit();
            }
            return;
        }

        // 搜索结果 - 播放按钮
        const playBtn = e.target.closest('.ai-result-play');
        if (playBtn) {
            e.preventDefault();
            const href = playBtn.getAttribute('href');
            if (href) window.location.href = href;
            return;
        }

        // 搜索结果 - 读讲记按钮
        // 搜索结果 - 读讲记链接（已改为 <a>，不再需要 JS 拦截）

        // 内联来源链接 → 直接跳转
        const inlineSourceLink = e.target.closest('.ai-inline-source-link');
        if (inlineSourceLink) {
            // 自然导航到 /wenku?doc=xxx
            return;
        }

        // 引用出处标签 → 跳转到讲记
        const sourceTag = e.target.closest('.ai-source-tag');
        if (sourceTag) {
            e.preventDefault();
            const docId = sourceTag.dataset.docId;
            if (docId) {
                const query = sourceTag.dataset.query || '';
                const params = new URLSearchParams({ doc: docId });
                if (query) params.set('q', query);
                window.location.href = `/wenku?${params.toString()}`;
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
            }
            return;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
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

    // 桌面端自动聚焦（移动端不弹键盘）
    if (!isMobile()) chatInput.focus();
}

/* --- 渲染欢迎页或历史记录 --- */
function renderWelcomeOrHistory() {
    const chatHistory = getChatHistory();
    if (chatHistory.length > 0) {
        chatArea.innerHTML = '';
        for (const [index, msg] of chatHistory.entries()) {
            // 搜索结果类型的消息：用结果卡片渲染
            if (msg.role === 'assistant' && Array.isArray(msg.searchResults)) {
                const resultsEl = document.createElement('div');
                resultsEl.className = 'ai-message ai-message--bot';
                resultsEl.dataset.messageIndex = String(index);
                const contentEl = document.createElement('div');
                contentEl.className = 'ai-message-content';
                // 从历史中找到对应的用户问题
                let question = '';
                for (let i = index - 1; i >= 0; i--) {
                    if (chatHistory[i]?.role === 'user') {
                        question = chatHistory[i].content || '';
                        break;
                    }
                }
                contentEl.innerHTML = renderSearchResults(msg.searchResults, [], question, msg.audioResults);
                resultsEl.appendChild(contentEl);
                if (msg.disclaimer && msg.searchResults.length) {
                    const disc = document.createElement('div');
                    disc.className = 'ai-disclaimer';
                    disc.textContent = msg.disclaimer;
                    resultsEl.appendChild(disc);
                }
                chatArea.appendChild(resultsEl);
                continue;
            }
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
        return;
    }
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

    showTyping();

    // 获取最近几轮对话作为上下文
    const recentHistory = getChatHistory()
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content || '' }));

    const streamOpts = {
        series_id: aiContext?.series_id,
        episode_num: aiContext?.episodeNum,
        history: recentHistory,
    };

    // 流式渲染状态
    let rawTokens = '';
    let streamingEl = null;
    let streamingContent = null;

    function ensureStreamingMessage() {
        if (streamingEl) return;
        removeTyping();
        streamingEl = document.createElement('div');
        streamingEl.className = 'ai-message ai-message--bot ai-enter';
        streamingContent = document.createElement('div');
        streamingContent.className = 'ai-message-content ai-streaming';
        streamingEl.appendChild(streamingContent);
        chatArea.appendChild(streamingEl);
    }

    askQuestionStream(question, streamOpts, {
        onToken(token) {
            ensureStreamingMessage();
            rawTokens += token;
            // 流式阶段：plain text + 光标
            streamingContent.innerHTML = `<p>${escapeHtml(rawTokens)}<span class="ai-cursor">▋</span></p>`;
            scrollToBottom();
        },

        onDone(data) {
            // 移除流式元素，用完整渲染替换
            if (streamingEl) {
                streamingEl.remove();
                streamingEl = null;
            } else {
                removeTyping();
            }

            const finalAnswer = data.answer || rawTokens || '';
            const sourcesWithQuery = attachSourcePreviewQuery(data.sources || [], question);
            addMessage('bot', finalAnswer, sourcesWithQuery, data.disclaimer, false, conv.messages.length);

            // 追问建议
            if (data.followUps?.length) {
                const followUpEl = document.createElement('div');
                followUpEl.className = 'ai-followups';
                followUpEl.innerHTML = data.followUps.map(q =>
                    `<button class="ai-hot-tag" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`
                ).join('');
                chatArea.appendChild(followUpEl);
            }

            scrollToBottom();

            // 持久化
            conv.messages.push({
                role: 'assistant',
                content: finalAnswer,
                sources: sourcesWithQuery,
                disclaimer: data.disclaimer,
            });
            trimConversationMessages(conv);
            conv.updatedAt = Date.now();
            saveConversations();
            renderConvList();

            isLoading = false;
            setGeneratingUI(false);
            if (!isMobile()) chatInput.focus();
        },

        onError(err) {
            if (streamingEl) {
                streamingEl.remove();
                streamingEl = null;
            } else {
                removeTyping();
            }

            // 如果已有 token，尝试用已有内容落地（网络中断场景）
            if (rawTokens.trim()) {
                const sourcesWithQuery = attachSourcePreviewQuery([], question);
                addMessage('bot', rawTokens, sourcesWithQuery, null, false, conv.messages.length);
                conv.messages.push({ role: 'assistant', content: rawTokens, sources: [] });
                trimConversationMessages(conv);
                conv.updatedAt = Date.now();
                saveConversations();
                renderConvList();
            } else {
                addErrorMessage(err.message || '回答失败，请稍后再试', question);
            }

            isLoading = false;
            setGeneratingUI(false);
            if (!isMobile()) chatInput.focus();
        },
    });
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
            sourceHeading.textContent = '引用出处';
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
    const series = s.series_name ? `<span class="ai-source-series">${escapeHtml(s.series_name)}</span>` : '';
    const epNum = s.audio_episode_num ? `<span class="ai-source-ep">第${s.audio_episode_num}讲</span>` : '';

    // 播放链接（有音频数据时）
    const playBtn = s.audio_series_id
        ? `<a class="ai-source-play" href="/?series=${encodeURIComponent(s.audio_series_id)}${s.audio_episode_num ? `&ep=${s.audio_episode_num}` : ''}" title="播放此讲">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>
          </a>`
        : '';

    if (s.doc_id) {
        const rawQuery = String(s.preview_query || fallbackQuery || extractHighlightQuery(_lastQuestion) || '').trim();
        const queryAttr = rawQuery ? ` data-query="${escapeHtml(rawQuery)}"` : '';
        const snippetAttr = s.snippet ? ` data-snippet="${escapeHtml(s.snippet || '')}"` : '';
        return `<span class="ai-source-card">
            <button class="ai-source-tag" data-doc-id="${escapeHtml(s.doc_id)}"${queryAttr}${snippetAttr}>
                <span class="ai-source-title">${title}</span>${series}${epNum}
            </button>${playBtn}
        </span>`;
    }
    return `<span class="ai-source-card"><span class="ai-source-tag"><span class="ai-source-title">${title}</span>${series}${epNum}</span>${playBtn}</span>`;
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
      <button class="ai-action-btn" data-action="copy" aria-label="复制" title="复制回答">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        <span class="ai-action-label">复制</span>
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
    convBackdrop?.classList.add('open');
}

function closeSidebar() {
    convDrawer?.classList.remove('open');
    convBackdrop?.classList.remove('open');
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
    _inputAreaResizeObserver?.disconnect();
    _inputAreaResizeObserver = null;
    _layoutResizeCleanup?.();
    _layoutResizeCleanup = null;
    _visualViewportCleanup?.();
    _visualViewportCleanup = null;
}

/* --- 初始化 --- */
init();
window.addEventListener('pagehide', cleanupAiPage, { once: true });

// bfcache 恢复时关闭抽屉，避免遮挡输入框
window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
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
