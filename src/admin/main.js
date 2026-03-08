/* ===== Admin Main Entry ===== */

import '../css/tokens.css';
import '../css/reset.css';
import '../css/admin.css';

import { isAuthenticated, initLogin, clearToken } from './auth.js';
import { initRouter, registerRoute } from './router.js';
import { renderDashboard } from './view-dashboard.js';
import { renderMessages } from './view-messages.js';
import { renderContent } from './view-content.js';
import { renderMonitor } from './view-monitor.js';
import { renderAI } from './view-ai.js';

(function init() {
  if (!isAuthenticated()) {
    initLogin(() => boot());
    return;
  }
  boot();
})();

function boot() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('adminMain').style.display = '';

  const content = document.getElementById('adminContent');
  const nav = document.getElementById('sidebarNav');

  const NAV_ITEMS = [
    { route: '#/dashboard', label: '数据概览', icon: 'chart' },
    { route: '#/monitor', label: '性能监控', icon: 'activity' },
    { route: '#/messages', label: '留言管理', icon: 'message' },
    { route: '#/content', label: '内容管理', icon: 'folder' },
    { route: '#/ai', label: 'AI 运营', icon: 'cpu' },
  ];

  nav.innerHTML = NAV_ITEMS.map(item =>
    `<a class="adm-nav-item" data-route="${item.route}" href="${item.route}">
       <span class="adm-nav-icon">${getNavIcon(item.icon)}</span>
       <span class="adm-nav-label">${item.label}</span>
     </a>`
  ).join('');

  registerRoute('#/dashboard', renderDashboard);
  registerRoute('#/monitor', renderMonitor);
  registerRoute('#/messages', renderMessages);
  registerRoute('#/content', renderContent);
  registerRoute('#/ai', renderAI);

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearToken();
    location.reload();
  });

  initRouter(content, nav);
}

function getNavIcon(type) {
  const icons = {
    chart: '<svg viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>',
    activity: '<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    cpu: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>',
  };
  return icons[type] || '';
}
