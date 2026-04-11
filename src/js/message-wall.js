/* ===== Message Wall / 留言墙 ===== */
import '../css/message-wall.css';
import { t } from './i18n.js';
import { escapeHtml, showToast, formatRelTime } from './utils.js';
import { get as storeGet, patch as storePatch } from './store.js';

const PAGE_SIZE = 20;
const MESSAGE_CACHE_PREFIX = 'message-wall-cache:';
const MESSAGE_CACHE_TTL = 60 * 1000;
let currentPage = 1;
let totalMessages = 0;
let isLoading = false;

/**
 * Render the message wall section into a container element.
 * Called from pages-my.js when "我的" page is rendered.
 */
export function renderMessageWall(container) {
  const section = document.createElement('div');
  section.className = 'my-section msg-wall';
  section.innerHTML = `
    <div class="msg-wall-header">
      <div class="msg-wall-title">${escapeHtml(t('msg_wall_title') || '莲友留言')}</div>
      <div class="msg-wall-count" id="msgWallCount"></div>
    </div>
    <div class="msg-compose" id="msgCompose">
      <textarea class="msg-input" id="msgInput" rows="3" maxlength="500"
                placeholder="${escapeHtml(t('msg_input_placeholder') || '写下你的心得感悟...')}"></textarea>
      <div class="msg-compose-footer">
        <input class="msg-nickname" id="msgNickname" type="text" maxlength="20"
               placeholder="${escapeHtml(t('msg_nickname_placeholder') || '昵称（选填）')}"
               value="${escapeHtml(getSavedNickname())}">
        <div class="msg-compose-actions">
          <span class="msg-char-count" id="msgCharCount">0/500</span>
          <button class="msg-submit" id="msgSubmit" disabled>${escapeHtml(t('msg_submit') || '发布')}</button>
        </div>
      </div>
    </div>
    <div class="msg-list" id="msgList">
      <div class="msg-loading">${escapeHtml(t('loading') || '加载中...')}</div>
    </div>
  `;
  container.appendChild(section);

  // Wire up events
  const input = section.querySelector('#msgInput');
  const charCount = section.querySelector('#msgCharCount');
  const submitBtn = section.querySelector('#msgSubmit');
  const nicknameInput = section.querySelector('#msgNickname');

  input.addEventListener('input', () => {
    const len = input.value.trim().length;
    charCount.textContent = `${len}/500`;
    submitBtn.disabled = len === 0;
    // Toggle active class on submit button
    submitBtn.classList.toggle('active', len > 0);
    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  submitBtn.addEventListener('click', () => submitMessage(input, nicknameInput, submitBtn, section));

  // Allow Ctrl+Enter / Cmd+Enter to submit
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submitBtn.disabled) {
      submitMessage(input, nicknameInput, submitBtn, section);
    }
  });

  // Load messages
  currentPage = 1;
  loadMessages(section);
}

async function submitMessage(input, nicknameInput, submitBtn, section) {
  const content = input.value.trim();
  if (!content) return;

  const nickname = nicknameInput.value.trim() || '莲友';
  submitBtn.disabled = true;
  submitBtn.textContent = t('msg_submitting') || '发布中...';

  try {
    const resp = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, content }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();

    // Save nickname for next time
    saveNickname(nickname);
    invalidateMessageCache();

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    section.querySelector('#msgCharCount').textContent = '0/500';

    showToast(t('msg_posted') || '留言发布成功');

    // Flash compose border green briefly
    const compose = section.querySelector('#msgCompose');
    compose.classList.add('msg-compose-success');
    setTimeout(() => compose.classList.remove('msg-compose-success'), 1200);

    // Prepend new message to list
    const list = section.querySelector('#msgList');
    const emptyMsg = list.querySelector('.msg-empty');
    if (emptyMsg) emptyMsg.remove();

    const msgEl = buildMessageCard(data.message || {
      id: Date.now(),
      nickname,
      content,
      created_at: new Date().toISOString(),
      pinned: 0,
    });
    msgEl.classList.add('msg-card-enter');
    list.insertBefore(msgEl, list.firstChild);

    totalMessages++;
    updateCount(section);
  } catch (err) {
    showToast(err.message || t('msg_post_fail') || '发布失败，请稍后重试');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t('msg_submit') || '发布';
  }
}

async function loadMessages(section, append = false) {
  if (isLoading) return;
  isLoading = true;

  const list = section.querySelector('#msgList');
  const cacheKey = getMessageCacheKey(currentPage, PAGE_SIZE);
  const cached = getCachedMessages(cacheKey);
  if (!append) {
    if (cached) {
      renderMessageResponse(section, cached, append);
    } else {
      list.innerHTML = `<div class="msg-loading">${escapeHtml(t('loading') || '加载中...')}</div>`;
    }
  }

  try {
    const resp = await fetch(`/api/messages?page=${currentPage}&limit=${PAGE_SIZE}`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    setCachedMessages(cacheKey, data);
    renderMessageResponse(section, data, append);
  } catch (err) {
    if (!append && !cached) {
      list.innerHTML = `<div class="msg-empty">${escapeHtml(t('msg_load_fail') || '留言加载失败')}</div>`;
    }
  } finally {
    isLoading = false;
  }
}

function renderMessageResponse(section, data, append) {
  const list = section.querySelector('#msgList');
  if (!append) list.innerHTML = '';

  const oldMore = list.querySelector('.msg-load-more');
  if (oldMore) oldMore.remove();

  const messages = data.messages || [];
  totalMessages = data.total || 0;
  updateCount(section);

  if (messages.length === 0 && currentPage === 1) {
    list.innerHTML = `<div class="msg-empty">${escapeHtml(t('msg_empty') || '还没有留言，来写第一条吧')}</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  messages.forEach(msg => frag.appendChild(buildMessageCard(msg)));
  list.appendChild(frag);

  if (currentPage * PAGE_SIZE < totalMessages) {
    const more = document.createElement('div');
    more.className = 'msg-load-more';
    more.textContent = t('msg_load_more') || '加载更多留言';
    more.addEventListener('click', () => {
      currentPage++;
      loadMessages(section, true);
    });
    list.appendChild(more);
  }
}

function buildMessageCard(msg) {
  const div = document.createElement('div');
  div.className = 'msg-card' + (msg.pinned ? ' pinned' : '');

  const initial = (msg.nickname || '莲')[0];
  const timeStr = formatRelativeTime(msg.created_at);

  div.innerHTML = `
    <div class="msg-card-top">
      <div class="msg-avatar">${escapeHtml(initial)}</div>
      <div class="msg-meta">
        <span class="msg-author">${escapeHtml(msg.nickname || '莲友')}</span>
        <span class="msg-time">${escapeHtml(timeStr)}</span>
      </div>
      ${msg.pinned ? `<span class="msg-pin-tag">${escapeHtml(t('msg_pinned') || '置顶')}</span>` : ''}
    </div>
    <div class="msg-body">${escapeHtml(msg.content || '')}</div>
  `;
  return div;
}

// formatRelativeTime is now formatRelTime from utils.js
const formatRelativeTime = formatRelTime;

function updateCount(section) {
  const el = section.querySelector('#msgWallCount');
  if (el) el.textContent = totalMessages > 0 ? `${totalMessages} 条` : '';
}

function getSavedNickname() {
  return (storeGet('profile') || {}).messageNickname || '';
}

function getMessageCacheKey(page, limit) {
  return `${MESSAGE_CACHE_PREFIX}${page}:${limit}`;
}

function getCachedMessages(cacheKey) {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed.ts || 0) > MESSAGE_CACHE_TTL) return null;
    return parsed.data || null;
  } catch {
    return null;
  }
}

function setCachedMessages(cacheKey, data) {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignore quota/storage failures.
  }
}

function invalidateMessageCache() {
  try {
    const keysToDelete = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(MESSAGE_CACHE_PREFIX)) keysToDelete.push(key);
    }
    keysToDelete.forEach(key => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage access failures.
  }
}

function saveNickname(name) {
  storePatch('profile', { messageNickname: (name || '').slice(0, 20) });
}
