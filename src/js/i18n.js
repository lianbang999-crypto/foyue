import zhLocale from '../locales/zh.json';
import enLocale from '../locales/en.json';
import frLocale from '../locales/fr.json';

const I18N = { zh: zhLocale, en: enLocale, fr: frLocale };

let lang = 'zh';

export function detectLang() {
  const n = (navigator.language || '').toLowerCase();
  if (n.startsWith('fr')) return 'fr';
  if (n.startsWith('en')) return 'en';
  return 'zh';
}

export function t(k) {
  return (I18N[lang] || I18N.zh)[k] || I18N.zh[k] || k;
}

export function getLang() {
  return lang;
}

export function setLang(l, callback) {
  lang = l;
  localStorage.setItem('pl-lang', l);
  applyI18n();
  if (callback) callback();
}

export function initLang() {
  const saved = localStorage.getItem('pl-lang');
  lang = saved || detectLang();
}

export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (k) el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.dataset.i18nPlaceholder;
    if (k) el.placeholder = t(k);
  });
}
