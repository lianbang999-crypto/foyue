/* ===== My Page ===== */
import { state } from './state.js';
import { t, getLang, setLang } from './i18n.js';
import { getDOM } from './dom.js';
import { isDark, toggleTheme } from './theme.js';
import { getHistory } from './history.js';
import { playList } from './player.js';
import { getDeferredPrompt, clearDeferredPrompt } from './pwa.js';
import { showToast } from './utils.js';

function fmtRelTime(ts) {
  const d = Date.now() - ts;
  const day = 86400000;
  if (d < day) return t('time_today');
  if (d < 2 * day) return t('time_yesterday');
  const n = Math.floor(d / day);
  return t('time_days_ago').replace('{n}', n);
}

export function renderMyPage() {
  const dom = getDOM();
  const lang = getLang();
  const dark = isDark();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const page = document.createElement('div');
  page.className = 'my-page active';
  const themeText = dark ? t('theme_dark') : t('theme_light');
  const langText = { zh: '中文', en: 'English', fr: 'Fran\u00E7ais' }[lang] || '中文';

  // Build history section
  const hist = getHistory();
  let histHTML = '';
  if (hist.length) {
    histHTML = hist.map((h, i) => {
      const pct = h.duration > 0 ? Math.round(h.time / h.duration * 100) : 0;
      return '<div class="my-history-item" data-hid="' + i + '">'
        + '<div class="my-history-icon"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></div>'
        + '<div class="my-history-body">'
        + '<div class="my-history-title">' + h.seriesTitle + '</div>'
        + '<div class="my-history-sub">' + h.epTitle + ' \u00B7 ' + pct + '%</div>'
        + '</div>'
        + '<div class="my-history-time">' + fmtRelTime(h.timestamp) + '</div>'
        + '</div>';
    }).join('');
  } else {
    histHTML = '<div class="my-history-empty" data-i18n="my_no_history">' + t('my_no_history') + '</div>';
  }

  // Build install guide section
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ua = navigator.userAgent;
  const isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
  let installHTML = '';
  if (!isStandalone && !isInApp) {
    let stepsHTML = '';
    if (isIOS && isSafari) {
      stepsHTML = '<div class="my-install-steps"><svg class="ios-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + t('my_install_ios') + '</div>';
    } else {
      stepsHTML = '<div class="my-install-steps">' + t('my_install_android') + '</div>'
        + '<button class="my-install-btn" id="myInstallBtn" data-i18n="my_install_btn">' + t('my_install_btn') + '</button>';
    }
    installHTML = `
    <div class="my-section">
      <div class="my-section-title" data-i18n="my_install">${t('my_install')}</div>
      <div class="my-install-card">
        <div class="my-install-top">
          <div class="my-install-icon"><svg viewBox="0 0 24 24"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg></div>
          <div class="my-install-text">
            <div class="my-install-text-title" data-i18n="my_install">${t('my_install')}</div>
            <div class="my-install-text-desc" data-i18n="my_install_desc">${t('my_install_desc')}</div>
          </div>
        </div>
        <div class="my-install-benefit" data-i18n="my_install_benefit">${t('my_install_benefit')}</div>
        ${stepsHTML}
      </div>
    </div>`;
  }

  page.innerHTML = `
    <div class="my-profile">
      <div class="my-avatar">
        <img src="/icons/logo.png" alt="净土法音" style="width:100%;height:100%;object-fit:contain;">
      </div>
      <div class="my-name" data-i18n="my_greeting">${t('my_greeting')}</div>
      <div class="my-subtitle" data-i18n="my_subtitle">${t('my_subtitle')}</div>
    </div>
    <div class="my-section">
      <div class="my-section-title" data-i18n="my_history">${t('my_history')}</div>
      <div class="my-list" id="myHistoryList">${histHTML}</div>
    </div>
    <div class="my-section">
      <div class="my-section-title" data-i18n="my_settings">${t('my_settings')}</div>
      <div class="my-list">
        <div class="my-item" id="myLangItem">
          <svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span class="my-item-label" data-i18n="my_lang">${t('my_lang')}</span>
          <span class="my-item-value" id="myLangValue">${langText}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item" id="myThemeItem">
          <svg class="my-item-icon" viewBox="0 0 24 24">${dark ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'}</svg>
          <span class="my-item-label" data-i18n="my_theme">${t('my_theme')}</span>
          <span class="my-item-value" id="myThemeValue">${themeText}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
      </div>
    </div>
    <div class="my-section">
      <div class="my-list">
        <div class="my-item" id="myAboutItem">
          <svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span class="my-item-label" data-i18n="my_about">${t('my_about')}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
      </div>
    </div>
    ${installHTML}
    <div class="my-namo">南无阿弥陀佛</div>
  `;
  dom.contentArea.appendChild(page);

  // Wire up history item clicks
  page.querySelectorAll('.my-history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.hid);
      const h = getHistory()[idx];
      if (!h) return;
      const cat = state.data.categories.find(c => c.id === h.catId);
      if (cat) {
        const sr = cat.series.find(s => s.id === h.seriesId);
        if (sr) { playList(sr.episodes, h.epIdx, sr, h.time); dom.expPlayer.classList.add('show'); }
      }
    });
  });

  // Wire up install button
  const installBtn = page.querySelector('#myInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      const deferredPrompt = getDeferredPrompt();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        clearDeferredPrompt();
        if (result.outcome === 'accepted') localStorage.setItem('pl-install-dismissed', String(Date.now()));
      } else {
        showToast(t('install_menu_hint'));
      }
    });
  }

  // Wire up My page items
  page.querySelector('#myLangItem').addEventListener('click', () => {
    const langs = ['zh', 'en', 'fr'];
    const i = (langs.indexOf(getLang()) + 1) % langs.length;
    setLang(langs[i], () => renderMyPage());
  });
  page.querySelector('#myThemeItem').addEventListener('click', () => {
    toggleTheme();
    renderMyPage();
  });
  page.querySelector('#myAboutItem').addEventListener('click', () => {
    document.getElementById('aboutOverlay').classList.add('show');
  });
}
