/**
 * navigation.js — Tab switching + back navigation guard
 * Depends on: state.js, i18n.js, render.js
 */
(function(){
'use strict';

var App = window.App;

var TAB_I18N = {
  home: 'tab_home',
  tingjingtai: 'tab_lectures',
  youshengshu: 'tab_audiobooks',
  mypage: 'tab_my'
};

function initNavigation() {
  // Tab click handlers
  document.querySelectorAll('.tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      App.tab = btn.dataset.tab;
      App.seriesId = null;
      App.searchInput.value = '';
      App.navTitle.textContent = App.t(TAB_I18N[App.tab] || 'tab_lectures');
      App.navTitle.dataset.i18n = TAB_I18N[App.tab] || 'tab_lectures';
      if (App.tab === 'mypage') { App.renderMyPage(); }
      else if (App.tab === 'home') { App.renderHomePage(); }
      else { App.renderCategory(App.tab); }
    });
  });
}

/* ===== BACK NAVIGATION GUARD ===== */
function initBackGuard() {
  // Only needed in browser mode, not standalone PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (navigator.standalone) return;
  history.replaceState({ page: 'main' }, '');
  history.pushState({ page: 'guard' }, '');
  window.addEventListener('popstate', function(e) {
    // Expanded player open -> close it
    if (App.expPlayer.classList.contains('show')) {
      App.expPlayer.classList.remove('show');
      history.pushState({ page: 'guard' }, '');
      return;
    }
    // Episode detail view -> go back
    var epView = App.contentArea.querySelector('.ep-view');
    if (epView) {
      epView.remove();
      App.renderCategory(App.tab);
      history.pushState({ page: 'guard' }, '');
      return;
    }
    // Not on home -> switch to home
    if (App.tab !== 'home') {
      document.querySelector('.tab[data-tab="home"]').click();
      history.pushState({ page: 'guard' }, '');
      return;
    }
    // Already on home -> stay
    history.pushState({ page: 'guard' }, '');
  });
}

App.initNavigation = initNavigation;
App.initBackGuard = initBackGuard;
App.TAB_I18N = TAB_I18N;

})();
