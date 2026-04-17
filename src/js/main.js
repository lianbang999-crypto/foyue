/* ===== 净土法音 — Main Entry Point ===== */

// CSS imports (Vite will bundle these)
import '../css/tokens.css';
import '../css/reset.css';
import '../css/ui.css';
import '../css/layout.css';
import '../css/player.css';
import '../css/cards.css';
import '../css/pages.css';
import '../css/components.css';
import '../css/share.css';
// AI / 文库 / 共修等独立页样式在各自入口中按需加载，主站仅保留共享 UI。
import { state, beginContentRequest, isContentRequestCurrent, getCurrentTrack } from './state.js';
import { initDOM, getDOM } from './dom.js';
import { initLang, applyI18n, t } from './i18n.js';
import { initTheme } from './theme.js';
import { seekCalc, seekUI, seekCommit, showToast, showFloatText, haptic } from './utils.js';
import { seedCachedDurationsFromData, seedCachedDurationsFromEpisodes } from './duration-cache.js';
import { seedCachedAudioMetaFromData, seedCachedAudioMetaFromEpisodes } from './audio-meta-cache.js';
import {
  playList, prepareList, togglePlay, prevTrack, nextTrack,
  cycleLoop, cycleSpeed, cycleSleepTimer,
  shareTrack,
  onTimeUpdate, onEnded, onAudioError,
  setPlayState, highlightEp,
  togglePlaylist, closePlaylist, getPlaylistVisible, saveState, restoreState,
  getIsSwitching, getIsRecovering, setDragging, initPlaylistTabs, closeFullScreen,
  openFullScreen,
  markAppreciated, updateAppreciateBtn, appreciateSuccess,
  retryPlayback, startStallWatch, clearStallWatch, setBuffering,
  onVisibilityResume, reconcilePlaybackUiAfterForeground,
} from './player.js';
import { renderHomePage, invalidateHomePage } from './pages-home.js';
import { renderMyPage } from './pages-my.js';
const AI_CONTEXT_KEY = 'ai-latest-context';

function updateAiContext(seriesId, episodeNum) {
  const payload = {
    seriesId: typeof seriesId === 'string' && seriesId ? seriesId : null,
    episodeNum: Number.isFinite(Number(episodeNum)) && Number(episodeNum) > 0 ? Number(episodeNum) : null,
    updatedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(AI_CONTEXT_KEY, JSON.stringify(payload));
  } catch { }
}
function checkAiDeepLink() {
  const p = new URLSearchParams(location.search);
  if (p.get('tab') === 'ai') window.location.href = '/ai';
}
// ✅ 修复代码分割警告：统一使用动态导入，避免静态和动态导入混用
// import { renderCategory, showEpisodes } from './pages-category.js';
import { doSearch, openSearchOverlay, closeSearchOverlay, isSearchOverlayOpen } from './search.js';
import { get as storeGet, patch as storePatch, saveNow as storeSaveNow } from './store.js';
import { initCachedUrls } from './audio-cache.js';

// pages-category 动态导入函数
let _categoryModule = null;
async function getCategoryModule() {
  if (!_categoryModule) _categoryModule = await import('./pages-category.js');
  return _categoryModule;
}
export function renderCategory(...args) {
  return getCategoryModule().then(mod => mod.renderCategory(...args));
}
export function showEpisodes(...args) {
  return getCategoryModule().then(mod => mod.showEpisodes(...args));
}
import { initInstallPrompt, initBackGuard, initRefreshPrompt, observeRefreshRegistration, isInAppBrowser } from './pwa.js';
import { appreciate } from './api.js';
import { downloadAudio, DL_STATE } from './audio-download.js';
import { monitor } from './monitor.js';

const IN_APP_BROWSER = isInAppBrowser();
const APP_BOOT_TS = performance.now();
const STANDALONE_LAUNCH_LOADER_MIN_MS = 900;
let homeBootstrapPromise = null;

function getBootLoaderMarkup(message = '正在整理今日法音...') {
  return `<div class="loader-brand">
      <picture>
        <source srcset="/icons/loading-logo.webp" type="image/webp"><img class="loader-logo" src="/icons/loading-logo.png" alt="净土法音">
      </picture>
      <div class="loader-copy">
        <div class="loader-kicker">净土法音</div>
        <div class="loader-text">${message}</div>
      </div>
    </div>
    <div class="loader-home-skeleton" aria-hidden="true">
      <div class="loader-home-hero loader-block"></div>
      <div class="loader-home-pills">
        <span class="loader-pill loader-block"></span>
        <span class="loader-pill loader-block"></span>
        <span class="loader-pill loader-block"></span>
      </div>
      <div class="loader-home-list">
        <div class="loader-home-card">
          <div class="loader-home-icon loader-block"></div>
          <div class="loader-home-lines">
            <span class="loader-line loader-block loader-line-lg"></span>
            <span class="loader-line loader-block"></span>
            <span class="loader-line loader-block loader-line-sm"></span>
          </div>
        </div>
        <div class="loader-home-card">
          <div class="loader-home-icon loader-block"></div>
          <div class="loader-home-lines">
            <span class="loader-line loader-block loader-line-lg"></span>
            <span class="loader-line loader-block"></span>
            <span class="loader-line loader-block loader-line-sm"></span>
          </div>
        </div>
        <div class="loader-home-card">
          <div class="loader-home-icon loader-block"></div>
          <div class="loader-home-lines">
            <span class="loader-line loader-block loader-line-lg"></span>
            <span class="loader-line loader-block"></span>
            <span class="loader-line loader-block loader-line-sm"></span>
          </div>
        </div>
      </div>
    </div>`;
}

function warmHomeBootstrapData() {
  if (!homeBootstrapPromise) {
    homeBootstrapPromise = fetchCategoriesData({ home: true }).catch(() => null);
  }
  return homeBootstrapPromise;
}

async function consumeHomeBootstrapData() {
  if (!homeBootstrapPromise) return fetchCategoriesData({ home: true });
  const pending = homeBootstrapPromise;
  homeBootstrapPromise = null;
  const data = await pending;
  return data || fetchCategoriesData({ home: true });
}

function isStandaloneLaunchMode() {
  return window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
}

async function hideBootLoader(dom) {
  if (!dom?.loader || dom.loader.style.display === 'none') return;
  if (isStandaloneLaunchMode()) {
    const elapsed = performance.now() - APP_BOOT_TS;
    const remaining = STANDALONE_LAUNCH_LOADER_MIN_MS - elapsed;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }
  dom.loader.style.display = 'none';
}

function getTextOrFallback(key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

let fullDataHydrationScheduled = false;
function scheduleBackgroundFullDataRestore() {
  if (state.isDataFull || state.fullDataPromise || fullDataHydrationScheduled) return;
  fullDataHydrationScheduled = true;

  const playerState = storeGet('player');
  const needsRestoreSoon = !!playerState?.seriesId && !canRestoreFromCurrentData();

  const runner = () => {
    ensureFullData({ rerenderHome: false }).then(() => {
      if (!canRestoreFromCurrentData()) return;
      const savedPlayer = storeGet('player');
      if (savedPlayer?.seriesId && state.epIdx < 0) restoreState();
    }).catch(() => { }).finally(() => {
      fullDataHydrationScheduled = false;
    });
  };

  if (needsRestoreSoon) {
    setTimeout(runner, 250);
    return;
  }

  if (typeof requestIdleCallback === 'function') requestIdleCallback(runner, { timeout: 3500 });
  else setTimeout(runner, 1200);
}

function showCategorySwitchLoader() {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const wrap = document.createElement('div');
  wrap.className = 'view active';
  wrap.innerHTML = `<div class="loader"><div class="loader-text">${getTextOrFallback('loading_retry', '加载中，请稍候...')}</div></div>`;
  dom.contentArea.appendChild(wrap);
}

function showCategorySwitchError(tabId) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const wrap = document.createElement('div');
  wrap.className = 'view active';
  wrap.innerHTML = `<div class="error-msg">${getTextOrFallback('loading_fail', '加载失败，请稍后重试')}<br><button id="retryCategoryLoadBtn">${t('retry')}</button></div>`;
  dom.contentArea.appendChild(wrap);
  const retryBtn = wrap.querySelector('#retryCategoryLoadBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
      if (tabBtn) tabBtn.click();
    });
  }
}

function activateRootTab(tabId) {
  const dom = getDOM();
  state.tab = tabId;
  document.querySelectorAll('.tab').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function renderHomeRoot() {
  activateRootTab('home');
  renderHomePage();
}

function buildCategoriesUrl({ home = false } = {}) {
  const CATEGORY_API_VERSION = '3';
  const params = new URLSearchParams();
  if (home) params.set('home', '1');
  params.set('v', CATEGORY_API_VERSION);
  const query = params.toString();
  return '/api/categories' + (query ? `?${query}` : '');
}

function buildCategoryUrl(categoryId) {
  const CATEGORY_API_VERSION = '3';
  return `/api/category/${encodeURIComponent(categoryId)}?v=${CATEGORY_API_VERSION}`;
}

function buildSeriesUrl(seriesId) {
  return `/api/series/${encodeURIComponent(seriesId)}`;
}

async function fetchCategoriesData({ home = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(buildCategoriesUrl({ home }), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (import.meta.env.DEV) {
      // 仅开发环境使用 mock 数据
      console.warn('[DEV] Using mock data:', error.message);
      const { mockCategoriesData } = await import('./mock-data.js');
      return mockCategoriesData;
    }
    throw error;
  }
}

async function fetchCategoryData(categoryId) {
  const response = await fetch(buildCategoryUrl(categoryId));
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function fetchSeriesData(seriesId) {
  const response = await fetch(buildSeriesUrl(seriesId));
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function findSeriesInData(seriesId) {
  if (!state.data || !seriesId) return null;
  for (const cat of state.data.categories || []) {
    const series = cat.series.find(item => item.id === seriesId);
    if (series) return { cat, series };
  }
  return null;
}

function applyLoadedData(data) {
  seedCachedDurationsFromData(data);
  seedCachedAudioMetaFromData(data);
  state.data = data;
  state.isDataFull = data?.mode !== 'home';
}

function mergeCategoryIntoState(category) {
  seedCachedDurationsFromData({ categories: [category] });
  seedCachedAudioMetaFromData({ categories: [category] });
  if (!state.data) {
    state.data = { mode: 'partial', categories: [category] };
    state.isDataFull = false;
    return category;
  }

  const categories = Array.isArray(state.data.categories) ? [...state.data.categories] : [];
  const idx = categories.findIndex(item => item.id === category.id);
  if (idx >= 0) categories[idx] = { ...categories[idx], ...category };
  else categories.push(category);
  state.data = { ...state.data, mode: state.isDataFull ? state.data.mode : 'partial', categories };
  return idx >= 0 ? categories[idx] : category;
}

function mergeSeriesIntoState(series) {
  seedCachedDurationsFromEpisodes(series?.episodes);
  seedCachedAudioMetaFromEpisodes(series?.episodes);
  if (!state.data?.categories) return series;
  const categories = state.data.categories.map(cat => {
    if (cat.id !== series.categoryId) return cat;
    const list = Array.isArray(cat.series) ? [...cat.series] : [];
    const idx = list.findIndex(item => item.id === series.id);
    const mergedSeries = idx >= 0 ? { ...list[idx], ...series } : series;
    if (idx >= 0) list[idx] = mergedSeries;
    else list.push(mergedSeries);
    return { ...cat, _categoryLoaded: true, series: list };
  });
  state.data = { ...state.data, categories };
  return findSeriesInData(series.id)?.series || series;
}

const categoryLoaders = new Map();
const seriesLoaders = new Map();

async function ensureCategoryData(categoryId) {
  if (!categoryId || categoryId === 'home' || categoryId === 'mypage') return null;
  if (state.isDataFull) return state.data?.categories?.find(cat => cat.id === categoryId) || null;

  const existing = state.data?.categories?.find(cat => cat.id === categoryId);
  if (existing?._categoryLoaded) return existing;
  if (categoryLoaders.has(categoryId)) return categoryLoaders.get(categoryId);

  const promise = (async () => {
    const payload = await fetchCategoryData(categoryId);
    if (!payload?.category) throw new Error('Category not found');
    return mergeCategoryIntoState(payload.category);
  })();

  categoryLoaders.set(categoryId, promise);
  try {
    return await promise;
  } finally {
    categoryLoaders.delete(categoryId);
  }
}

async function ensureSeriesDetail(seriesId, categoryId) {
  if (!seriesId) return null;
  if (state.isDataFull) return findSeriesInData(seriesId)?.series || null;

  const existing = findSeriesInData(seriesId)?.series;
  if (existing?.episodes?.length) return existing;
  if (seriesLoaders.has(seriesId)) return seriesLoaders.get(seriesId);

  const promise = (async () => {
    // ✅ P1优化：并行获取分类数据和专辑详情，节省一个网络往返
    const fetches = [fetchSeriesData(seriesId)];
    if (categoryId) fetches.push(ensureCategoryData(categoryId).catch(() => null));
    const [payload] = await Promise.all(fetches);
    if (!payload || payload.error) throw new Error(payload?.error || 'Series not found');
    return mergeSeriesIntoState(payload);
  })();

  seriesLoaders.set(seriesId, promise);
  try {
    return await promise;
  } finally {
    seriesLoaders.delete(seriesId);
  }
}

/* ===== INIT ===== */
(function init() {
  // Language & Theme
  initLang();
  initTheme();

  // DOM refs
  const dom = initDOM();

  state.isFirstVisit = !storeGet('player')?.seriesId;

  if (!needsImmediateFullData()) warmHomeBootstrapData();

  // About modal
  const aboutOverlay = document.getElementById('aboutOverlay');
  document.getElementById('aboutClose').addEventListener('click', () => aboutOverlay.classList.remove('show'));
  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.classList.remove('show');
  });

  // AI Chat button (header pill) → 跳转独立 AI 页面
  document.getElementById('btnAiChat').addEventListener('click', (e) => {
    haptic();
    const btn = e.currentTarget;
    btn.classList.add('tapped');
    // 给动画 350ms 时间播放后再跳转
    setTimeout(() => { window.location.href = '/ai'; }, 180);
  });

  // Search button (header icon)
  document.getElementById('btnSearch').addEventListener('click', () => {
    haptic();
    openSearchOverlay();
    if (!state.isDataFull && state.ensureFullData) state.ensureFullData();
  });

  // One-time setup: scroll listener for translucent header (must not be inside tab click handler)
  dom.contentArea.addEventListener('scroll', () => {
    const isScrolled = dom.contentArea.scrollTop > 10;
    if (dom.header) dom.header.classList.toggle('scrolled', isScrolled);
  }, { passive: true });

  // One-time setup: EQ logo animation in header (replaces old audio indicator)
  const navAudioIndicator = document.getElementById('navAudioIndicator');
  if (navAudioIndicator) {
    const updateAudioIndicator = () => {
      if (dom.audio.src && !dom.audio.paused) {
        navAudioIndicator.classList.add('playing');
        navAudioIndicator.classList.remove('paused');
      } else if (dom.audio.src) {
        navAudioIndicator.classList.remove('playing');
        navAudioIndicator.classList.add('paused');
      } else {
        navAudioIndicator.classList.remove('playing', 'paused');
      }
    };
    navAudioIndicator.addEventListener('click', () => {
      if (dom.audio.src) openFullScreen();
    });
    dom.audio.addEventListener('play', updateAudioIndicator);
    dom.audio.addEventListener('pause', updateAudioIndicator);
    dom.audio.addEventListener('loadstart', updateAudioIndicator);
    dom.audio.addEventListener('emptied', updateAudioIndicator);
  }

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const requestId = beginContentRequest();
      const nextTab = btn.dataset.tab;
      state.seriesId = null;
      activateRootTab(nextTab);

      if (nextTab === 'home') {
        if (!isContentRequestCurrent(requestId)) return;
        renderHomePage();
      } else if (nextTab === 'mypage') {
        if (!isContentRequestCurrent(requestId)) return;
        renderMyPage();
      } else {
        try {
          if (!state.isDataFull && state.ensureCategoryData) {
            const catAlreadyLoaded = state.data?.categories?.find(cat => cat.id === nextTab)?._categoryLoaded;
            if (!catAlreadyLoaded) {
              if (!IN_APP_BROWSER) showToast(getTextOrFallback('loading_retry', '连接中，请稍候...'));
              showCategorySwitchLoader();
            }
            await state.ensureCategoryData(nextTab);
          }
        } catch {
          if (!isContentRequestCurrent(requestId)) return;
          const fallbackCategory = state.data?.categories?.find(cat => cat.id === nextTab);
          if (fallbackCategory?.series?.length) {
            renderCategory(nextTab);
          } else {
            showCategorySwitchError(nextTab);
          }
          return;
        }
        if (!isContentRequestCurrent(requestId)) return;
        renderCategory(nextTab);
      }
    });
  });

  // Center play button - start dimmed when no audio loaded
  if (dom.centerPlayBtn) dom.centerPlayBtn.classList.add('no-audio');

  // Center play button - open expanded player, or toggle play if already in expanded view
  if (dom.centerPlayBtn) {
    dom.centerPlayBtn.addEventListener('click', () => {
      haptic();
      if (dom.centerPlayBtn.classList.contains('error')) {
        retryPlayback();
        return;
      }
      if (!dom.audio.src && !state.playlist.length) return;
      if (dom.audio.src) {
        // If fullscreen is not open, open it without changing play state
        if (!dom.expPlayer.classList.contains('show')) {
          // Reuse the main playback path so buffering / ghost recovery stays consistent.
          if (dom.audio.paused) {
            togglePlay();
          }
          openFullScreen();
        } else {
          // Fullscreen already open, toggle play/pause
          togglePlay();
        }
      } else {
        openFullScreen();
      }
    });
  }

  // Player controls
  function bindTouchSafeActivation(el, handler) {
    let lastTouchEndAt = 0;
    el.addEventListener('touchend', (e) => {
      lastTouchEndAt = Date.now();
      e.preventDefault();
      handler();
    }, { passive: false });
    el.addEventListener('click', () => {
      if (Date.now() - lastTouchEndAt < 700) return;
      handler();
    });
  }

  dom.btnPlay.addEventListener('click', () => { haptic(); togglePlay(); });
  dom.expPlay.addEventListener('click', () => { haptic(); togglePlay(); });
  document.getElementById('btnPrev').addEventListener('click', () => { haptic(); prevTrack(); });
  document.getElementById('expPrev').addEventListener('click', () => { haptic(); prevTrack(); });
  document.getElementById('btnNext').addEventListener('click', () => { haptic(); nextTrack(); });
  document.getElementById('expNext').addEventListener('click', () => { haptic(); nextTrack(); });
  bindTouchSafeActivation(document.getElementById('expLoop'), () => { haptic(); cycleLoop(); });
  document.getElementById('expSkipBack').addEventListener('click', () => { haptic(); if (dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 15); });
  document.getElementById('expSkipFwd').addEventListener('click', () => { haptic(); if (dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 15); });
  document.getElementById('expShare').addEventListener('click', () => {
    haptic();
    const tr = getCurrentTrack();
    if (tr) {
      shareTrack(tr, { title: tr.seriesTitle, id: tr.seriesId });
    }
  });

  // Progress seek - expanded player (smooth drag: UI-only during drag, commit on release)
  let dragging = false;
  let dragPct = 0;
  function startDrag(e) {
    dragging = true;
    setDragging(true);
    dom.expProgressFill.style.transition = 'none';
    dom.expProgressThumb.style.transition = 'none';
    dragPct = seekCalc(e, dom.expProgressBar);
    seekUI(dragPct, dom);
  }
  function moveDrag(e) {
    if (!dragging) return;
    dragPct = seekCalc(e, dom.expProgressBar);
    seekUI(dragPct, dom);
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    dom.expProgressFill.style.transition = '';
    dom.expProgressThumb.style.transition = '';
    seekCommit(dragPct, dom.audio);
    // ✅ 修复iOS：延迟清除拖拽标记，等待seek完成后再恢复timeupdate进度更新
    // 避免iOS上seek期间currentTime短暂回弹导致进度条闪跳
    const seekTimer = setTimeout(() => setDragging(false), 300);
    dom.audio.addEventListener('seeked', () => {
      clearTimeout(seekTimer);
      setDragging(false);
    }, { once: true });
  }
  dom.expProgressBar.addEventListener('mousedown', e => startDrag(e));
  dom.expProgressBar.addEventListener('touchstart', e => startDrag(e.touches[0]), { passive: true });
  document.addEventListener('mousemove', e => moveDrag(e));
  document.addEventListener('touchmove', e => moveDrag(e.touches[0]), { passive: true });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);

  // Expanded toggle
  dom.expCollapse.addEventListener('click', () => { haptic(); closeFullScreen(); });

  // Queue / playlist toggle
  dom.expQueue.addEventListener('click', () => { haptic(); togglePlaylist(); });
  initPlaylistTabs();

  // Appreciate button — 系列级随喜；episodeNum 仅作为后端上下文
  let _appreciating = false;
  let _lastAppreciateTime = 0;
  const APPRECIATE_COOLDOWN = 1000; // 1秒冷却时间

  const expAppreciateBtn = document.getElementById('expAppreciate');
  expAppreciateBtn.addEventListener('click', async () => {
    haptic();

    // 防抖：1秒内不允许重复点击
    const now = Date.now();
    if (now - _lastAppreciateTime < APPRECIATE_COOLDOWN) return;
    if (_appreciating) return;

    const tr = getCurrentTrack();
    if (!tr) return;
    const seriesId = tr.seriesId;
    if (!seriesId) return;
    const rawEpisodeNum = Number(tr.id);
    const episodeNum = Number.isInteger(rawEpisodeNum) && rawEpisodeNum > 0 ? rawEpisodeNum : state.epIdx + 1;
    let shouldRefreshCurrentButton = false;

    _appreciating = true;
    _lastAppreciateTime = now;
    expAppreciateBtn.classList.add('loading');
    expAppreciateBtn.setAttribute('aria-busy', 'true');

    try {
      const result = await appreciate(seriesId, episodeNum);
      if (!result) {
        shouldRefreshCurrentButton = true;
        showToast(t('appreciate_fail') || '网络异常，请稍后再试');
        return;
      }

      markAppreciated(seriesId);

      const appreciateDoneText = t('appreciate_done');
      const successText = result.duplicate
        ? (appreciateDoneText && appreciateDoneText !== 'appreciate_done' ? appreciateDoneText : '已随喜，功德已记')
        : (t('appreciate_thanks') || '随喜功德');

      if (getCurrentTrack()?.seriesId === seriesId) {
        appreciateSuccess(result.total);
        showFloatText(expAppreciateBtn, successText);
      } else {
        shouldRefreshCurrentButton = true;
        showToast(successText);
      }
    } catch (err) {
      shouldRefreshCurrentButton = true;
      if (import.meta.env.DEV) console.warn('[Appreciate] request failed', err);
      showToast(t('appreciate_fail') || '网络异常，请稍后再试');
    } finally {
      expAppreciateBtn.classList.remove('loading');
      expAppreciateBtn.removeAttribute('aria-busy');
      if (shouldRefreshCurrentButton) {
        const currentTrack = getCurrentTrack();
        if (currentTrack?.seriesId) {
          updateAppreciateBtn(currentTrack.seriesId);
        }
      }
      _appreciating = false;
    }
  });

  // Download button
  {
    let _dlBusy = false;
    const dlBtn = dom.expDownload;
    if (dlBtn) {
      dlBtn.addEventListener('click', () => {
        haptic();
        if (_dlBusy) return;
        const tr = getCurrentTrack();
        if (!tr?.url) return;
        _dlBusy = true;
        downloadAudio(tr, (dlState) => {
          dlBtn.classList.remove('dl-downloading', 'dl-done', 'dl-error');
          if (dlState === DL_STATE.DOWNLOADING) {
            dlBtn.classList.add('dl-downloading');
          } else if (dlState === DL_STATE.DONE) {
            dlBtn.classList.add('dl-done');
            // 显示对勾图标
            const arrowIcon = dlBtn.querySelector('.dl-icon-arrow');
            const checkIcon = dlBtn.querySelector('.dl-icon-check');
            if (arrowIcon) arrowIcon.style.display = 'none';
            if (checkIcon) checkIcon.style.display = '';
            setTimeout(() => {
              dlBtn.classList.remove('dl-done');
              if (arrowIcon) arrowIcon.style.display = '';
              if (checkIcon) checkIcon.style.display = 'none';
              _dlBusy = false;
            }, 2000);
          } else {
            _dlBusy = false;
          }
        }).catch(() => { _dlBusy = false; });
      });
    }
  }

  // Swipe-down gesture to close expanded player (with visual follow-along)
  // #2 & #3: Use a single swipeTimer to prevent rapid-touch race conditions
  {
    let startY = 0, startX = 0, startTime = 0, swiping = false;
    let swipeTimer = null;
    const threshold = 80;
    const ANIM_MS = 340;
    const exp = dom.expPlayer;

    function clearSwipeTimer() {
      if (swipeTimer) { clearTimeout(swipeTimer); swipeTimer = null; }
    }

    exp.addEventListener('touchstart', (e) => {
      const t = e.target;
      if (t.closest('.exp-progress-bar') || t.closest('.playlist-items') || t.closest('input') || t.closest('button')) return;
      // If playlist visible, only allow swipe from the top bar area
      if (getPlaylistVisible()) {
        if (!t.closest('.exp-top')) return;
      }
      const content = dom.expPlayerContent;
      if (!getPlaylistVisible() && content && content.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startTime = Date.now();
      swiping = false;
      // #2: Cancel any pending animation-end cleanup from previous swipe
      clearSwipeTimer();
      // Disable CSS transition for real-time follow
      exp.style.transition = 'none';
    }, { passive: true });

    exp.addEventListener('touchmove', (e) => {
      if (!startY) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy > 10 && dy > dx) swiping = true;
      // Visual follow-along: translate the player down as user drags
      if (swiping && dy > 0) {
        e.preventDefault();
        exp.style.transform = `translate3d(0, ${dy}px, 0)`;
      }
    }, { passive: false });

    function resetSwipe() {
      clearSwipeTimer();
      // Restore CSS transition with unified easing and snap back
      exp.style.transition = `transform ${ANIM_MS}ms cubic-bezier(.22,1,.36,1)`;
      exp.style.transform = '';
      // Clear inline styles after animation completes
      swipeTimer = setTimeout(() => { exp.style.transition = ''; exp.style.transform = ''; swipeTimer = null; }, ANIM_MS);
      startY = 0;
      swiping = false;
    }

    exp.addEventListener('touchend', (e) => {
      if (!startY || !swiping) { resetSwipe(); return; }
      const dy = e.changedTouches[0].clientY - startY;
      const elapsed = Date.now() - startTime;
      const velocity = dy / elapsed;
      if (dy > threshold || velocity > 0.5) {
        clearSwipeTimer();
        // #3: Clear inline transform/transition FIRST, then let closeFullScreen
        // remove .show class so CSS drives the close animation without conflict
        exp.style.transition = '';
        exp.style.transform = '';
        if (getPlaylistVisible()) {
          togglePlaylist();
        } else {
          closeFullScreen();
        }
      } else {
        // Snap back to open position
        resetSwipe();
      }
      startY = 0;
      swiping = false;
    }, { passive: true });

    exp.addEventListener('touchcancel', resetSwipe, { passive: true });
  }

  // Audio events
  dom.audio.addEventListener('timeupdate', onTimeUpdate);
  dom.audio.addEventListener('ended', onEnded);
  dom.audio.addEventListener('error', onAudioError);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft' && dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 10);
    if (e.code === 'ArrowRight' && dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 10);
  });

  // Speed control
  document.getElementById('expSpeed').addEventListener('click', () => { haptic(); cycleSpeed(); });

  // Sleep timer
  document.getElementById('expTimer').addEventListener('click', () => { haptic(); cycleSleepTimer(); });

  // PWA install
  initInstallPrompt();
  initRefreshPrompt();

  // Back navigation guard
  initBackGuard(renderCategory, state, { closeFullScreen, getPlaylistVisible, closePlaylist, renderHomePage });

  // Handle browser back button for search overlay
  window.addEventListener('popstate', () => {
    if (isSearchOverlayOpen()) {
      closeSearchOverlay();
      return;
    }
  });

  // Check for ?tab=ai deep link after data loads
  // (handled in loadData to ensure it runs after render)

  // #4: Unified buffering indicator — 'waiting' shows, 'playing' clears
  // playCurrent() handles initial buffering via setBuffering(); these handle mid-playback buffer stalls
  function showBufferingUI() {
    if (!dom.audio.src || dom.audio.paused || dom.audio.ended || getIsSwitching()) return;
    setBuffering(true);
  }
  function hideBufferingUI() { setBuffering(false); }
  function settlePlaybackUI() { reconcilePlaybackUiAfterForeground(); }

  dom.audio.addEventListener('waiting', showBufferingUI);
  dom.audio.addEventListener('playing', () => {
    hideBufferingUI();
    setPlayState(true); // ✅ 确保playing事件始终同步播放状态
    startStallWatch();
    // 更新 AI 聊天上下文
    const tr = getCurrentTrack();
    if (tr) updateAiContext(tr.seriesId, tr.id || state.epIdx + 1);
  });
  dom.audio.addEventListener('pause', () => {
    clearStallWatch();
    if (!getIsSwitching()) hideBufferingUI();
    // ✅ 修复iOS：恢复期间不改变播放状态，避免UI闪烁
    if (!getIsSwitching() && !getIsRecovering()) { setPlayState(false); saveState(); }
  });
  dom.audio.addEventListener('loadeddata', settlePlaybackUI);
  dom.audio.addEventListener('canplay', settlePlaybackUI);
  dom.audio.addEventListener('canplaythrough', settlePlaybackUI);
  dom.audio.addEventListener('seeked', settlePlaybackUI);
  dom.audio.addEventListener('suspend', settlePlaybackUI);
  // 'stalled' event: browser stopped receiving data mid-download (common with large R2 files)
  dom.audio.addEventListener('stalled', () => {
    if (!getIsSwitching() && !dom.audio.paused && !dom.audio.ended && dom.audio.src) {
      console.log('[Audio] Stalled event — browser stopped receiving data');
      showBufferingUI();
    }
  });
  // canplay: preload mechanism removed — short audio uses background full-load instead.
  // dom.audio.addEventListener('canplay', () => { });

  // Tap-to-retry on player track (when in error state)
  dom.playerTrack.addEventListener('click', () => {
    if (dom.playerTrack.classList.contains('error')) {
      retryPlayback();
    }
  });

  // Network-aware preload control + recovery on connection change
  function tryNetworkRecovery() {
    if (!dom.audio.src) return;
    const shouldBePlayingButStopped = dom.audio.paused && !dom.audio.ended;
    const hasError = !!dom.audio.error;
    if (shouldBePlayingButStopped || hasError) {
      showBufferingUI();
      const pos = dom.audio.currentTime;
      dom.audio.load();
      dom.audio.currentTime = pos;
      dom.audio.play().catch(() => { hideBufferingUI(); });
    }
  }
  if (navigator.connection) {
    navigator.connection.addEventListener('change', () => {
      tryNetworkRecovery();
    });
  }
  // #23: Also retry on online event (works on all browsers)
  window.addEventListener('online', tryNetworkRecovery);

  window.addEventListener('appreciate:updated', (e) => {
    const seriesId = e.detail?.seriesId;
    if (!seriesId) return;

    markAppreciated(seriesId);

    const currentTrack = getCurrentTrack();
    if (currentTrack?.seriesId === seriesId) {
      updateAppreciateBtn(seriesId, e.detail?.total);
    }
  });

  applyI18n();
  loadData();

  // Initialise the store's cached-URL set from the real Cache API (background, non-blocking)
  initCachedUrls().catch(() => { });

  setInterval(saveState, 15000);

  // #22: Comprehensive state saving for background resume (Item 3)
  const handleSave = () => {
    saveState();
    storeSaveNow(); // flush store to localStorage immediately
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleSave();
      clearStallWatch();
      return;
    }
    onVisibilityResume();
    if (dom.audio.src && !dom.audio.paused && !dom.audio.ended) {
      startStallWatch();
    }
  });
  window.addEventListener('pagehide', handleSave);
  window.addEventListener('beforeunload', handleSave);

  // Register Service Worker for offline caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      observeRefreshRegistration(registration);
    }).catch(() => { });
  }

  // ✅ 监控：定期保存监控摘要到统一 store（5分钟一次，减少 localStorage 写入开销）
  setInterval(() => {
    try {
      const summary = monitor.getSummary();
      storePatch('monitor', { summary });
    } catch (e) { /* ignore */ }
  }, 300000); // 5分钟保存一次
})();

/* ===== DATA LOADING with cache + retry ===== */
let loadAttempts = 0;
const DATA_CACHE_VERSION = 6; // v6: invalidate stale category caches after catalog changes
const DATA_CACHE_KEY = 'pl-data-cache-v' + DATA_CACHE_VERSION;
const DATA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const HOME_CACHE_VERSION = 3;
const HOME_CACHE_KEY = 'pl-home-cache-v' + HOME_CACHE_VERSION;
const HOME_CACHE_TTL = 10 * 60 * 1000;

/** djb2-style hash for quick equality checks of serialised data. */
function simpleHash(str) {
  return Array.from(str).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
}

/** Read the stored data hash from localStorage without throwing. */
function getCachedHash() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    return raw ? JSON.parse(raw)._hash : null;
  } catch (e) { return null; }
}

function loadCachedHomeData() {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const { data, ts, version } = JSON.parse(raw);
    if (version !== HOME_CACHE_VERSION) {
      localStorage.removeItem(HOME_CACHE_KEY);
      return null;
    }
    if (Date.now() - ts > HOME_CACHE_TTL) return null;
    return data;
  } catch (e) { return null; }
}

function saveCachedHomeData(data) {
  try {
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      data,
      ts: Date.now(),
      version: HOME_CACHE_VERSION,
    }));
  } catch (e) { /* ignore */ }
}

function needsImmediateFullData() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return Boolean(
    location.hash ||
    params.get('series') ||
    params.get('doc') ||
    params.get('doc') ||
    (tab && !['home', 'ai', 'mypage'].includes(tab))
  );
}

function canRestoreFromCurrentData() {
  const playerState = storeGet('player');
  if (!playerState?.seriesId) return true;
  return !!findSeriesInData(playerState.seriesId);
}

async function ensureFullData(options = {}) {
  const { rerenderHome = true, restorePlayback = false } = options;
  if (state.isDataFull) return state.data;
  if (state.fullDataPromise) return state.fullDataPromise;

  const promise = (async () => {
    const fresh = await fetchCategoriesData();
    applyLoadedData(fresh);
    const freshHash = simpleHash(JSON.stringify(fresh));
    saveCachedData(fresh, freshHash);
    invalidateHomePage();
    if (restorePlayback && state.epIdx < 0) {
      restoreState();
    }
    if (rerenderHome && state.tab === 'home') {
      renderHomePage();
    }
    return fresh;
  })();

  state.fullDataPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.fullDataPromise === promise) state.fullDataPromise = null;
  }
}

state.ensureFullData = ensureFullData;
state.ensureCategoryData = ensureCategoryData;
state.ensureSeriesDetail = ensureSeriesDetail;

async function loadData() {
  const dom = getDOM();
  try {
    // Try localStorage cache first for instant render
    const cached = loadCachedData();
    if (cached) {
      applyLoadedData(cached);
      if (state.tab === 'home') renderHomePage();
      else if (state.tab === 'mypage') renderMyPage();
      else renderCategory(state.tab);
      if (!handleShareHash()) {
        restoreState();
        if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
      }
      // ✅ 修复：缓存模式下也处理深链接
      handleSeriesDeepLink();
      handleTabDeepLink();
      // Refresh in background (non-blocking)
      fetchFreshData();
      // Handle ?tab=ai deep link
      checkAiDeepLink();
      await hideBootLoader(dom);
      return;
    }

    const shouldBootstrapHome = !needsImmediateFullData();
    const cachedHome = shouldBootstrapHome ? loadCachedHomeData() : null;
    if (cachedHome) {
      applyLoadedData(cachedHome);
      if (state.tab === 'mypage') renderMyPage();
      else renderHomePage();
      if (canRestoreFromCurrentData()) {
        restoreState();
        if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
      }
      handleTabDeepLink();
      checkAiDeepLink();
      await hideBootLoader(dom);
      // 首页轻量启动后再延后补全完整数据，避免首屏后立刻并发多波请求
      scheduleBackgroundFullDataRestore();
      return;
    }

    if (shouldBootstrapHome) {
      const homeData = await consumeHomeBootstrapData();
      applyLoadedData(homeData);
      saveCachedHomeData(homeData);
      renderHomePage();
      if (canRestoreFromCurrentData()) {
        restoreState();
        if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
      } else if (state.isFirstVisit && state.epIdx < 0) {
        playDefaultTrack();
      }
      handleTabDeepLink();
      checkAiDeepLink();
      await hideBootLoader(dom);
      // 首页轻量启动后再延后补全完整数据，避免首屏后立刻并发多波请求
      scheduleBackgroundFullDataRestore();
      return;
    }

    // No cache: fetch full data directly
    const freshData = await fetchCategoriesData();
    applyLoadedData(freshData);
    const initStr = JSON.stringify(state.data);
    const initHash = Array.from(initStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    saveCachedData(state.data, initHash);
    if (state.tab === 'home') renderHomePage();
    else if (state.tab === 'mypage') renderMyPage();
    else renderCategory(state.tab);
    if (!handleShareHash()) {
      restoreState();
      // Default play on first visit
      if (state.isFirstVisit && state.epIdx < 0) playDefaultTrack();
    }
    // Handle ?series= deep link
    handleSeriesDeepLink();
    // Handle ?tab= deep links (including PWA shortcuts)
    handleTabDeepLink();
    // Handle ?tab=ai deep link
    checkAiDeepLink();
    await hideBootLoader(dom);
  } catch (e) {
    loadAttempts++;
    if (loadAttempts < 3) {
      const loaderText = dom.loader.querySelector('.loader-text');
      if (loaderText && (!IN_APP_BROWSER || loadAttempts > 1)) {
        loaderText.textContent = getTextOrFallback('loading_retry', '\u8FDE\u63A5\u4E2D\uFF0C\u8BF7\u7A0D\u5019...');
      }
      setTimeout(loadData, (IN_APP_BROWSER ? 900 : 1500) * loadAttempts);
      return;
    }
    // #20: Retry button calls loadData() instead of location.reload() to preserve state
    dom.loader.innerHTML = `<div class="error-msg">${t('loading_fail')}<br><button id="retryLoadBtn">${t('retry')}</button></div>`;
    document.getElementById('retryLoadBtn').addEventListener('click', () => {
      loadAttempts = 0;
      dom.loader.className = 'loader loader-home';
      dom.loader.innerHTML = getBootLoaderMarkup();
      if (!needsImmediateFullData()) warmHomeBootstrapData();
      loadData();
    });
  }
}

function loadCachedData() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) {
      // ✅ 优化：清理旧版本缓存
      cleanupOldCacheVersions();
      return null;
    }
    const { data, ts, version } = JSON.parse(raw);
    // ✅ 优化：版本不匹配，清理缓存
    if (version !== DATA_CACHE_VERSION) {
      localStorage.removeItem(DATA_CACHE_KEY);
      return null;
    }
    if (Date.now() - ts > DATA_CACHE_TTL) return null;
    return data;
  } catch (e) { return null; }
}

// ✅ 优化：清理所有旧版本缓存
function cleanupOldCacheVersions() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('pl-data-cache-') && key !== DATA_CACHE_KEY) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) { /* ignore */ }
}

function saveCachedData(data, hash) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      data,
      ts: Date.now(),
      _hash: hash,
      version: DATA_CACHE_VERSION // ✅ 优化：添加版本号
    }));
  } catch (e) { /* storage full or unavailable */ }
}

async function fetchFreshData() {
  try {
    const fresh = await fetchCategoriesData();
    // #16: Compare BEFORE saving — read cached hash first, then decide
    const freshHash = simpleHash(JSON.stringify(fresh));
    const cachedHash = getCachedHash();
    if (freshHash !== cachedHash || cachedHash === null) {
      applyLoadedData(fresh);
      saveCachedData(fresh, freshHash);
      // Invalidate cached home page so it rebuilds with updated data
      invalidateHomePage();
      if (state.tab === 'home') renderHomePage();
    } else {
      // Data unchanged — just refresh the timestamp so TTL doesn't expire
      saveCachedData(fresh, freshHash);
    }
  } catch (e) { /* silent */ }
}

/* ===== SERVICE WORKER MESSAGE HANDLER ===== */
// When the SW's stale-while-revalidate detects that /api/categories changed on the server,
// it broadcasts a 'data-updated' message so the page can refresh without a reload.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'data-updated' && event.data.data) {
      const fresh = event.data.data;
      const freshHash = simpleHash(JSON.stringify(fresh));
      const cachedHash = getCachedHash();
      if (freshHash !== cachedHash) {
        applyLoadedData(fresh);
        saveCachedData(fresh, freshHash);
        invalidateHomePage();
        if (state.tab === 'home') renderHomePage();
      }
    }
  });
}

/* ===== SHARE LINK HANDLING ===== */
// Parse URL hash: #seriesId/epId → play that episode, #seriesId → show series
function handleShareHash() {
  if (!state.data || !location.hash) return false;
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return false;
  const parts = raw.split('/');
  const seriesId = parts[0];
  const epId = parts[1] != null ? parseInt(parts[1], 10) : null;
  // Find series across all categories
  let foundSeries = null, foundCatId = null;
  for (const cat of state.data.categories) {
    const sr = cat.series.find(s => s.id === seriesId);
    if (sr) { foundSeries = sr; foundCatId = cat.id; break; }
  }
  if (!foundSeries) return false;
  // Clear hash so it doesn't re-trigger on refresh
  history.replaceState(null, '', location.pathname + location.search);
  // Switch to the correct tab
  const tabId = foundCatId === 'fohao' ? 'home' : foundCatId;
  activateRootTab(tabId);
  if (epId != null && !isNaN(epId)) {
    // Find episode index by id
    const epIdx = foundSeries.episodes.findIndex(ep => ep.id === epId);
    const idx = epIdx >= 0 ? epIdx : 0;
    showEpisodes(foundSeries, foundCatId);
    // 分享链接跳转无用户手势上下文，iOS 会拒绝自动播放
    // 使用 prepareList 准备播放器 UI，让用户手动点击播放
    prepareList(foundSeries.episodes, idx, foundSeries);
  } else {
    // Just show the series episode list
    showEpisodes(foundSeries, foundCatId);
  }
  return true;
}

function playDefaultTrack() {
  if (!state.data) return;
  const cat = state.data.categories.find(c => c.id === 'fohao');
  if (!cat) return;
  const sr = cat.series.find(s => s.id === 'donglin-fohao');
  if (!sr || !sr.episodes || sr.episodes.length < 4) return;
  // Use prepareList (not playList) — no user gesture context here,
  // so play() would be rejected by mobile autoplay policies.
  // The player UI will be ready; user taps play to start.
  prepareList(sr.episodes, 3, sr);
}

function handleSeriesDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const seriesId = params.get('series');
  if (!seriesId || !state.data) return;
  // Find the series across all categories
  for (const cat of state.data.categories) {
    const series = cat.series.find(s => s.id === seriesId);
    if (series) {
      // Switch to the correct tab
      activateRootTab(cat.id);
      showEpisodes(series, cat.id);
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
  }
}

/* ===== TAB DEEP LINK — from PWA shortcuts or external links ===== */
// Handles ?tab=home, ?tab=tingjingtai, ?tab=youshengshu, ?tab=mypage
// ?tab=ai 重定向到独立页处理
function handleTabDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (!tab) return;
  const validTabs = ['home', 'tingjingtai', 'youshengshu', 'mypage'];
  if (!validTabs.includes(tab)) return;
  activateRootTab(tab);
  window.history.replaceState({}, '', window.location.pathname);
  if (tab === 'home') renderHomePage();
  else if (tab === 'mypage') renderMyPage();
  else {
    const renderTab = () => renderCategory(tab);
    if (!state.isDataFull && state.ensureCategoryData) {
      state.ensureCategoryData(tab).then(renderTab).catch(renderTab);
    } else {
      renderTab();
    }
  }
}
