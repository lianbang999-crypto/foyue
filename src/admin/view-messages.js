/* ===== Messages View ===== */

import { api } from './api.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

let currentStatus = 'all';
let currentPage = 1;
const PAGE_SIZE = 20;

export async function renderMessages(container) {
  currentPage = 1;
  container.innerHTML = '';

  // Filter tabs
  const tabs = document.createElement('div');
  tabs.className = 'adm-tabs';
  tabs.id = 'msgTabs';
  container.appendChild(tabs);

  // Message list container
  const listWrap = document.createElement('div');
  listWrap.id = 'msgListWrap';
  container.appendChild(listWrap);

  await loadCounts(tabs);
  await loadMessages(listWrap);
}

async function loadCounts(tabsEl) {
  const filters = [
    { key: 'all', label: '全部' },
    { key: 'approved', label: '已通过' },
    { key: 'pending', label: '待审核' },
    { key: 'hidden', label: '已隐藏' },
  ];
  tabsEl.innerHTML = filters.map(f =>
    `<button class="adm-tab${currentStatus === f.key ? ' active' : ''}" data-status="${f.key}">${f.label}</button>`
  ).join('');
  tabsEl.querySelectorAll('.adm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentStatus = btn.dataset.status;
      currentPage = 1;
      tabsEl.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('active', b.dataset.status === currentStatus));
      const wrap = document.getElementById('msgListWrap');
      if (wrap) loadMessages(wrap);
    });
  });
}

async function loadMessages(wrap) {
  wrap.innerHTML = '<div class="adm-loading">加载中...</div>';
  const params = `?page=${currentPage}&limit=${PAGE_SIZE}&status=${currentStatus}`;
  const data = await api.get('/messages' + params);
  if (!data) return;

  const messages = data.messages || [];
  const total = data.total || 0;
  wrap.innerHTML = '';

  if (!messages.length) {
    wrap.innerHTML = '<div class="adm-empty">暂无留言</div>';
    return;
  }

  messages.forEach(msg => {
    wrap.appendChild(buildCard(msg, wrap));
  });

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 1) {
    const nav = document.createElement('div');
    nav.className = 'adm-page-nav';
    if (currentPage > 1) {
      const prev = document.createElement('button');
      prev.className = 'adm-btn adm-btn-sm';
      prev.textContent = '上一页';
      prev.addEventListener('click', () => { currentPage--; loadMessages(wrap); });
      nav.appendChild(prev);
    }
    const info = document.createElement('span');
    info.textContent = `${currentPage} / ${totalPages}`;
    nav.appendChild(info);
    if (currentPage < totalPages) {
      const next = document.createElement('button');
      next.className = 'adm-btn adm-btn-sm';
      next.textContent = '下一页';
      next.addEventListener('click', () => { currentPage++; loadMessages(wrap); });
      nav.appendChild(next);
    }
    wrap.appendChild(nav);
  }
}

function buildCard(msg, wrap) {
  const card = document.createElement('div');
  card.className = 'adm-msg-card';
  card.dataset.id = msg.id;

  const statusBadge = {
    approved: '<span class="adm-badge adm-badge-green">已通过</span>',
    pending: '<span class="adm-badge adm-badge-yellow">待审核</span>',
    hidden: '<span class="adm-badge adm-badge-red">已隐藏</span>',
  };

  card.innerHTML = `
    <div class="adm-msg-header">
      <strong>${esc(msg.nickname || '莲友')}</strong>
      <span class="adm-text-muted">${(msg.ip_hash || '').slice(0, 8)}</span>
      <span class="adm-text-muted">${msg.created_at || ''}</span>
      ${statusBadge[msg.status] || ''}
      ${msg.pinned ? '<span class="adm-badge adm-badge-accent">置顶</span>' : ''}
    </div>
    <div class="adm-msg-body">${esc(msg.content || '')}</div>
    <div class="adm-msg-actions">
      ${msg.status !== 'approved' ? '<button class="adm-btn adm-btn-sm adm-btn-green" data-action="approve">通过</button>' : ''}
      ${msg.status !== 'hidden' ? '<button class="adm-btn adm-btn-sm adm-btn-yellow" data-action="hide">隐藏</button>' : ''}
      <button class="adm-btn adm-btn-sm" data-action="pin">${msg.pinned ? '取消置顶' : '置顶'}</button>
      <button class="adm-btn adm-btn-sm adm-btn-red" data-action="delete">删除</button>
    </div>
  `;

  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'delete') {
        if (!confirm('确定删除这条留言？')) return;
        await api.del('/messages/' + msg.id);
        card.remove();
        return;
      }
      if (action === 'approve') {
        await api.put('/messages/' + msg.id, { status: 'approved' });
      } else if (action === 'hide') {
        await api.put('/messages/' + msg.id, { status: 'hidden' });
      } else if (action === 'pin') {
        await api.put('/messages/' + msg.id, { pinned: msg.pinned ? 0 : 1 });
      }
      // Reload list to reflect changes
      loadMessages(wrap);
    });
  });

  return card;
}
