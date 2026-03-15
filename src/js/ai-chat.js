/* ===== AI 全屏聊天页 ===== */
import { askQuestionStream } from './ai-client.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { getDOM } from './dom.js';

let chatInstance = null;
const MAX_MESSAGES = 50;
const MAX_PERSIST = 20; // max messages to persist
const LS_KEY = 'ai-chat-history';

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
export function openAiChat() {
  if (chatInstance && chatInstance.isOpen) return;
  if (!chatInstance) createChatPage();
  chatInstance.show();
}

export function closeAiChat() {
  if (chatInstance) chatInstance.hide();
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

  // Restore persisted messages into DOM
  if (chatHistory.length > 0) {
    // Remove default welcome + suggestions
    const suggestWrap = page.querySelector('.ai-suggest-wrap');
    if (suggestWrap) suggestWrap.remove();
    for (const msg of chatHistory) {
      addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, msg.sources, msg.disclaimer, true);
    }
  }

  page.querySelector('#aiFsBack').addEventListener('click', () => chatInstance.hide());

  page.querySelector('#aiFsShare').addEventListener('click', () => {
    const url = window.location.origin + '/?tab=ai';
    if (navigator.share) {
      navigator.share({ title: 'AI 问法 — 净土法音', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        import('./utils.js').then(m => m.showToast(t('link_copied') || '链接已复制'));
      }).catch(() => {});
    }
  });

  page.querySelectorAll('.ai-suggest-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.textContent.trim();
      chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

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

  chatForm.addEventListener('submit', handleSubmit);

  // Voice input (Whisper) — temporarily disabled pending Whisper free-tier availability
  // const micBtn = page.querySelector('#aiFsMic');
  // Mic button stays hidden (style="display:none" in HTML)

  function onKeydown(e) {
    if (e.key === 'Escape' && chatInstance.isOpen) chatInstance.hide();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question || isLoading) return;

    const suggestWrap = page.querySelector('.ai-suggest-wrap');
    if (suggestWrap) suggestWrap.remove();

    _lastQuestion = question;
    addMessage('user', question);
    chatHistory.push({ role: 'user', content: question });
    chatInput.value = '';
    isLoading = true;
    chatSend.disabled = true;
    chatSend.style.opacity = '0.5';
    showTyping();

    try {
      // Streaming message container created lazily on first token
      let msgContent = null, textEl = null;
      let fullText = '';

      const finalData = await askQuestionStream(
        question,
        { history: chatHistory.slice(-6) },
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
      addMessage('error', err.message || '请求失败，请稍后再试');
    } finally {
      isLoading = false;
      chatSend.disabled = false;
      chatSend.style.opacity = '';
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

  const BOT_AVATAR = `<div class="ai-msg-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.09 3.26L16.36 6.36l-3.26 1.09L12 10.72l-1.09-3.27L7.64 6.36l3.27-1.1z"/><path d="M18 12l.73 2.18L20.91 14.91l-2.18.73L18 17.82l-.73-2.18-2.18-.73 2.18-.73z"/></svg></div>`;

  function addMessage(role, content, sources, disclaimer, silent) {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const safeRole = ['user', 'bot', 'error'].includes(role) ? role : 'bot';
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${safeRole}`;
    let html = '';
    if (safeRole === 'bot') html += BOT_AVATAR;
    html += '<div class="ai-msg-content">';
    if (role === 'bot') {
      html += formatAnswer(content);
    } else {
      html += `<p>${escapeHtml(content)}</p>`;
    }
    if (role === 'bot' && sources?.length) {
      html += '<div class="ai-sources">' + sources.map(s => renderSourceTag(s)).join(' ') + '</div>';
    }
    if (role === 'bot' && disclaimer) {
      html += `<p class="ai-disclaimer">${escapeHtml(disclaimer)}</p>`;
    }
    html += '</div>';
    msg.innerHTML = html;
    chatMessages.appendChild(msg);
    if (!silent) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function createStreamingMessage() {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg-bot';
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

  document.getElementById('app').appendChild(page);

  chatInstance = {
    isOpen: false,
    show() {
      page.classList.add('show');
      this.isOpen = true;
      document.addEventListener('keydown', onKeydown);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      const url = new URL(window.location);
      url.searchParams.set('tab', 'ai');
      window.history.pushState({ aiChat: true }, '', url);
    },
    hide() {
      page.classList.remove('show');
      this.isOpen = false;
      document.removeEventListener('keydown', onKeydown);
      const url = new URL(window.location);
      if (url.searchParams.get('tab') === 'ai') {
        url.searchParams.delete('tab');
        const cleanUrl = url.pathname + (url.search || '') + url.hash;
        window.history.replaceState({}, '', cleanUrl || '/');
      }
    },
  };
}

function buildPageHTML() {
  return `
    <div class="ai-fs-header">
      <button class="ai-fs-back" id="aiFsBack" aria-label="返回">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ai-fs-title">
        <svg class="ai-fs-title-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l1.09 3.26L16.36 6.36l-3.26 1.09L12 10.72l-1.09-3.27L7.64 6.36l3.27-1.1z"/>
          <path d="M18 12l.73 2.18L20.91 14.91l-2.18.73L18 17.82l-.73-2.18-2.18-.73 2.18-.73z"/>
        </svg>
        <span>AI 问法</span>
      </div>
      <button class="ai-fs-share" id="aiFsShare" aria-label="分享">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>
    <div class="ai-fs-messages" id="aiFsMessages" role="log" aria-live="polite">
      <div class="ai-msg ai-msg-bot ai-welcome">
        <div class="ai-msg-content">
          <div class="ai-welcome-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l1.09 3.26L16.36 6.36l-3.26 1.09L12 10.72l-1.09-3.27L7.64 6.36l3.27-1.1z"/>
              <path d="M18 12l.73 2.18L20.91 14.91l-2.18.73L18 17.82l-.73-2.18-2.18-.73 2.18-.73z"/>
            </svg>
          </div>
          <p>您好！我是净土法音 AI 问答助手。</p>
          <p>您可以向我提问有关净土法门、佛号念诵、讲经内容等任何问题。</p>
          <p class="ai-disclaimer">AI 回答仅供参考，请以原始经典和法师开示为准。</p>
        </div>
      </div>
      <div class="ai-suggest-wrap">
        <button class="ai-suggest-chip">什么是念佛法门</button>
        <button class="ai-suggest-chip">如何往生净土</button>
        <button class="ai-suggest-chip">信愿行是什么</button>
      </div>
    </div>
    <form class="ai-fs-form" id="aiFsForm">
      <input type="text" class="ai-fs-input" id="aiFsInput"
             placeholder="输入您的问题..." maxlength="500" autocomplete="off" />
      <button type="button" class="ai-fs-mic" id="aiFsMic" aria-label="语音输入" style="display:none">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <button type="submit" class="ai-fs-send" id="aiFsSend" aria-label="发送">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="currentColor"/></svg>
      </button>
    </form>`;
}

export function checkAiDeepLink() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'ai') openAiChat();
}

// Legacy compat — no-op
export function updateAiContext() {}
export function initAiChat() {}
