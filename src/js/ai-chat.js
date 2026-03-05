/* ===== AI 全屏聊天页 ===== */
import { askQuestion } from './ai-client.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { getDOM } from './dom.js';

let chatInstance = null;
const MAX_MESSAGES = 50;
const TYPEWRITER_SPEED = 25;
const WENKU_BASE = 'https://wenku.foyue.org';

// 当前问题（用于给 source 链接添加 ?q= 高亮参数）
let _lastQuestion = '';

/**
 * 打开全屏 AI 聊天页
 */
export function openAiChat() {
  if (chatInstance && chatInstance.isOpen) return;
  if (!chatInstance) createChatPage();
  chatInstance.show();
}

/**
 * 关闭全屏 AI 聊天页
 */
export function closeAiChat() {
  if (chatInstance) chatInstance.hide();
}

/**
 * AI 聊天是否打开
 */
export function isAiChatOpen() {
  return chatInstance ? chatInstance.isOpen : false;
}

function createChatPage() {
  let isLoading = false;
  const chatHistory = [];

  // 全屏聊天容器
  const page = document.createElement('div');
  page.className = 'ai-fullscreen';
  page.id = 'aiFullscreen';

  // Build HTML skeleton — content filled below
  page.innerHTML = buildPageHTML();

  const chatMessages = page.querySelector('#aiFsMessages');
  const chatForm = page.querySelector('#aiFsForm');
  const chatInput = page.querySelector('#aiFsInput');
  const chatSend = page.querySelector('#aiFsSend');

  // Back button
  page.querySelector('#aiFsBack').addEventListener('click', () => chatInstance.hide());

  // Share button
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

  // Suggested question chips
  page.querySelectorAll('.ai-suggest-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.textContent.trim();
      chatInput.value = q;
      chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

  chatForm.addEventListener('submit', handleSubmit);

  function onKeydown(e) {
    if (e.key === 'Escape' && chatInstance.isOpen) chatInstance.hide();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question || isLoading) return;

    // 隐藏建议问题
    const suggestWrap = page.querySelector('.ai-suggest-wrap');
    if (suggestWrap) suggestWrap.remove();

    _lastQuestion = question;
    addMessage('user', question);
    chatInput.value = '';
    isLoading = true;
    chatSend.disabled = true;
    chatSend.style.opacity = '0.5';
    showTyping();

    try {
      const result = await askQuestion(question, {
        history: chatHistory.slice(-6),
      });
      removeTyping();
      const answer = result.answer?.trim() || '抱歉，AI 暂时无法生成回答。';
      chatHistory.push({ role: 'user', content: question });
      chatHistory.push({ role: 'assistant', content: answer });
      if (chatHistory.length > 10) chatHistory.splice(0, chatHistory.length - 10);
      await typewriterMessage(answer, result.sources, result.disclaimer);
    } catch (err) {
      removeTyping();
      addMessage('error', err.message || '请求失败，请稍后再试');
    } finally {
      isLoading = false;
      chatSend.disabled = false;
      chatSend.style.opacity = '';
    }
  }

  /**
   * 从用户问题中提取关键词，用于文库高亮
   * 去掉疑问词和虚词，保留有意义的内容词
   */
  function extractHighlightQuery(question) {
    if (!question) return '';
    const stopWords = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;
    const cleaned = question.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || question;
  }

  function renderSourceTag(s) {
    const title = escapeHtml(s.title);
    if (s.doc_id) {
      const hlQuery = extractHighlightQuery(_lastQuestion);
      const qParam = hlQuery ? `?q=${encodeURIComponent(hlQuery)}` : '';
      const url = `${WENKU_BASE}/#/read/${encodeURIComponent(s.doc_id)}${qParam}`;
      return `<a class="ai-source-tag" href="${url}" target="_blank" rel="noopener">${title}</a>`;
    }
    return `<span class="ai-source-tag">${title}</span>`;
  }

  /**
   * 将 AI 回复文本格式化为 HTML
   * 引号开头的行渲染为 blockquote，"——" 开头渲染为出处
   */
  function formatAnswer(text) {
    const lines = text.split('\n');
    let html = '';
    let inQuote = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (inQuote) { html += '</blockquote>'; inQuote = false; }
        continue;
      }
      // 检测引文行：以中英文引号开头
      const isQuoteLine = /^[\u201C\u201D"\u300A""]/.test(line);
      // 检测出处行：以 —— 或 ── 或 ── 开头
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

  function addMessage(role, content, sources, disclaimer) {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const safeRole = ['user', 'bot', 'error'].includes(role) ? role : 'bot';
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${safeRole}`;
    let html = '<div class="ai-msg-content">';
    if (role === 'bot') {
      html += formatAnswer(content);
    } else {
      html += `<p>${escapeHtml(content)}</p>`;
    }
    if (role === 'bot' && sources && sources.length) {
      html += '<div class="ai-sources">' + sources.map(s => renderSourceTag(s)).join(' ') + '</div>';
    }
    if (role === 'bot' && disclaimer) {
      html += `<p class="ai-disclaimer">${escapeHtml(disclaimer)}</p>`;
    }
    html += '</div>';
    msg.innerHTML = html;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function typewriterMessage(content, sources, disclaimer) {
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg-bot';
    const msgContent = document.createElement('div');
    msgContent.className = 'ai-msg-content';
    const textEl = document.createElement('div');
    textEl.className = 'ai-typewriter';
    msgContent.appendChild(textEl);
    msg.appendChild(msgContent);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 按可见字符渲染（textContent 避免 entity 逐字符问题）
    const chars = [...content];
    let i = 0;
    return new Promise(resolve => {
      function tick() {
        // 每帧渲染 1 个字符
        if (i < chars.length) {
          textEl.textContent += chars[i];
          i++;
          chatMessages.scrollTop = chatMessages.scrollHeight;
          requestAnimationFrame(() => setTimeout(tick, TYPEWRITER_SPEED));
        } else {
          // 打字完成，替换为格式化内容
          textEl.classList.remove('ai-typewriter');
          textEl.innerHTML = formatAnswer(content);
          if (sources && sources.length) {
            const srcDiv = document.createElement('div');
            srcDiv.className = 'ai-sources';
            srcDiv.innerHTML = sources.map(s => renderSourceTag(s)).join(' ');
            msgContent.appendChild(srcDiv);
          }
          if (disclaimer) {
            const discP = document.createElement('p');
            discP.className = 'ai-disclaimer';
            discP.textContent = disclaimer;
            msgContent.appendChild(discP);
          }
          chatMessages.scrollTop = chatMessages.scrollHeight;
          resolve();
        }
      }
      tick();
    });
  }

  function showTyping() {
    const indicator = document.createElement('div');
    indicator.className = 'ai-msg ai-msg-bot ai-typing';
    indicator.setAttribute('aria-label', 'AI 正在思考');
    indicator.innerHTML = '<div class="ai-msg-content"><div class="ai-typing-dots"><span></span><span></span><span></span></div></div>';
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
      <div class="ai-msg ai-msg-bot">
        <div class="ai-msg-content">
          <p>您好！我是净土法音 AI 问答助手。您可以向我提问有关净土法门、佛号念诵、讲经内容等任何问题。</p>
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
      <button type="submit" class="ai-fs-send" id="aiFsSend" aria-label="发送">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="currentColor"/></svg>
      </button>
    </form>`;
}

/**
 * 检查 URL 是否需要自动打开 AI 聊天
 */
export function checkAiDeepLink() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'ai') {
    openAiChat();
  }
}

// Legacy compat — no-op
export function updateAiContext() {}
export function initAiChat() {}
