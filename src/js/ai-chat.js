/* ===== AI 全屏聊天页 ===== */
import '../css/ai.css';
import { askQuestionStream } from './ai-client.js';
import { t } from './i18n.js';
import { escapeHtml, shareContent } from './utils.js';

let chatInstance = null;
let aiContext = { seriesId: null, episodeNum: null };
const MAX_MESSAGES = 50;
const MAX_PERSIST = 20; // max messages to persist
const LS_KEY = 'ai-chat-history';
const MAX_INPUT_LEN = 500;
const INPUT_WARN_THRESHOLD = 0.85; // show char-count warning at 85% of max
const OPEN_FOCUS_DELAY_MS = 350; // matches CSS slide-in animation duration (0.35s)

let _lastQuestion = '';

/* ===== Follow-up question parsing ===== */
function extractFollowUps(text) {
  const match = text.match(/\[FOLLOWUP\](.*?)\[\/FOLLOWUP\]/s);
  if (!match) return { cleanText: text, followUps: [] };
  const cleanText = text.replace(/\[FOLLOWUP\].*?\[\/FOLLOWUP\]/s, '').trim();
  const followUps = match[1].split('|').map(q => q.trim()).filter(q => q.length > 0 && q.length < 100);
  return { cleanText, followUps };
}

/* ===== localStorage persistence ===== */
function loadPersistedHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX_PERSIST) : [];
  } catch { return []; }
}

function persistHistory(chatHistory) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(chatHistory.slice(-MAX_PERSIST)));
  } catch { /* quota exceeded */ }
}

/* ===== Public API ===== */
export function prefetchAiChat() {
  if (!chatInstance) createChatPage();
}

export function openAiChat() {
  if (chatInstance && chatInstance.isOpen) return;
  if (!chatInstance) createChatPage();
  chatInstance.show();
}

export function closeAiChat(options) {
  if (chatInstance) chatInstance.hide(options);
}

export function isAiChatOpen() {
  return chatInstance ? chatInstance.isOpen : false;
}

/* ===== Core ===== */
function createChatPage() {
  let isLoading = false;
  const chatHistory = loadPersistedHistory();

  const page = document.createElement('div');
  page.className = 'ai-fullscreen';
  page.id = 'aiFullscreen';
  page.innerHTML = buildPageHTML();

  const chatMessages = page.querySelector('#aiFsMessages');
  const chatForm = page.querySelector('#aiFsForm');
  const chatInput = page.querySelector('#aiFsInput');
  const chatSend = page.querySelector('#aiFsSend');
  const charCount = page.querySelector('#aiFsCharCount');

  // Restore persisted messages into DOM
  if (chatHistory.length > 0) {
    // Remove default welcome + suggestions
    const welcomeWrap = page.querySelector('.ai-welcome-wrap');
    if (welcomeWrap) welcomeWrap.remove();
    for (const msg of chatHistory) {
      addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, msg.sources, msg.disclaimer, true);
    }
  }

  page.querySelector('#aiFsBack').addEventListener('click', () => {
    if (window.history.state?.aiChat) {
      window.history.back();
      return;
    }
    chatInstance.hide();
  });

  // Clear chat history button
  page.querySelector('#aiFsClear').addEventListener('click', () => {
    if (!chatHistory.length && !chatMessages.querySelector('.ai-msg-user')) return;
    // Clear persisted history
    chatHistory.splice(0, chatHistory.length);
    persistHistory(chatHistory);
    // Reset DOM — rebuild welcome state
    chatMessages.innerHTML = buildWelcomeHTML();
    // Re-attach suggest chip listeners
    chatMessages.querySelectorAll('.ai-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chatInput.value = chip.textContent.trim();
        updateCharCount();
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });
    isLoading = false;
  });

  page.querySelector('#aiFsShare').addEventListener('click', () => {
    const url = window.location.origin + '/?tab=ai';
    shareContent('AI 问法 — 净土法音', url);
  });

  function attachSuggestChips() {
    page.querySelectorAll('.ai-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chatInput.value = chip.textContent.trim();
        updateCharCount();
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });
  }
  attachSuggestChips();

  // Source tags → open internal wenku reader (z-index 400 > AI chat 300)
  chatMessages.addEventListener('click', (e) => {
    const tag = e.target.closest('.ai-source-tag[data-doc-id]');
    if (!tag) return;
    e.preventDefault();
    const docId = tag.dataset.docId;
    const query = tag.dataset.query || '';
    if (!docId) return;
    import('./wenku-reader.js').then(mod => mod.openReader(docId, query)).catch(() => {
      import('./utils.js').then(m => m.showToast(t('loading_fail') || '文稿打开失败'));
    });
  });

  // Copy button
  chatMessages.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.ai-copy-btn');
    if (!copyBtn) return;
    e.preventDefault();
    const msgBlock = copyBtn.closest('.ai-msg');
    const content = msgBlock.querySelector('.ai-msg-content')?.innerText;
    if (!content) return;
    const copied = await copyText(content);
    if (copied) {
      const originalHtml = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--token-success, #10b981)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      setTimeout(() => copyBtn.innerHTML = originalHtml, 2000);
    } else {
      import('./utils.js').then(m => m.showToast('复制失败'));
    }
  });

  // Retry button on error messages
  chatMessages.addEventListener('click', (e) => {
    const retryBtn = e.target.closest('.ai-retry-btn');
    if (!retryBtn || isLoading) return;
    const question = retryBtn.dataset.question;
    if (!question) return;
    // Remove the error message
    const errMsg = retryBtn.closest('.ai-msg-error');
    if (errMsg) errMsg.remove();
    chatInput.value = question;
    updateCharCount();
    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
  });

  chatForm.addEventListener('submit', handleSubmit);
  chatSend.addEventListener('click', () => {
    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
  });

  // Auto-resize textarea
  function autoResize() {
    chatInput.style.height = 'auto';
    const maxH = 120;
    chatInput.style.height = Math.min(chatInput.scrollHeight, maxH) + 'px';
  }
  chatInput.addEventListener('input', () => {
    autoResize();
    updateCharCount();
  });

  // Ctrl+Enter or Cmd+Enter also submits
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  function updateCharCount() {
    const len = chatInput.value.length;
    if (charCount) {
      charCount.textContent = `${len}/${MAX_INPUT_LEN}`;
      charCount.classList.toggle('ai-char-warn', len > MAX_INPUT_LEN * INPUT_WARN_THRESHOLD);
      charCount.classList.toggle('ai-char-over', len >= MAX_INPUT_LEN);
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && chatInstance.isOpen) chatInstance.hide();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question || isLoading) return;
    if (question.length > MAX_INPUT_LEN) return;

    const welcomeWrap = page.querySelector('.ai-welcome-wrap');
    if (welcomeWrap) welcomeWrap.remove();

    _lastQuestion = question;
    const requestHistory = chatHistory.slice(-6);
    addMessage('user', question);
    chatHistory.push({ role: 'user', content: question });
    chatInput.value = '';
    chatInput.style.height = '';
    updateCharCount();
    isLoading = true;
    chatSend.disabled = true;
    chatSend.setAttribute('aria-busy', 'true');
    showTyping();

    try {
      // Streaming message container created lazily on first token
      let msgContent = null, textEl = null;
      let fullText = '';

      const finalData = await askQuestionStream(
        question,
        {
          history: requestHistory,
          series_id: aiContext.seriesId || undefined,
          episode_num: aiContext.episodeNum || undefined,
        },
        (token) => {
          // First token: remove typing dots, create streaming container
          if (!textEl) {
            removeTyping();
            const stream = createStreamingMessage();
            msgContent = stream.msgContent;
            textEl = stream.textEl;
          }
          fullText += token;
          textEl.textContent = fullText;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      );

      // If no tokens came (empty response), still need to clean up
      removeTyping();
      if (!textEl) {
        const stream = createStreamingMessage();
        msgContent = stream.msgContent;
        textEl = stream.textEl;
      }

      // Finalize: remove cursor, replace plain text with formatted HTML
      textEl.classList.remove('ai-streaming');
      const { cleanText, followUps } = extractFollowUps(fullText);
      textEl.innerHTML = formatAnswer(cleanText);
      if (finalData.sources?.length) {
        const srcDiv = document.createElement('div');
        srcDiv.className = 'ai-sources';
        srcDiv.innerHTML = finalData.sources.map(s => renderSourceTag(s)).join(' ');
        msgContent.appendChild(srcDiv);
      }
      if (finalData.disclaimer) {
        const discP = document.createElement('p');
        discP.className = 'ai-disclaimer';
        discP.textContent = finalData.disclaimer;
        msgContent.appendChild(discP);
      }
      // Render follow-up question chips
      if (followUps.length > 0) {
        const followUpWrap = document.createElement('div');
        followUpWrap.className = 'ai-suggest-wrap ai-followup-wrap';
        followUps.forEach(q => {
          const chip = document.createElement('button');
          chip.className = 'ai-suggest-chip';
          chip.textContent = q;
          chip.addEventListener('click', () => {
            chatInput.value = q;
            updateCharCount();
            chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
          });
          followUpWrap.appendChild(chip);
        });
        msgContent.appendChild(followUpWrap);
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Persist
      const answer = cleanText.trim() || '抱歉，AI 暂时无法生成回答。';
      chatHistory.push({ role: 'assistant', content: answer, sources: finalData.sources, disclaimer: finalData.disclaimer });
      if (chatHistory.length > MAX_PERSIST) chatHistory.splice(0, chatHistory.length - MAX_PERSIST);
      persistHistory(chatHistory);

    } catch (err) {
      removeTyping();
      // Remove any empty streaming message
      const emptyStream = chatMessages.querySelector('.ai-msg-bot:last-child .ai-streaming');
      if (emptyStream && !emptyStream.textContent) emptyStream.closest('.ai-msg').remove();
      addErrorMessage(err.message || '请求失败，请稍后再试', question);
    } finally {
      isLoading = false;
      chatSend.disabled = false;
      chatSend.removeAttribute('aria-busy');
    }
  }

  function extractHighlightQuery(question) {
    if (!question) return '';
    const stopWords = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;
    const cleaned = question.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || question;
  }

  function renderSourceTag(s) {
    const title = escapeHtml(s.title);
    if (s.doc_id) {
      const hlQuery = escapeHtml(s.snippet || extractHighlightQuery(_lastQuestion));
      return `<button class="ai-source-tag" data-doc-id="${escapeHtml(s.doc_id)}" data-query="${hlQuery}">${title}</button>`;
    }
    return `<span class="ai-source-tag">${title}</span>`;
  }

  function formatAnswer(text) {
    const lines = text.split('\n');
    let html = '';
    let inQuote = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { if (inQuote) { html += '</blockquote>'; inQuote = false; } continue; }
      const isQuoteLine = /^[\u201C\u201D"\u300A""]/.test(line);
      const isSourceLine = /^[\u2014\u2500\-]{1,3}/.test(line);
      if (isQuoteLine) {
        if (!inQuote) { html += '<blockquote class="ai-quote">'; inQuote = true; }
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

  /* Lotus avatar — Buddhist Pure Land theme */
  const BOT_AVATAR = `<div class="ai-msg-avatar" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4c-1.5 2.5-2 5-2 7.5s.5 4 2 5c1.5-1 2-2.5 2-5s-.5-5-2-7.5z"/><path d="M7.5 8c-2 1-3.5 3.5-3.5 6.5 0 1 .4 2 1.5 2.5"/><path d="M16.5 8c2 1 3.5 3.5 3.5 6.5 0 1-.4 2-1.5 2.5"/><path d="M9.5 7.5c-1.5.5-2.5 2-3 4"/><path d="M14.5 7.5c1.5.5 2.5 2 3 4"/><line x1="12" y1="16.5" x2="12" y2="20"/><path d="M9.5 20c.7-.5 1.6-.5 2.5 0 .9-.5 1.8-.5 2.5 0"/></svg></div>`;

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to legacy copy for iOS/in-app browsers.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  }

  function addMessage(role, content, sources, disclaimer, silent) {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const safeRole = ['user', 'bot', 'error'].includes(role) ? role : 'bot';
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${safeRole}`;
    if (!silent) msg.classList.add('ai-msg-enter');
    let html = '';
    if (safeRole === 'bot') html += BOT_AVATAR;
    html += '<div class="ai-msg-content">';
    if (safeRole === 'bot') {
      html += formatAnswer(content);
    } else {
      html += `<p>${escapeHtml(content)}</p>`;
    }
    if (safeRole === 'bot' && sources?.length) {
      html += '<div class="ai-sources">' + sources.map(s => renderSourceTag(s)).join(' ') + '</div>';
    }
    if (safeRole === 'bot' && disclaimer) {
      html += `<p class="ai-disclaimer">${escapeHtml(disclaimer)}</p>`;
    }
    html += '</div>';

    // Hover copy button
    if (safeRole === 'bot') {
      html += `
      <div class="ai-msg-actions" title="复制文本">
        <button type="button" class="ai-msg-action-btn ai-copy-btn" aria-label="复制文本">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>`;
    }

    msg.innerHTML = html;
    chatMessages.appendChild(msg);
    if (!silent) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addErrorMessage(errText, question) {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg-error ai-msg-enter';
    const retryHtml = question
      ? `<button class="ai-retry-btn" data-question="${escapeHtml(question)}" aria-label="重试">↩ 重试</button>`
      : '';
    msg.innerHTML = `<div class="ai-msg-content"><p>${escapeHtml(errText)}</p>${retryHtml}</div>`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function createStreamingMessage() {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg-bot ai-msg-enter';
    msg.innerHTML = BOT_AVATAR;
    const msgContent = document.createElement('div');
    msgContent.className = 'ai-msg-content';
    const textEl = document.createElement('div');
    textEl.className = 'ai-streaming';
    msgContent.appendChild(textEl);
    msg.appendChild(msgContent);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return { msgContent, textEl };
  }

  function showTyping() {
    const indicator = document.createElement('div');
    indicator.className = 'ai-msg ai-msg-bot ai-typing';
    indicator.setAttribute('aria-label', 'AI 正在思考');
    indicator.innerHTML = BOT_AVATAR + '<div class="ai-msg-content"><div class="ai-typing-dots"><span></span><span></span><span></span></div></div>';
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeTyping() {
    const el = page.querySelector('.ai-typing');
    if (el) el.remove();
  }

  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('App element not found');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', 'AI 问法');
  /* Hide: inert for modern browsers; aria-hidden as fallback for older ones */
  page.setAttribute('inert', '');
  page.setAttribute('aria-hidden', 'true');
  appEl.appendChild(page);

  chatInstance = {
    isOpen: false,
    show() {
      page.classList.add('show');
      page.removeAttribute('inert');
      page.setAttribute('aria-hidden', 'false');
      this.isOpen = true;
      document.addEventListener('keydown', onKeydown);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      setTimeout(() => chatInput.focus(), OPEN_FOCUS_DELAY_MS);
      const url = new URL(window.location);
      url.searchParams.set('tab', 'ai');
      window.history.pushState({ aiChat: true }, '', url);
    },
    hide({ fromPopState = false } = {}) {
      page.classList.remove('show');
      page.setAttribute('inert', '');
      page.setAttribute('aria-hidden', 'true');
      this.isOpen = false;
      document.removeEventListener('keydown', onKeydown);
      const url = new URL(window.location);
      if (!fromPopState && url.searchParams.get('tab') === 'ai') {
        url.searchParams.delete('tab');
        const cleanUrl = url.pathname + (url.search || '') + url.hash;
        window.history.replaceState({}, '', cleanUrl || '/');
      }
    },
  };
}

function buildWelcomeHTML() {
  return `
    <div class="ai-welcome-wrap">
      <div class="ai-msg ai-msg-bot ai-welcome">
        <div class="ai-msg-content">
          <div class="ai-welcome-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4c-1.5 2.5-2 5-2 7.5s.5 4 2 5c1.5-1 2-2.5 2-5s-.5-5-2-7.5z"/>
              <path d="M7.5 8c-2 1-3.5 3.5-3.5 6.5 0 1 .4 2 1.5 2.5"/>
              <path d="M16.5 8c2 1 3.5 3.5 3.5 6.5 0 1-.4 2-1.5 2.5"/>
              <path d="M9.5 7.5c-1.5.5-2.5 2-3 4"/>
              <path d="M14.5 7.5c1.5.5 2.5 2 3 4"/>
              <line x1="12" y1="16.5" x2="12" y2="20"/>
              <path d="M9.5 20c.7-.5 1.6-.5 2.5 0 .9-.5 1.8-.5 2.5 0"/>
            </svg>
          </div>
          <p class="ai-welcome-title">南无阿弥陀佛</p>
          <p>您好！我是净土法音 AI 问答助手，可回答净土法门、佛号念诵、讲经内容等问题。</p>
          <p class="ai-disclaimer">AI 回答仅供参考，请以原始经典和法师开示为准。</p>
        </div>
      </div>
      <p class="ai-suggest-label">您可以这样问：</p>
      <div class="ai-suggest-wrap">
        <button class="ai-suggest-chip">什么是念佛法门</button>
        <button class="ai-suggest-chip">如何往生净土</button>
        <button class="ai-suggest-chip">信愿行是什么</button>
        <button class="ai-suggest-chip">临终助念方法</button>
      </div>
    </div>`;
}

function buildPageHTML() {
  return `
    <div class="ai-fs-header">
      <button class="ai-fs-back" id="aiFsBack" aria-label="返回">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ai-fs-title">
        <span class="ai-fs-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4c-1.5 2.5-2 5-2 7.5s.5 4 2 5c1.5-1 2-2.5 2-5s-.5-5-2-7.5z"/>
            <path d="M7.5 8c-2 1-3.5 3.5-3.5 6.5 0 1 .4 2 1.5 2.5"/>
            <path d="M16.5 8c2 1 3.5 3.5 3.5 6.5 0 1-.4 2-1.5 2.5"/>
            <path d="M9.5 7.5c-1.5.5-2.5 2-3 4"/>
            <path d="M14.5 7.5c1.5.5 2.5 2 3 4"/>
            <line x1="12" y1="16.5" x2="12" y2="20"/>
            <path d="M9.5 20c.7-.5 1.6-.5 2.5 0 .9-.5 1.8-.5 2.5 0"/>
          </svg>
        </span>
        <span>AI 问法</span>
      </div>
      <div class="ai-fs-actions">
        <button class="ai-fs-icon-btn" id="aiFsClear" aria-label="清空对话" title="清空对话">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
        <button class="ai-fs-icon-btn" id="aiFsShare" aria-label="分享">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
    </div>
    <div class="ai-fs-messages" id="aiFsMessages" role="log" aria-live="polite" aria-label="对话消息">
      ${buildWelcomeHTML()}
    </div>
    <div class="ai-fs-input-wrap">
      <div class="ai-fs-form-row" id="aiFsForm">
        <textarea class="ai-fs-input" id="aiFsInput"
               placeholder="输入您的问题…（Enter 发送，Shift+Enter 换行）"
               maxlength="${MAX_INPUT_LEN}" autocomplete="off" rows="1"
               aria-label="输入问题"></textarea>
        <button type="button" class="ai-fs-send" id="aiFsSend" aria-label="发送">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="ai-fs-input-footer">
        <span class="ai-char-count" id="aiFsCharCount" aria-live="polite">0/${MAX_INPUT_LEN}</span>
      </div>
    </div>`;
}

export function checkAiDeepLink() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'ai') openAiChat();
}

// Legacy compat — no-op
export function updateAiContext(seriesId, episodeNum) {
  aiContext = {
    seriesId: typeof seriesId === 'string' && seriesId ? seriesId : null,
    episodeNum: Number.isFinite(Number(episodeNum)) && Number(episodeNum) > 0 ? Number(episodeNum) : null,
  };
}
export function initAiChat() { }
