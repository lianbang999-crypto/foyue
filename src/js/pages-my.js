/* ===== My Page ===== */
import { state } from './state.js';
import { t, getLang, setLang } from './i18n.js';
import { getDOM } from './dom.js';
import { toggleTheme, getTheme } from './theme.js';
import { getHistory, clearHistory } from './history.js';
import { playList } from './player.js';
import { promptInstall } from './pwa.js';
import { showToast, escapeHtml } from './utils.js';
import { getCachedCount, getCachedSize, clearAudioCache } from './audio-cache.js';

function fmtRelTime(ts) {
  const d = Date.now() - ts;
  const day = 86400000;
  if (d < day) return t('time_today');
  if (d < 2 * day) return t('time_yesterday');
  const n = Math.floor(d / day);
  return t('time_days_ago').replace('{n}', n);
}

function buildHistItem(h, i) {
  const pct = h.duration > 0 ? Math.round(h.time / h.duration * 100) : 0;
  // #15: Escape user-facing strings from localStorage to prevent XSS
  return '<div class="my-history-item" data-hid="' + i + '">'
    + '<div class="my-history-icon"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></div>'
    + '<div class="my-history-body">'
    + '<div class="my-history-title">' + escapeHtml(h.seriesTitle) + '</div>'
    + '<div class="my-history-sub">' + escapeHtml(h.epTitle) + ' · ' + fmtRelTime(h.timestamp) + '</div>'
    + '<div class="my-history-bar"><div class="my-history-bar-fill" style="width:' + pct + '%"></div></div>'
    + '</div>'
    + '</div>';
}

export function renderMyPage() {
  const dom = getDOM();
  const lang = getLang();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page,.practice-page').forEach(el => el.remove());

  const page = document.createElement('div');
  page.className = 'my-page active';
  const themeText = { light: t('theme_light'), dark: t('theme_dark'), terracotta: t('theme_terracotta'), ink: t('theme_ink') }[getTheme()] || t('theme_light');
  const langText = { zh: '中文', en: 'English', fr: 'Fran\u00E7ais' }[lang] || '中文';

  // Feature card subtitles
  const histCount = getHistory().length;
  const histDesc = histCount > 0
    ? t('my_history_desc').replace('{n}', histCount)
    : t('my_history_empty_desc');

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
        <picture><source srcset="/icons/about-logo.webp" type="image/webp"><img src="/icons/about-logo.png" alt="净土法音" style="width:100%;height:100%;object-fit:contain;"></picture>
      </div>
      <div class="my-name" data-i18n="my_greeting">${t('my_greeting')}</div>
      <div class="my-subtitle" data-i18n="my_subtitle">${t('my_subtitle')}</div>
    </div>
    <div class="my-section">
      <div class="my-list">
        <div class="my-item" id="myWenkuCard">
          <svg class="my-item-icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <div class="my-item-body">
            <span class="my-item-label">${t('my_wenku')}</span>
            <span class="my-item-desc">${t('my_wenku_desc')}</span>
          </div>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item" id="myHistoryCard">
          <svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div class="my-item-body">
            <span class="my-item-label">${t('my_history')}</span>
            <span class="my-item-desc">${histDesc}</span>
          </div>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
      </div>
    </div>
    <div class="my-section">
      <div class="my-section-title" data-i18n="my_settings">${t('my_settings')}</div>
      <div class="my-list">
        <div class="my-item" id="myDharmaNameItem">
          <svg class="my-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <div class="my-item-body">
            <span class="my-item-label">法名</span>
            <span class="my-item-desc" style="font-size:.72rem;color:var(--text-muted)">共修广场中的长期身份</span>
          </div>
          <span class="my-item-value" id="myDharmaNameValue">${((() => { try { return localStorage.getItem('gongxiu-nickname') || ''; } catch { return ''; } })()) || '未设置'}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item" id="myLangItem">
          <svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span class="my-item-label" data-i18n="my_lang">${t('my_lang')}</span>
          <span class="my-item-value" id="myLangValue">${langText}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item" id="myThemeItem">
          <svg class="my-item-icon" viewBox="0 0 24 24">${getTheme() === 'dark' ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' : getTheme() === 'terracotta' ? '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.6-10-9.6z"/><circle cx="6.5" cy="11.5" r="1.5"/><circle cx="10" cy="7.5" r="1.5"/><circle cx="14" cy="7.5" r="1.5"/><circle cx="17.5" cy="11.5" r="1.5"/>' : getTheme() === 'ink' ? '<path d="M18 3a3 3 0 0 0-3 3l-9 9a3 3 0 0 0 0 4.24 3 3 0 0 0 4.24 0l9-9A3 3 0 0 0 21 6a3 3 0 0 0-3-3z"/><line x1="3" y1="21" x2="6" y2="18"/>' : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'}</svg>
          <span class="my-item-label" data-i18n="my_theme">${t('my_theme')}</span>
          <span class="my-item-value" id="myThemeValue">${themeText}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item" id="myAboutItem">
          <svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span class="my-item-label" data-i18n="my_about">${t('my_about')}</span>
          <svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
        </div>
        <div class="my-item my-item-subtle" id="myCacheItem">
          <svg class="my-item-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          <span class="my-item-label" data-i18n="my_clear_cache">${t('my_clear_cache')}</span>
          <span class="my-item-value" id="myCacheSize">…</span>
        </div>
      </div>
    </div>
    ${installHTML}
    <div class="my-namo">南无阿弥陀佛</div>
  `;
  dom.contentArea.appendChild(page);

  page.querySelector('#myHistoryCard').addEventListener('click', () => showHistorySubview());
  page.querySelector('#myWenkuCard').addEventListener('click', () => {
    import('./wenku.js').then(mod => mod.renderWenkuHome(() => renderMyPage()));
  });

  // Prefetch wenku series data in background to speed up first open of 文库
  // Uses idle callback (or fallback timeout) so it doesn't compete with primary page rendering
  const _prefetchWenku = () => {
    import('./wenku-api.js').then(m => m.getWenkuSeries()).catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(_prefetchWenku, { timeout: 3000 });
  } else {
    setTimeout(_prefetchWenku, 1000);
  }

  // Cache cleanup item — show count + size, tap to clear with confirmation; hidden when empty
  const cacheItemEl = page.querySelector('#myCacheItem');
  const cacheSizeEl = page.querySelector('#myCacheSize');
  cacheItemEl.style.display = 'none';
  let _cachedBytes = 0;
  Promise.all([getCachedCount(), getCachedSize()]).then(([n, bytes]) => {
    if (n > 0) {
      _cachedBytes = bytes;
      const mb = (bytes / (1024 * 1024)).toFixed(1);
      cacheSizeEl.textContent = t('my_cache_size').replace('{n}', n) + ' · ' + mb + ' MB';
      cacheItemEl.style.display = '';
    }
  });
  cacheItemEl.addEventListener('click', async () => {
    const mb = (_cachedBytes / (1024 * 1024)).toFixed(1);
    const msg = t('my_cache_confirm').replace('{mb}', mb);
    if (!window.confirm(msg)) return;
    await clearAudioCache();
    cacheItemEl.style.display = 'none';
    showToast(t('my_cache_freed').replace('{mb}', mb));
  });

  // Wire up install button
  const installBtn = page.querySelector('#myInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      await promptInstall();
    });
  }

  // Wire up settings items
  page.querySelector('#myDharmaNameItem').addEventListener('click', () => {
    showDharmaNameSheet(page);
  });
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

function showHistorySubview() {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page,.practice-page').forEach(el => el.remove());

  const view = document.createElement('div');
  view.className = 'view active';
  const hist = getHistory();
  const subText = hist.length > 0
    ? t('my_history_desc').replace('{n}', hist.length)
    : '';

  view.innerHTML = `<div class="ep-header">
    <button class="btn-back" id="histBackBtn"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
    <div class="ep-header-info">
      <div class="ep-header-title">${t('my_history')}</div>
      <div class="ep-header-sub">${subText}</div>
    </div>
    ${hist.length ? '<button class="my-history-clear" id="histClearBtn">' + t('my_clear_history') + '</button>' : ''}
  </div>
  <div id="histSubviewList"></div>`;

  dom.contentArea.appendChild(view);

  // Render history items
  const listEl = view.querySelector('#histSubviewList');
  if (hist.length === 0) {
    listEl.innerHTML = '<div class="my-history-empty">' + t('my_no_history') + '</div>';
  } else {
    listEl.innerHTML = '<div class="my-list">' + hist.map((h, i) => buildHistItem(h, i)).join('') + '</div>';
  }

  // Wire up history item clicks
  listEl.querySelectorAll('.my-history-item').forEach(el => {
    el.addEventListener('click', async () => {
      const idx = parseInt(el.dataset.hid);
      const h = getHistory()[idx];
      if (!h) return;
      if (!state.isDataFull && state.ensureFullData) {
        await state.ensureFullData({ rerenderHome: false });
      }
      const cat = state.data.categories.find(c => c.id === h.catId);
      if (cat) {
        const sr = cat.series.find(s => s.id === h.seriesId);
        if (sr) { playList(sr.episodes, h.epIdx, sr, h.time); dom.expPlayer.classList.add('show'); }
      }
    });
  });

  // Back button
  view.querySelector('#histBackBtn').addEventListener('click', () => renderMyPage());

  // Clear button
  const clearBtn = view.querySelector('#histClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearHistory();
      showHistorySubview();
    });
  }
}

function showGongxiuSubview() {
  const dom = getDOM();

  // Full-screen slide-in panel
  document.querySelectorAll('.gx-fullscreen').forEach(el => el.remove());
  const panel = document.createElement('div');
  panel.className = 'gx-fullscreen';
  panel.innerHTML = `
    <div class="gx-fs-header">
      <button class="btn-icon" id="gxFsBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span class="gx-fs-title">${t('my_gongxiu')}</span>
      <div style="width:44px;flex-shrink:0"></div>
    </div>
    <div class="gx-view-wrap" style="flex:1;overflow:hidden;position:relative">
      <div id="gxContent" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>
    </div>`;

  document.getElementById('app').appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('gx-fullscreen--in'));

  // Open counter shortcut
  const openCounter = () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => {
      panel.remove();
      import('./counter.js').then(mod => mod.openCounter());
    }, 320);
  };

  import('./gongxiu.js').then(mod => {
    mod.renderGongxiu(panel.querySelector('#gxContent'), openCounter);
  });

  panel.querySelector('#gxFsBack').addEventListener('click', () => {
    panel.classList.remove('gx-fullscreen--in');
    setTimeout(() => panel.remove(), 320);
  });
}

/** 法名设置 sheet —— 简洁输入框，与共修广场共用同一 localStorage key */
function showDharmaNameSheet(parentPage) {
  document.querySelectorAll('.dharma-name-sheet').forEach(el => el.remove());

  const saved = (() => { try { return localStorage.getItem('gongxiu-nickname') || ''; } catch { return ''; } })();
  const sheet = document.createElement('div');
  sheet.className = 'counter-goal-sheet dharma-name-sheet';
  sheet.innerHTML = `
    <div class="counter-goal-backdrop" id="dnBackdrop"></div>
    <div class="counter-goal-panel" style="gap:14px">
      <div class="counter-goal-panel-title">设定法名</div>
      <div style="font-size:.78rem;color:var(--text-secondary);line-height:1.6;margin-bottom:2px">
        法名是您在共修广场的长期身份，回向时也会以法名记录。<br>
        <span style="color:var(--text-muted)">如：净空、妙莲、法喜、法缘…</span>
      </div>
      <div class="counter-goal-custom-row">
        <input class="counter-goal-custom-input" id="dnInput" type="text" maxlength="20"
               placeholder="请输入法名" value="${escapeHtml(saved)}" autocomplete="off">
        <button class="counter-goal-custom-btn" id="dnConfirm">保存</button>
      </div>
      <button class="counter-goal-cancel" id="dnCancel">取消</button>
    </div>`;

  document.getElementById('app').appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('counter-goal-sheet--visible'));

  const close = () => {
    sheet.classList.remove('counter-goal-sheet--visible');
    setTimeout(() => sheet.remove(), 250);
  };

  sheet.querySelector('#dnBackdrop').addEventListener('click', close);
  sheet.querySelector('#dnCancel').addEventListener('click', close);
  sheet.querySelector('#dnInput').focus();

  const save = () => {
    const val = sheet.querySelector('#dnInput').value.trim();
    try { localStorage.setItem('gongxiu-nickname', val.slice(0, 20)); } catch { }
    // Update display in my-page
    const el = parentPage.querySelector('#myDharmaNameValue');
    if (el) el.textContent = val || '未设置';
    showToast(val ? `法名已设为：${val}` : '法名已清除');
    close();
  };

  sheet.querySelector('#dnConfirm').addEventListener('click', save);
  sheet.querySelector('#dnInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  });
}
