/* ===== AI 聊天面板组件 ===== */
import { askQuestion } from './ai-client.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';

let chatInstance = null;
const MAX_MESSAGES = 50;

/**
 * 初始化 AI 聊天面板
 * @param {HTMLElement} container - 挂载容器
 */
export function initAiChat(container) {
  if (chatInstance) return chatInstance;

  let isOpen = false;
  let isLoading = false;
  let currentContext = {};

  // 悬浮按钮
  const btn = document.createElement('button');
  btn.className = 'ai-chat-btn';
  btn.id = 'aiChatBtn';
  btn.setAttribute('aria-label', 'AI问答');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg class="ai-btn-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.6"/></svg><span>问法</span>';

  // 面板
  const panel = document.createElement('div');
  panel.className = 'ai-chat-panel hidden';
  panel.id = 'aiChatPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI问答面板');
  panel.innerHTML = `
    <div class="ai-chat-header">
      <span class="ai-chat-title">AI 问答助手</span>
      <span class="ai-chat-context" id="aiChatContext"></span>
      <button class="ai-chat-close" aria-label="关闭">&times;</button>
    </div>
    <div class="ai-chat-messages" id="aiChatMessages" role="log" aria-live="polite">
      <div class="ai-msg ai-msg-bot">
        <div class="ai-msg-content">
          <p>您好！我是佛法问答助手。可以就当前收听的内容向我提问。</p>
          <p class="ai-disclaimer">AI回答仅供参考，请以原始经典为准。</p>
        </div>
      </div>
    </div>
    <form class="ai-chat-form" id="aiChatForm">
      <input type="text" class="ai-chat-input" id="aiChatInput"
             placeholder="输入您的问题..." maxlength="500" autocomplete="off" />
      <button type="submit" class="ai-chat-send" id="aiChatSend" aria-label="发送">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="currentColor"/></svg>
      </button>
    </form>
  `;

  // Cache DOM refs
  const chatInput = panel.querySelector('#aiChatInput');
  const chatMessages = panel.querySelector('#aiChatMessages');
  const chatForm = panel.querySelector('#aiChatForm');
  const chatSend = panel.querySelector('#aiChatSend');
  const chatContext = panel.querySelector('#aiChatContext');

  // 事件绑定
  btn.addEventListener('click', () => toggle());
  panel.querySelector('.ai-chat-close').addEventListener('click', () => toggle(false));
  chatForm.addEventListener('submit', handleSubmit);

  // 点击面板外关闭
  function onDocClick(e) {
    if (isOpen && !panel.contains(e.target) && !btn.contains(e.target)) {
      toggle(false);
    }
  }
  document.addEventListener('click', onDocClick);

  // ESC 键关闭
  function onDocKeydown(e) {
    if (e.key === 'Escape' && isOpen) toggle(false);
  }
  document.addEventListener('keydown', onDocKeydown);

  function toggle(force) {
    isOpen = force !== undefined ? force : !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      // 不自动 focus 输入框避免移动端键盘弹出问题
      // 用户可以主动点击输入框
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question || isLoading) return;

    addMessage('user', question);
    chatInput.value = '';
    isLoading = true;
    chatSend.disabled = true;
    chatSend.style.opacity = '0.5';
    showTyping();

    try {
      const result = await askQuestion(question, currentContext);
      removeTyping();
      const answer = result.answer?.trim() || '抱歉，AI 暂时无法生成回答。';
      addMessage('bot', answer, result.sources, result.disclaimer);
    } catch (err) {
      removeTyping();
      addMessage('error', err.message || '请求失败，请稍后再试');
    } finally {
      isLoading = false;
      chatSend.disabled = false;
      chatSend.style.opacity = '';
    }
  }

  function addMessage(role, content, sources, disclaimer) {
    // 限制消息数量（保留第一条欢迎消息）
    while (chatMessages.children.length > MAX_MESSAGES) {
      chatMessages.removeChild(chatMessages.children[1]);
    }

    const safeRole = ['user', 'bot', 'error'].includes(role) ? role : 'bot';
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${safeRole}`;

    let html = '<div class="ai-msg-content">';
    html += `<p>${escapeHtml(content)}</p>`;

    if (role === 'bot' && sources && sources.length) {
      html += '<div class="ai-sources">参考：';
      html += sources.map(s =>
        `<span class="ai-source-tag">${escapeHtml(s.title)}</span>`
      ).join(' ');
      html += '</div>';
    }

    if (role === 'bot' && disclaimer) {
      html += `<p class="ai-disclaimer">${escapeHtml(disclaimer)}</p>`;
    }

    html += '</div>';
    msg.innerHTML = html;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    const el = panel.querySelector('.ai-typing');
    if (el) el.remove();
  }

  function updateContextDisplay() {
    if (!chatContext) return;
    if (currentContext.series_id) {
      chatContext.textContent = `· ${currentContext.series_id}`;
      chatContext.style.display = '';
    } else {
      chatContext.textContent = '';
      chatContext.style.display = 'none';
    }
  }

  container.appendChild(btn);
  container.appendChild(panel);

  chatInstance = {
    toggle,
    setContext(ctx) {
      currentContext = ctx;
      updateContextDisplay();
    },
    destroy() {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKeydown);
      btn.remove();
      panel.remove();
      chatInstance = null;
    },
  };

  return chatInstance;
}

/**
 * 更新 AI 聊天的上下文（当前播放的系列/集）
 */
export function updateAiContext(seriesId, episodeId) {
  if (chatInstance) {
    chatInstance.setContext({
      series_id: seriesId || undefined,
      episode_id: episodeId || undefined,
    });
  }
}
