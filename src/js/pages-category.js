/* ===== Category & Episode Views ===== */
import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { CATEGORY_ICONS, ICON_PLAY_FILLED, ICON_PAUSE_FILLED } from './icons.js';
import { playList, togglePlay, isCurrentTrack, getIsSwitching, markAppreciated, isAppreciated, shareSeries } from './player.js';
import { renderHomePage } from './pages-home.js';
import { getHistory } from './history.js';
import { getPlayCount, appreciate } from './api.js';
import { showToast, escapeHtml, showFloatText, fmtCount, fmtDuration } from './utils.js';
import { getBatchCachedStatus } from './audio-cache.js';
import { mountSummary } from './ai-summary.js';
import { probeDurations, getCachedDuration } from './duration-cache.js';
// import { mountTranscript } from './transcript.js';
// import { getTranscriptAvailability } from './ai-client.js';

export function renderCategory(tabId) {
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
  const nowSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;

  cat.series.forEach(s => {
    const card = document.createElement('div');
    const isPlaying = s.id === nowSid;
    card.className = 'card' + (isPlaying ? ' now-playing' : '');
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
  dom.contentArea.appendChild(wrap);
}

export function showEpisodes(series, tabId) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());
  state.seriesId = series.id;
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
    const isThisSeries = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
    const playing = isThisSeries && !dom.audio.paused;
    playAllBtn.innerHTML = playing ? ICON_PAUSE_FILLED : ICON_PLAY_FILLED;
  }
  updatePlayAllBtn();
  dom.audio.addEventListener('play', updatePlayAllBtn);
  dom.audio.addEventListener('pause', updatePlayAllBtn);
  let cancelProbe = () => { };
  let onTimeUpdate = () => {};

  // Declared here so the MutationObserver cleanup closure can reference it; the real
  // implementation is assigned below once `ul` is available (it scopes queries to that element).
  let updateHighlight = () => {};

  const obs = new MutationObserver(() => {
    if (!view.parentNode) {
      dom.audio.removeEventListener('play', updatePlayAllBtn);
      dom.audio.removeEventListener('pause', updatePlayAllBtn);
      dom.audio.removeEventListener('timeupdate', onTimeUpdate);
      dom.audio.removeEventListener('playing', updateHighlight);
      dom.audio.removeEventListener('ended', updateHighlight);
      cancelProbe();
      obs.disconnect();
    }
  });
  obs.observe(dom.contentArea, { childList: true });

  playAllBtn.addEventListener('click', () => {
    const isThisSeries = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
    if (isThisSeries) { togglePlay(); }
    else { playList(series.episodes, 0, series); }
  });

  const ul = view.querySelector('#epList');

  // Sync the .playing highlight whenever actual playback starts (covers auto-advance via onEnded).
  // Uses the local `ul` so indices always match this series' list, regardless of other .ep-item
  // elements that might exist elsewhere in the document (e.g. search results).
  updateHighlight = () => {
    ul.querySelectorAll('.ep-item').forEach((el, i) => {
      el.classList.toggle('playing', isCurrentTrack(series.id, i));
    });
  };
  dom.audio.addEventListener('playing', updateHighlight);
  dom.audio.addEventListener('ended', updateHighlight);

  const hist = getHistory();
  // Build a history lookup map for O(1) access instead of O(n) .find() per episode
  const histMap = new Map();
  hist.forEach(h => { if (h.seriesId === series.id) histMap.set(h.epIdx, h); });
  // Use DocumentFragment for batch DOM insertion (avoids 196+ reflows)
  const frag = document.createDocumentFragment();
  series.episodes.forEach((ep, idx) => {
    const li = document.createElement('li');
    li.className = 'ep-item' + (isCurrentTrack(series.id, idx) ? ' playing' : '');
    const introHtml = ep.intro ? `<span class="ep-intro">${escapeHtml(ep.intro)}</span>` : '';
    // Check history for played progress
    const hEntry = histMap.get(idx);
    let progressHtml = '';
    if (hEntry && hEntry.duration > 0) {
      const pct = Math.min(100, Math.round(hEntry.time / hEntry.duration * 100));
      progressHtml = `<div class="ep-progress"><div class="ep-progress-fill" style="width:${pct}%"></div></div>`;
    }
    // Duration — prefer JSON duration, then localStorage cache, else empty (filled by probe)
    const dur = ep.duration || getCachedDuration(ep.url);
    const durText = dur ? fmtDuration(dur) : '';
    li.innerHTML = `<span class="ep-num">${ep.id || idx + 1}</span>
      <div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>
      <div class="ep-text"><span class="ep-title">${escapeHtml(ep.title || ep.fileName)}</span>${introHtml}${progressHtml}</div>
      <span class="ep-duration" data-idx="${idx}">${durText}</span>`;
    li.addEventListener('click', () => {
      if (isCurrentTrack(series.id, idx)) { togglePlay(); return; }
      const hist = getHistory();
      const hEntry = hist.find(h => h.seriesId === series.id && h.epIdx === idx);
      const resumeTime = (hEntry && hEntry.time > 5 && (!hEntry.duration || hEntry.time < hEntry.duration - 5)) ? hEntry.time : 0;
      playList(series.episodes, idx, series, resumeTime);
    });
    frag.appendChild(li);
  });
  ul.appendChild(frag);

  // Real-time progress bar for the currently playing episode (~1 update/sec)
  let progressTick = 0;
  onTimeUpdate = function () {
    const now = performance.now();
    if (now - progressTick < 1000) return;
    progressTick = now;
    const isThisSeries = state.playlist.length && state.epIdx >= 0
      && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
    if (!isThisSeries) return;
    const dur = dom.audio.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    const pct = Math.min(100, Math.round(dom.audio.currentTime / dur * 100));
    const li = ul.children[state.epIdx];
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
  getBatchCachedStatus(series.episodes.map(ep => ep.url)).then(cachedArr => {
    const tooltip = t('ep_cached_tooltip') || '已下载，可离线收听';
    cachedArr.forEach((cached, idx) => {
      if (!cached) return;
      const li = ul.children[idx];
      if (li) {
        li.classList.add('ep-cached');
        const durEl = li.querySelector('.ep-duration');
        if (durEl) durEl.title = tooltip;
      }
    });
  });

  // Probe audio durations in background — only for episodes missing JSON duration (non-blocking)
  cancelProbe = probeDurations(series.episodes, (idx, seconds) => {
    const el = ul.querySelector(`.ep-duration[data-idx="${idx}"]`);
    if (el) el.textContent = fmtDuration(seconds);
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

  // Fetch live play counts from API (non-blocking)
  getPlayCount(series.id).then(data => {
    if (!data || data.error) return;
    const countSpan = view.querySelector('#epPlayCount');
    if (countSpan && data.totalPlayCount > 0) {
      countSpan.textContent = ` \u00B7 ${fmtCount(data.totalPlayCount)}${t('play_count_unit') || '\u6B21'}`;
    }
  });

  // Update play count display when a new play is recorded for this series
  const onPlayCountUpdated = (e) => {
    if (e.detail?.seriesId !== series.id || !e.detail?.playCount) return;
    const countSpan = view.querySelector('#epPlayCount');
    if (countSpan) countSpan.textContent = ` \u00B7 ${fmtCount(e.detail.playCount)}${t('play_count_unit') || '\u6B21'}`;
  };
  window.addEventListener('playcount:updated', onPlayCountUpdated);
  // Store cleanup so MutationObserver can remove listener when view is removed
  const _origCleanupCache = _cleanupCacheListener;
  _cleanupCacheListener = () => {
    _origCleanupCache();
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
      import('./wenku.js').then(mod => {
        mod.renderWenkuSeries(series.wenkuSeries, () => showEpisodes(series, tabId));
      });
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
