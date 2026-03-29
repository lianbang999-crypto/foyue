/* ===== Category & Episode Views ===== */
import { state, beginContentRequest, isContentRequestCurrent, getCurrentTrack } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { CATEGORY_ICONS, ICON_PLAY_FILLED, ICON_PAUSE_FILLED } from './icons.js';
import { playList, togglePlay, isCurrentTrack, getIsSwitching, markAppreciated, isAppreciated, shareSeries } from './player.js';
import { renderHomePage } from './pages-home.js';
import { getHistory } from './history.js';
import { getPlayCount, appreciate } from './api.js';
import { showToast, escapeHtml, showFloatText, fmtCount, fmtDuration, isAppleMobile } from './utils.js';
import { getBatchCachedStatus } from './audio-cache.js';
import { getTrackWithCachedAudioMeta, primeAudioMetadata } from './audio-meta-cache.js';
import { mountSummary } from './ai-summary.js';
import { probeDurations, getCachedDuration } from './duration-cache.js';
import { warmAudioUrl } from './audio-url.js';
import { isInAppBrowser } from './pwa.js';
import { getPlaybackPolicy } from './playback-policy.js';
// import { mountTranscript } from './transcript.js';
// import { getTranscriptAvailability } from './ai-client.js';

const _isInApp = isInAppBrowser();
const CATEGORY_PREVIEW_COUNT = _isInApp ? 8 : 10;
const categoryExpansionState = new Map();

function getConnTypeForWarmup() {
  const conn = navigator.connection || navigator.mozConnection;
  if (!conn) return 'unknown';
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'wifi';
  if (conn.type === 'cellular') return 'cellular';
  return 'unknown';
}

function getTextOrFallback(key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

function deferNonCriticalWork(callback) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => callback(), { timeout: 1200 });
    return;
  }
  setTimeout(() => callback(), 80);
}

function getEpisodeItem(ul, idx) {
  return ul.querySelector(`.ep-item[data-idx="${idx}"]`);
}

function applyCachedStateToItem(li, tooltip) {
  if (!li) return;
  li.classList.add('ep-cached');
  const durEl = li.querySelector('.ep-duration');
  if (durEl) durEl.title = tooltip;
}

function buildEpisodeItem(series, ep, idx, histMap) {
  const li = document.createElement('li');
  li.className = 'ep-item' + (isCurrentTrack(series.id, idx) ? ' playing' : '');
  li.dataset.idx = idx;
  const introHtml = ep.intro ? `<span class="ep-intro">${escapeHtml(ep.intro)}</span>` : '';
  const hEntry = histMap.get(idx);
  let progressHtml = '';
  if (hEntry && hEntry.duration > 0) {
    const pct = Math.min(100, Math.round(hEntry.time / hEntry.duration * 100));
    progressHtml = `<div class="ep-progress"><div class="ep-progress-fill" style="width:${pct}%"></div></div>`;
  }
  const dur = ep.duration || getCachedDuration(ep.url);
  const durText = dur ? fmtDuration(dur) : '';
  li.innerHTML = `<span class="ep-num">${ep.id || idx + 1}</span>
      <div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>
      <div class="ep-text"><span class="ep-title">${escapeHtml(ep.title || ep.fileName)}</span>${introHtml}${progressHtml}</div>
      <span class="ep-duration" data-idx="${idx}">${durText}</span>`;
  // 不再给每个 li 单独绑定 click，使用 ul 上的事件委托
  return li;
}

// 懒加载：首批渲染 LAZY_BATCH 项，滚动到哨兵时加载下一批
const LAZY_BATCH = _isInApp ? 24 : 40;

function renderEpisodeItems(ul, series, histMap, requestId) {
  const total = series.episodes.length;
  let rendered = 0;

  // 如果当前正在播放本系列的某个较后的集数，确保首批渲染覆盖到它
  let initialEnd = LAZY_BATCH;
  const curTrack = getCurrentTrack();
  if (curTrack) {
    if (curTrack.seriesId === series.id && state.epIdx >= initialEnd) {
      initialEnd = state.epIdx + 5; // 正在播放的集 + 几个缓冲
    }
  }
  initialEnd = Math.min(initialEnd, total);

  function renderBatch(count) {
    if (!ul.isConnected || !isContentRequestCurrent(requestId)) return;
    const end = Math.min(rendered + count, total);
    const frag = document.createDocumentFragment();
    for (let idx = rendered; idx < end; idx++) {
      const li = buildEpisodeItem(series, series.episodes[idx], idx, histMap);
      if (ul._cachedEpisodeIdxs && ul._cachedEpisodeIdxs.has(idx)) {
        applyCachedStateToItem(li, ul._cachedEpisodeTooltip || '');
      }
      frag.appendChild(li);
    }
    ul.appendChild(frag);
    rendered = end;
  }

  // 首批渲染（覆盖当前正在播放的集数）
  renderBatch(initialEnd);

  // 全部已渲染则无需 Observer
  if (rendered >= total) return true;

  // 哨兵元素 + IntersectionObserver 实现滚到底部自动加载
  const sentinel = document.createElement('li');
  sentinel.className = 'ep-sentinel';
  sentinel.style.height = '1px';
  ul.appendChild(sentinel);

  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    if (!ul.isConnected || !isContentRequestCurrent(requestId)) {
      io.disconnect();
      return;
    }
    // 移除旧哨兵
    sentinel.remove();
    // 渲染下一批
    renderBatch(LAZY_BATCH);
    // 如果还有更多，重新插入哨兵
    if (rendered < total) {
      ul.appendChild(sentinel);
    } else {
      io.disconnect();
    }
  }, { root: null, rootMargin: '200px' });
  io.observe(sentinel);

  // 存储清理引用供 MutationObserver 断开时调用
  ul._lazyIo = io;
  return true;
}

function warmLikelyEpisodeAudio(series) {
  if (!series?.episodes?.length || getIsSwitching()) return;

  let targetIdx = 0;
  if (state.playlist.length && state.epIdx >= 0) {
    const current = state.playlist[state.epIdx];
    if (current?.seriesId === series.id) targetIdx = state.epIdx;
  }

  const currentTrack = getCurrentTrack();
  if (currentTrack?.seriesId === series.id && state.epIdx === targetIdx) return;

  const targetEpisode = series.episodes[targetIdx] || series.episodes[0];
  if (!targetEpisode?.url) return;
  const episodeForPolicy = getTrackWithCachedAudioMeta(targetEpisode);
  const conn = navigator.connection || navigator.mozConnection;
  const policy = getPlaybackPolicy({
    track: episodeForPolicy,
    isApple: isAppleMobile(),
    isInApp: _isInApp,
    online: navigator.onLine,
    connectionType: getConnTypeForWarmup(),
    effectiveType: conn?.effectiveType,
    saveData: !!conn?.saveData,
    networkWeak: !!state.networkWeak,
  });
  if (!policy.allowNextTrackWarmup || policy.profile.mediaClass === 'large') return;
  if (policy.profile.mediaClass === 'unknown') {
    primeAudioMetadata(targetEpisode).catch(() => { });
    return;
  }
  warmAudioUrl(targetEpisode.url);
}

function getCollapsedSeriesCount(seriesList, currentSeriesId) {
  const total = seriesList.length;
  if (total <= CATEGORY_PREVIEW_COUNT) return total;
  const currentIdx = currentSeriesId ? seriesList.findIndex(series => series.id === currentSeriesId) : -1;
  if (currentIdx >= CATEGORY_PREVIEW_COUNT) return currentIdx + 1;
  return CATEGORY_PREVIEW_COUNT;
}

function buildSeriesToggleLabel(visibleCount, totalCount, expanded) {
  if (expanded) return '收起专辑';
  const remaining = Math.max(0, totalCount - visibleCount);
  if (remaining <= 0) return '收起专辑';
  return `展开更多专辑（还有 ${remaining} 部）`;
}

function buildSeriesToggleMeta(visibleCount, totalCount, expanded) {
  if (totalCount <= CATEGORY_PREVIEW_COUNT) return '';
  if (expanded) return `已展开全部 ${totalCount} 部专辑`;
  return `当前先显示 ${visibleCount} / ${totalCount} 部专辑`;
}

export function renderCategory(tabId) {
  beginContentRequest();
  const dom = getDOM();
  if (!state.data) return;
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());
  const cat = state.data.categories.find(c => c.id === tabId);
  if (!cat) { dom.contentArea.innerHTML = `<div class="loader-text">${t('no_content')}</div>`; return; }
  const wrap = document.createElement('div');
  wrap.className = 'view active';
  const list = document.createElement('div');
  list.className = 'series-list';
  const unit = tabId === 'fohao' ? t('tracks') : t('episodes');
  const nowTrack = getCurrentTrack();
  const nowSid = nowTrack ? nowTrack.seriesId : null;
  const expanded = categoryExpansionState.get(tabId) === true;
  const visibleCount = expanded
    ? cat.series.length
    : getCollapsedSeriesCount(cat.series, nowSid);
  const visibleSeries = cat.series.slice(0, visibleCount);
  list.classList.toggle('is-collapsed', !expanded && cat.series.length > visibleCount);

  visibleSeries.forEach((s, idx) => {
    const card = document.createElement('div');
    const isPlaying = s.id === nowSid;
    const staggerCls = idx < 6 ? ` stagger-${Math.min(idx + 1, 4)}` : '';
    card.className = 'card' + (isPlaying ? ' now-playing' : '') + staggerCls;
    const introHtml = s.intro ? `<div class="card-intro">${escapeHtml(s.intro)}</div>` : '';
    const playTag = isPlaying ? `<span class="card-playing-tag">${t('now_playing')}</span>` : '';
    const playCountText = s.playCount ? ` \u00B7 ${fmtCount(s.playCount)}${t('play_count_unit') || '\u6B21'}` : '';
    card.innerHTML = `<div class="card-icon">${CATEGORY_ICONS[tabId] || CATEGORY_ICONS.tingjingtai}</div>
      <div class="card-body"><div class="card-title">${escapeHtml(s.title)}${playTag}</div>${introHtml}<div class="card-meta">${escapeHtml(s.speaker || '')} \u00B7 ${s.totalEpisodes} ${unit}${playCountText}</div></div>
      <span class="card-arrow"><svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg></span>`;
    card.addEventListener('click', () => showEpisodes(s, tabId));
    list.appendChild(card);
  });
  wrap.appendChild(list);

  if (cat.series.length > CATEGORY_PREVIEW_COUNT) {
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'series-list-toggle-wrap';
    const toggleMeta = document.createElement('div');
    toggleMeta.className = 'series-list-toggle-meta';
    toggleMeta.textContent = buildSeriesToggleMeta(visibleCount, cat.series.length, expanded);
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'series-list-toggle';
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.textContent = buildSeriesToggleLabel(visibleCount, cat.series.length, expanded);
    toggleBtn.addEventListener('click', () => {
      categoryExpansionState.set(tabId, !expanded);
      renderCategory(tabId);
    });
    toggleWrap.appendChild(toggleMeta);
    toggleWrap.appendChild(toggleBtn);
    wrap.appendChild(toggleWrap);
  }

  dom.contentArea.appendChild(wrap);
}

export async function showEpisodes(series, tabId) {
  const requestId = beginContentRequest();
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());
  state.seriesId = series.id;
  let fullSeries = series;

  if ((!series.episodes || !series.episodes.length) && state.ensureSeriesDetail) {
    const loading = document.createElement('div');
    loading.className = 'view active ep-view';
    loading.innerHTML = `<div class="loader-text">${getTextOrFallback('loading_retry', '连接中，请稍候...')}</div>`;
    dom.contentArea.appendChild(loading);
    try {
      fullSeries = await state.ensureSeriesDetail(series.id, tabId) || series;
      if (!isContentRequestCurrent(requestId)) {
        loading.remove();
        return;
      }
    } catch {
      if (!isContentRequestCurrent(requestId)) {
        loading.remove();
        return;
      }
      loading.innerHTML = `<div class="loader-text">${t('loading_fail') || '加载失败'}</div>`;
      return;
    }
    loading.remove();
  }

  if (!isContentRequestCurrent(requestId)) return;

  series = fullSeries;
  const unit = tabId === 'fohao' ? t('tracks') : t('episodes');
  const introHdr = series.intro ? `<div class="ep-header-intro">${escapeHtml(series.intro)}</div>` : '';
  const view = document.createElement('div');
  view.className = 'view active ep-view';
  view.innerHTML = `<div class="ep-header">
    <button class="btn-back" id="backBtn"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
    <div class="ep-header-info"><div class="ep-header-title">${escapeHtml(series.title)}</div><div class="ep-header-sub">${escapeHtml(series.speaker || '')} \u00B7 ${series.totalEpisodes} ${unit}<span id="epPlayCount"></span></div>${introHdr}</div>
    <button class="btn-play-all" id="playAllBtn" aria-label="${t('play_all')}"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></button>
    <button class="btn-share-series" id="shareSeriesBtn" aria-label="Share"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
  </div><div class="ep-actions" id="epActions"></div><ul class="ep-list" id="epList"></ul>`;
  dom.contentArea.appendChild(view);

  view.querySelector('#backBtn').addEventListener('click', () => {
    state.seriesId = null;
    if (state.tab === 'home') renderHomePage();
    else renderCategory(state.tab);
  });
  view.querySelector('#shareSeriesBtn').addEventListener('click', () => shareSeries(series));

  const playAllBtn = view.querySelector('#playAllBtn');
  function updatePlayAllBtn() {
    if (getIsSwitching()) return;
    const ct = getCurrentTrack();
    const isThisSeries = ct && ct.seriesId === series.id;
    const playing = isThisSeries && !dom.audio.paused;
    playAllBtn.innerHTML = playing ? ICON_PAUSE_FILLED : ICON_PLAY_FILLED;
  }
  updatePlayAllBtn();
  dom.audio.addEventListener('play', updatePlayAllBtn);
  dom.audio.addEventListener('pause', updatePlayAllBtn);
  let cancelProbe = () => { };
  let onTimeUpdate = () => { };
  let skipDeferredMetrics = false;
  let cleanupViewResources = () => { };

  // Declared here so the MutationObserver cleanup closure can reference it; the real
  // implementation is assigned below once `ul` is available (it scopes queries to that element).
  let updateHighlight = () => { };

  const obs = new MutationObserver(() => {
    if (!view.parentNode) {
      dom.audio.removeEventListener('play', updatePlayAllBtn);
      dom.audio.removeEventListener('pause', updatePlayAllBtn);
      dom.audio.removeEventListener('timeupdate', onTimeUpdate);
      dom.audio.removeEventListener('playing', updateHighlight);
      dom.audio.removeEventListener('ended', updateHighlight);
      skipDeferredMetrics = true;
      cancelProbe();
      cleanupViewResources();
      // 清理懒加载 IntersectionObserver
      const epUl = view.querySelector('#epList');
      if (epUl && epUl._lazyIo) { epUl._lazyIo.disconnect(); epUl._lazyIo = null; }
      obs.disconnect();
    }
  });
  obs.observe(dom.contentArea, { childList: true });

  playAllBtn.addEventListener('click', () => {
    const ct = getCurrentTrack();
    if (ct && ct.seriesId === series.id) { togglePlay(); }
    else { playList(series.episodes, 0, series); }
  });

  const ul = view.querySelector('#epList');

  // 事件委托：单个 ul 监听器处理所有 ep-item 点击，替代 151+ 个独立监听器
  ul.addEventListener('click', (e) => {
    const li = e.target.closest('.ep-item');
    if (!li) return;
    const idx = parseInt(li.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (isCurrentTrack(series.id, idx)) { togglePlay(); return; }
    const hist = getHistory();
    const entry = hist.find(h => h.seriesId === series.id && h.epIdx === idx);
    const resumeTime = (entry && entry.time > 5 && (!entry.duration || entry.time < entry.duration - 5)) ? entry.time : 0;
    playList(series.episodes, idx, series, resumeTime);
  });

  // 优化：只切换前一个和当前正在播放的两个元素的 class，而非遍历 151 个 ep-item
  let _prevHighlightIdx = -1;
  updateHighlight = () => {
    // 清除旧高亮
    if (_prevHighlightIdx >= 0) {
      const oldEl = getEpisodeItem(ul, _prevHighlightIdx);
      if (oldEl) oldEl.classList.remove('playing');
    }
    // 设置新高亮（音频结束时不高亮任何项）
    let newIdx = -1;
    if (!dom.audio.ended) {
      const tr = getCurrentTrack();
      if (tr && tr.seriesId === series.id) newIdx = state.epIdx;
    }
    if (newIdx >= 0) {
      const newEl = getEpisodeItem(ul, newIdx);
      if (newEl) newEl.classList.add('playing');
    }
    _prevHighlightIdx = newIdx;
  };
  dom.audio.addEventListener('playing', updateHighlight);
  dom.audio.addEventListener('ended', updateHighlight);

  const hist = getHistory();
  // Build a history lookup map for O(1) access instead of O(n) .find() per episode
  const histMap = new Map();
  hist.forEach(h => { if (h.seriesId === series.id) histMap.set(h.epIdx, h); });
  // Use DocumentFragment for batch DOM insertion (avoids 196+ reflows)
  const renderCompleted = renderEpisodeItems(ul, series, histMap, requestId);
  if (!renderCompleted || !isContentRequestCurrent(requestId) || !view.isConnected) return;

  if (tabId === 'tingjingtai') {
    deferNonCriticalWork(() => {
      if (!view.isConnected || !isContentRequestCurrent(requestId) || getIsSwitching()) return;
      warmLikelyEpisodeAudio(series);
    });
  }

  // Real-time progress bar for the currently playing episode (~1 update/sec)
  let progressTick = 0;
  onTimeUpdate = function () {
    const now = performance.now();
    if (now - progressTick < 1000) return;
    progressTick = now;
    const ct = getCurrentTrack();
    if (!ct || ct.seriesId !== series.id) return;
    const dur = dom.audio.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    const pct = Math.min(100, Math.round(dom.audio.currentTime / dur * 100));
    const li = getEpisodeItem(ul, state.epIdx);
    if (!li) return;
    let fillEl = li.querySelector('.ep-progress-fill');
    if (!fillEl) {
      const progEl = document.createElement('div');
      progEl.className = 'ep-progress';
      progEl.innerHTML = '<div class="ep-progress-fill"></div>';
      const epText = li.querySelector('.ep-text');
      if (epText) epText.appendChild(progEl);
      fillEl = li.querySelector('.ep-progress-fill');
    }
    if (fillEl) fillEl.style.width = pct + '%';
  };
  dom.audio.addEventListener('timeupdate', onTimeUpdate);

  // Batch-check cache status for all episodes (single cache.open() call)
  // 低端设备（应用内浏览器）跳过缓存状态检查，减少 Cache API 压力
  deferNonCriticalWork(() => {
    if (skipDeferredMetrics || !view.isConnected) return;

    if (!_isInApp) {
      getBatchCachedStatus(series.episodes.map(ep => ep.url)).then(cachedArr => {
        const tooltip = getTextOrFallback('ep_cached_tooltip', '已下载，可离线收听');
        ul._cachedEpisodeIdxs = new Set();
        ul._cachedEpisodeTooltip = tooltip;
        cachedArr.forEach((cached, idx) => {
          if (!cached) return;
          ul._cachedEpisodeIdxs.add(idx);
          const li = getEpisodeItem(ul, idx);
          applyCachedStateToItem(li, tooltip);
        });
      });
    }

    cancelProbe = probeDurations(series.episodes, (idx, seconds) => {
      const el = ul.querySelector(`.ep-duration[data-idx="${idx}"]`);
      if (el) el.textContent = fmtDuration(seconds);
    });
  });

  // Add appreciation button
  const actionsDiv = view.querySelector('#epActions');
  const _alreadyAppreciated = isAppreciated(series.id);
  actionsDiv.innerHTML = `<button class="appreciate-btn${_alreadyAppreciated ? ' appreciated' : ''}" id="appreciateBtn">
    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" stroke="none"/></svg>
    <span id="appreciateLabel">${t('appreciate') || '\u968F\u559C'}</span><span id="appreciateCount"></span>
  </button>`;

  // 添加防抖和乐观更新
  let _lastAppreciateTime = 0;
  const APPRECIATE_COOLDOWN = 1000;

  view.querySelector('#appreciateBtn').addEventListener('click', async () => {
    // 防抖检查
    const now = Date.now();
    if (now - _lastAppreciateTime < APPRECIATE_COOLDOWN) return;
    _lastAppreciateTime = now;

    const btn = view.querySelector('#appreciateBtn');
    const countEl = view.querySelector('#appreciateCount');

    // ✅ 乐观UI更新 - 立即显示浮动文字动画
    btn.classList.add('appreciated');
    markAppreciated(series.id);
    showFloatText(btn, t('appreciate_thanks') || '\u968F\u559C\u529F\u5FB7');

    // 后台发送请求
    try {
      const result = await appreciate(series.id);
      if (result && result.total != null) {
        // 更新计数（带动画）
        if (countEl) {
          countEl.textContent = ' ' + fmtCount(result.total);
          countEl.classList.add('badge-bump');
          setTimeout(() => countEl.classList.remove('badge-bump'), 300);
        }
      }
    } catch (err) {
      // 静默失败
      console.log('Appreciate request failed:', err);
    }
  });

  // Track the highest play count we've seen to prevent a stale getPlayCount response
  // from overwriting a fresher value delivered by the playcount:updated event.
  // Race scenario: getPlayCount (GET) is initiated before a play is recorded; if
  // recordPlay (POST) resolves first and fires the event, the GET response may arrive
  // later with an old value and clobber the already-correct display.
  let _highWaterPlayCount = 0;

  // Fetch live play counts from API (non-blocking)
  getPlayCount(series.id).then(data => {
    if (!data || data.error) return;
    const countSpan = view.querySelector('#epPlayCount');
    if (countSpan && data.totalPlayCount > 0 && data.totalPlayCount > _highWaterPlayCount) {
      _highWaterPlayCount = data.totalPlayCount;
      countSpan.textContent = ` \u00B7 ${fmtCount(data.totalPlayCount)}${t('play_count_unit') || '\u6B21'}`;
    }
  });

  // Update play count display when a new play is recorded for this series
  const onPlayCountUpdated = (e) => {
    if (e.detail?.seriesId !== series.id || !e.detail?.playCount) return;
    if (e.detail.playCount > _highWaterPlayCount) {
      _highWaterPlayCount = e.detail.playCount;
      const countSpan = view.querySelector('#epPlayCount');
      if (countSpan) countSpan.textContent = ` \u00B7 ${fmtCount(e.detail.playCount)}${t('play_count_unit') || '\u6B21'}`;
    }
  };
  window.addEventListener('playcount:updated', onPlayCountUpdated);
  // Store cleanup so MutationObserver can remove listener when view is removed
  const prevCleanupViewResources = cleanupViewResources;
  cleanupViewResources = () => {
    prevCleanupViewResources();
    window.removeEventListener('playcount:updated', onPlayCountUpdated);
  };

  // 阅读讲义按钮（应用内导航到文库）
  if (series.wenkuSeries) {
    const wenkuBtn = document.createElement('button');
    wenkuBtn.className = 'wenku-link-btn';
    wenkuBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" fill="currentColor"/></svg>
    <span>${t('read_transcript')}</span>`;
    wenkuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `/wenku?series=${encodeURIComponent(series.wenkuSeries)}`;
    });
    actionsDiv.appendChild(wenkuBtn);
  }

  // mountSummary(actionsDiv, series.id); // 暂时隐藏

  // 讲义文稿功能 — 暂时隐藏
  // getTranscriptAvailability(series.id).then(data => {
  //   if (!data?.episodes?.length) return;
  //   const availSet = new Set(data.episodes);
  //   ul.querySelectorAll('.ep-item').forEach((li, idx) => {
  //     const epNum = series.episodes[idx]?.id || idx + 1;
  //     if (availSet.has(epNum)) {
  //       const epText = li.querySelector('.ep-text');
  //       if (epText) mountTranscript(epText, series.id, epNum);
  //     }
  //   });
  // }).catch(() => {});
}
