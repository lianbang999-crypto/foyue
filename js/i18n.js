/**
 * i18n.js — Internationalization engine
 * Depends on: state.js (App._langs, App.lang)
 */
(function(){
'use strict';

var App = window.App;

function detectLang() {
  var n = (navigator.language || '').toLowerCase();
  if (n.startsWith('fr')) return 'fr';
  if (n.startsWith('en')) return 'en';
  return 'zh';
}

function t(k) {
  return (App._langs[App.lang] || App._langs.zh)[k] || (App._langs.zh)[k] || k;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var k = el.dataset.i18n;
    if (k) el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var k = el.dataset.i18nPlaceholder;
    if (k) el.placeholder = t(k);
  });
  if (App.data && !App.seriesId) {
    if (App.tab === 'mypage') App.renderMyPage();
    else if (App.tab === 'home') App.renderHomePage();
    else App.renderCategory(App.tab);
  }
}

function setLang(l) {
  App.lang = l;
  localStorage.setItem('pl-lang', l);
  applyI18n();
  App.events.emit('lang-changed', l);
}

// Expose on App
App.detectLang = detectLang;
App.t = t;
App.applyI18n = applyI18n;
App.setLang = setLang;

})();
