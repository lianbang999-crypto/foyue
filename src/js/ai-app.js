/* ===== 法音AI 独立页面入口 ===== */
import '../css/ai-page.css';
import { askQuestionStream } from './ai-client.js';

/* --- 常量 --- */
const MAX_INPUT_LEN = 500;
const MAX_MESSAGES = 50;
const MAX_PERSIST = 20;
const LS_KEY = 'ai-page-history';

/* --- 状态 --- */
let isLoading = false;
let chatHistory = loadHistory();
let _lastQuestion = '';

/* --- DOM 引用 --- */
const chatArea = document.getElementById('chatArea');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const btnClear = document.getElementById('btnClear');

/* --- 初始化 --- */
init();

function init() {
    renderWelcomeOrHistory();
    wireEvents();
    // 深色模式同步
    syncTheme();
}

/* --- 主题同步 --- */
function syncTheme() {
    const applyTheme = (isDark) => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    };

    if (typeof window.matchMedia !== 'function') {
        applyTheme(false);
        return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches);

    const handleChange = (e) => {
        applyTheme(e.matches);
    };

    if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handleChange);
        return;
    }

    if (typeof mq.addListener === 'function') {
        mq.addListener(handleChange);
    }
}

/* --- 事件绑定 --- */
function wireEvents() {
    // 输入框自动调整高度 + 发送按钮状态
    chatInput.addEventListener('input', () => {
        autoResize();
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

    // 清空对话
    btnClear.addEventListener('click', () => {
        if (!chatHistory.length) return;
        chatHistory = [];
        persistHistory();
        renderWelcomeOrHistory();
    });

    // 分享
    document.getElementById('btnShare')?.addEventListener('click', () => {
        const title = '法音AI · 净土智慧问答';
        const url = location.href;
        if (navigator.share) {
            navigator.share({ title, url }).catch(err => {
                if (err.name === 'AbortError') return;
                _aiCopy(title + '\n' + url);
            });
        } else {
            _aiCopy(title + '\n' + url);
        }
    });

    // 推荐问题点击（事件委托）
    chatArea.addEventListener('click', (e) => {
        const chip = e.target.closest('.ai-suggest-chip');
        if (chip) {
            chatInput.value = chip.textContent.trim();
            btnSend.disabled = false;
            handleSubmit();
            return;
        }

        // 来源标签 → 跳转文库
        const tag = e.target.closest('.ai-source-tag');
        if (tag) {
            e.preventDefault();
            const docId = tag.dataset.docId;
            const query = tag.dataset.query || '';
            if (docId) {
                window.location.href = `/wenku?doc=${encodeURIComponent(docId)}${query ? '&q=' + encodeURIComponent(query) : ''}`;
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
        }
    });
}

/* --- 渲染欢迎页或历史记录 --- */
function renderWelcomeOrHistory() {
    if (chatHistory.length > 0) {
        chatArea.innerHTML = '';
        for (const msg of chatHistory) {
            addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, msg.sources, msg.disclaimer, true);
        }
        scrollToBottom();
    } else {
        chatArea.innerHTML = buildWelcomeHTML();
    }
}

/* --- 提交问题 --- */
async function handleSubmit() {
    const question = chatInput.value.trim();
    if (!question || isLoading) return;
    if (question.length > MAX_INPUT_LEN) return;

    // 移除欢迎内容
    const welcome = chatArea.querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    const suggestions = chatArea.querySelector('.ai-suggestions');
    if (suggestions) suggestions.remove();

    _lastQuestion = question;
    addMessage('user', question);
    chatHistory.push({ role: 'user', content: question });

    chatInput.value = '';
    chatInput.style.height = '';
    btnSend.disabled = true;
    isLoading = true;

    showTyping();

    try {
        let msgContent = null;
        let textEl = null;
        let fullText = '';

        const finalData = await askQuestionStream(
            question,
            { history: chatHistory.slice(-6) },
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
        textEl.innerHTML = formatAnswer(cleanText);

        // 来源标签
        if (finalData.sources?.length) {
            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = finalData.sources.map(s => renderSourceTag(s)).join(' ');
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
        if (followUps.length > 0) {
            const wrap = document.createElement('div');
            wrap.className = 'ai-followups';
            followUps.forEach(q => {
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

        scrollToBottom();

        // 持久化
        const answer = cleanText.trim() || '抱歉，AI 暂时无法生成回答。';
        chatHistory.push({ role: 'assistant', content: answer, sources: finalData.sources, disclaimer: finalData.disclaimer });
        if (chatHistory.length > MAX_PERSIST) chatHistory.splice(0, chatHistory.length - MAX_PERSIST);
        persistHistory();

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
function addMessage(role, content, sources, disclaimer, silent) {
    while (chatArea.children.length > MAX_MESSAGES) {
        chatArea.removeChild(chatArea.children[0]);
    }
    const msg = document.createElement('div');
    msg.className = `ai-message ai-message--${role === 'user' ? 'user' : 'bot'}`;
    if (!silent) msg.classList.add('ai-enter');

    const contentEl = document.createElement('div');
    contentEl.className = 'ai-message-content';

    if (role === 'user') {
        contentEl.innerHTML = `<p>${escapeHtml(content)}</p>`;
    } else {
        contentEl.innerHTML = formatAnswer(content);
        if (sources?.length) {
            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = sources.map(s => renderSourceTag(s)).join(' ');
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

/* --- 来源标签渲染 --- */
function renderSourceTag(s) {
    const title = escapeHtml(s.title);
    if (s.doc_id) {
        const hlQuery = escapeHtml(s.snippet || extractHighlightQuery(_lastQuestion));
        return `<button class="ai-source-tag" data-doc-id="${escapeHtml(s.doc_id)}" data-query="${hlQuery}">${title}</button>`;
    }
    return `<span class="ai-source-tag">${title}</span>`;
}

function extractHighlightQuery(question) {
    if (!question) return '';
    const stopWords = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;
    const cleaned = question.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || question;
}

/* --- 文本格式化 --- */
function formatAnswer(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inQuote = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { if (inQuote) { html += '</blockquote>'; inQuote = false; } continue; }
        const isQuoteLine = /^[\u201C\u201D"\u300A""]/.test(line);
        const isSourceLine = /^[\u2014\u2500\-]{1,3}/.test(line);
        if (isQuoteLine) {
            if (!inQuote) { html += '<blockquote>'; inQuote = true; }
            html += `<p>${escapeHtml(line)}</p>`;
        } else if (isSourceLine && inQuote) {
            html += `<cite>${escapeHtml(line)}</cite></blockquote>`;
            inQuote = false;
        } else {
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += `<p>${escapeHtml(line)}</p>`;
        }
    }
    if (inQuote) html += '</blockquote>';
    return html;
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
      <button class="ai-suggest-chip">什么是念佛法门</button>
      <button class="ai-suggest-chip">如何往生净土</button>
      <button class="ai-suggest-chip">信愿行是什么</button>
      <button class="ai-suggest-chip">临终助念方法</button>
    </div>`;
}

/* --- 工具函数 --- */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

/* --- localStorage 持久化 --- */
function loadHistory() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.slice(-MAX_PERSIST) : [];
    } catch { return []; }
}

function persistHistory() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(chatHistory.slice(-MAX_PERSIST)));
    } catch { /* quota exceeded */ }
}

/* --- 分享工具 --- */
function _aiCopy(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showAiToast('链接已复制'))
            .catch(() => _aiLegacyCopy(text));
        return;
    }
    _aiLegacyCopy(text);
}

function _aiLegacyCopy(text) {
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
    showAiToast(copied ? '链接已复制' : '复制失败，请手动复制');
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
