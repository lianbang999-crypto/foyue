/* ===== Audio Player Engine ===== */
import { state } from './state.js';
import { getDOM, RING_CIRCUMFERENCE } from './dom.js';
import { SVG, ICON_PLAY, ICON_PAUSE, ICON_PLAY_FILLED, ICON_PAUSE_FILLED, ICON_APPRECIATE, ICON_APPRECIATE_FILLED } from './icons.js';
import { t } from './i18n.js';
import { fmt, showToast, seekAt, haptic } from './utils.js';
import { addHistory, syncHistoryProgress, getHistory } from './history.js';
import { recordPlay, getAppreciateCount } from './api.js';

/* ===== Playback State ===== */
let pendingSeek = 0;
let isSwitching = false;
let audioRetries = 0;
let _dragging = false;

/* ===== Buffering UI helper ===== */
function setBuffering(on) {
  const dom = getDOM();
  dom.playerTrack.classList.toggle('buffering', on);
  dom.centerPlayBtn.classList.toggle('buffering', on);
  dom.expPlay.classList.toggle('buffering', on);
}

/* ===== Speed Control ===== */
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let speedIdx = 1;

/* ===== Sleep Timer ===== */
const TIMER_OPTS = [0, 30, 60, 120, 180];
let timerIdx = 0;
let sleepTimerId = null;
let sleepRemaining = 0;

/* ===== Preload ===== */
let preloadAudio = null;
let preloadedUrl = '';

/* ===== Playlist Panel ===== */
let playlistVisible = false;

export function getIsSwitching() { return isSwitching; }
export function getPlaylistVisible() { return playlistVisible; }
export function setDragging(v) { _dragging = v; }

export function playList(episodes, idx, series, restoreTime) {
  cleanupPreload();
  // #8: Always rebuild playlist — even for same series, episodes data may have been refreshed
  state.playlist = episodes.map(ep => ({ ...ep, seriesId: series.id, seriesTitle: series.title, speaker: series.speaker }));
  state.epIdx = idx;
  pendingSeek = restoreTime || 0;
  playCurrent();
}

let _playCurrentId = 0; // monotonic ID to detect stale callbacks

function cleanupReadyListeners(dom) {
  if (dom.audio._onReady) {
    dom.audio.removeEventListener('canplay', dom.audio._onReady);
    dom.audio.removeEventListener('loadeddata', dom.audio._onReady);
    dom.audio._onReady = null;
  }
  if (dom.audio._readyTimeout) {
    clearTimeout(dom.audio._readyTimeout);
    dom.audio._readyTimeout = null;
  }
  if (dom.audio._slowTimeout) {
    clearTimeout(dom.audio._slowTimeout);
    dom.audio._slowTimeout = null;
  }
}

function playCurrent() {
  const dom = getDOM();
  if (state.epIdx < 0 || state.epIdx >= state.playlist.length) return;
  isSwitching = true;
  audioRetries = 0;
  const tr = state.playlist[state.epIdx];
  const callId = ++_playCurrentId; // unique ID for this invocation

  // Remove any stale listeners from previous rapid switches
  cleanupReadyListeners(dom);

  dom.audio.pause();
  dom.audio.src = tr.url;
  dom.audio.playbackRate = SPEEDS[speedIdx];
  // Show loading state immediately
  setBuffering(true);
  const seekTime = pendingSeek > 0 ? pendingSeek : 0;
  pendingSeek = 0;

  function tryPlay() {
    if (callId !== _playCurrentId) return; // stale callback from previous switch
    setBuffering(false);
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    // Keep isSwitching=true until play() promise resolves, to block stale pause events
    dom.audio.play().then(() => {
      isSwitching = false;
    }).catch(() => {
      isSwitching = false;
      setPlayState(false);
    });
    // Safety: ensure isSwitching never stays stuck forever
    setTimeout(() => { isSwitching = false; }, 30000);
  }

  // Wait for canplay or loadeddata before calling play()
  function onReady() {
    if (callId !== _playCurrentId) return;
    cleanupReadyListeners(dom);
    tryPlay();
  }
  dom.audio._onReady = onReady;
  dom.audio.addEventListener('canplay', onReady);
  dom.audio.addEventListener('loadeddata', onReady);

  // #18: Soft timeout at 8s — show "loading slow" hint but keep waiting
  dom.audio._slowTimeout = setTimeout(() => {
    dom.audio._slowTimeout = null;
    if (callId !== _playCurrentId) return;
    if (dom.audio._onReady) {
      showToast(t('loading_slow') || '\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85...');
    }
  }, 8000);

  // #18: Hard timeout at 20s — give up if still not ready
  dom.audio._readyTimeout = setTimeout(() => {
    dom.audio._readyTimeout = null;
    if (callId !== _playCurrentId) return;
    if (dom.audio._onReady) {
      cleanupReadyListeners(dom);
      // readyState >= 2 (HAVE_CURRENT_DATA) means we can still attempt play
      if (dom.audio.readyState >= 2) {
        tryPlay();
      } else {
        isSwitching = false;
        setBuffering(false);
        setPlayState(false);
        showToast(t('error_play') || '\u52A0\u8F7D\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5');
      }
    }
  }, 20000);

  updateUI(tr);
  highlightEp();
  updateMediaSession(tr);
  updateAppreciateBtn(tr.seriesId); // Reset badge first (no count yet)
  // Fetch appreciate count in background
  getAppreciateCount(tr.seriesId).then(data => {
    if (data && data.total != null) updateAppreciateBtn(tr.seriesId, data.total);
  });
  renderPlaylistItems();
  addHistory(tr, dom.audio);
  // Record play to D1 database (non-blocking)
  recordPlay(tr.seriesId, tr.id || state.epIdx + 1);
}

function updateUI(tr) {
  const dom = getDOM();
  const title = tr.title || tr.fileName;
  dom.playerTrack.textContent = title;
  const epNum = state.epIdx >= 0 ? ` \u00B7 ${state.epIdx + 1}/${state.playlist.length}` : '';
  dom.playerSub.textContent = (tr.seriesTitle || '') + epNum;
  dom.expTitle.textContent = title;
  dom.expSeriesName.textContent = tr.seriesTitle || '';
  dom.expSeriesSpeaker.textContent = tr.speaker || '';
  const epNumExp = state.epIdx >= 0 ? `${state.epIdx + 1} / ${state.playlist.length}` : '';
  dom.expSeriesEpCount.textContent = epNumExp;
  dom.miniProgressFill.style.width = '0%';
  dom.expProgressFill.style.width = '0%';
  dom.expProgressThumb.style.left = '0%';
  dom.expBufferFill.style.width = '0%';
  dom.expTimeCurr.textContent = '0:00';
  dom.expTimeTotal.textContent = '0:00';
  dom.centerRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

/* ===== Appreciate State (per-episode, no daily limit) ===== */

export function markAppreciated(seriesId, episodeNum) {
  // No-op — appreciation is now fire-and-forget; badge shows server count
}

export function updateAppreciateBtn(seriesId, total) {
  const btn = document.getElementById('expAppreciate');
  if (!btn) return;
  // Reset state
  btn.classList.remove('active');
  btn.classList.remove('appreciate-pop');
  // Update icon to outline
  btn.innerHTML = ICON_APPRECIATE;
  // Show badge with total count if available
  const oldBadge = btn.querySelector('.appreciate-badge');
  if (oldBadge) oldBadge.remove();
  if (total && total > 0) {
    const badge = document.createElement('span');
    badge.className = 'appreciate-badge';
    badge.textContent = total > 999 ? '999+' : total;
    btn.appendChild(badge);
  }
}

export function appreciateSuccess(total) {
  const btn = document.getElementById('expAppreciate');
  if (!btn) return;
  // Switch to filled icon
  btn.innerHTML = ICON_APPRECIATE_FILLED;
  btn.classList.add('active');
  btn.classList.add('appreciate-pop');
  // Update badge
  const oldBadge = btn.querySelector('.appreciate-badge');
  if (oldBadge) oldBadge.remove();
  if (total && total > 0) {
    const badge = document.createElement('span');
    badge.className = 'appreciate-badge';
    badge.textContent = total > 999 ? '999+' : total;
    btn.appendChild(badge);
  }
  setTimeout(() => { btn.classList.remove('appreciate-pop'); }, 600);
}

export function setPlayState(playing) {
  const dom = getDOM();
  const icon = playing ? SVG.pause : SVG.play;
  dom.btnPlay.innerHTML = icon;
  dom.expPlay.innerHTML = icon;
  dom.centerPlayIcon.innerHTML = playing ?
    '<rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/>' :
    '<polygon points="8,4 20,12 8,20"/>';
  dom.centerPlayBtn.classList.toggle('playing', playing);
  // Update accessible labels
  const label = playing ? 'Pause' : 'Play';
  dom.centerPlayBtn.setAttribute('aria-label', label);
  dom.expPlay.setAttribute('aria-label', label);
  dom.btnPlay.setAttribute('aria-label', label);
}

export function highlightEp() {
  document.querySelectorAll('.ep-item').forEach((el, i) => el.classList.toggle('playing', isCurrentTrack(state.seriesId, i)));
}

export function isCurrentTrack(sid, idx) {
  if (state.epIdx < 0 || !state.playlist.length) return false;
  const c = state.playlist[state.epIdx];
  return c && c.seriesId === sid && idx === state.epIdx;
}

export function onTimeUpdate() {
  if (_dragging) return; // Skip UI updates while user is dragging progress bar
  const dom = getDOM();
  const dur = dom.audio.duration;
  if (!dur || !isFinite(dur)) return;
  const ct = dom.audio.currentTime;
  const p = Math.min(100, (ct / dur) * 100);
  dom.miniProgressFill.style.width = p + '%';
  dom.expProgressFill.style.width = p + '%';
  dom.expProgressThumb.style.left = p + '%';
  dom.expTimeCurr.textContent = fmt(ct);
  dom.expTimeTotal.textContent = fmt(dur);
  const offset = RING_CIRCUMFERENCE * (1 - ct / dur);
  dom.centerRingFill.style.strokeDashoffset = offset;
  if (dom.audio.buffered.length > 0) {
    const bufEnd = dom.audio.buffered.end(dom.audio.buffered.length - 1);
    dom.expBufferFill.style.width = Math.min(100, (bufEnd / dur) * 100) + '%';
  }
}

export function onEnded() {
  const dom = getDOM();
  if (state.loopMode === 'one') { dom.audio.currentTime = 0; dom.audio.play(); }
  else if (state.loopMode === 'shuffle') { state.epIdx = Math.floor(Math.random() * state.playlist.length); playCurrent(); }
  else if (state.epIdx < state.playlist.length - 1) { state.epIdx++; playCurrent(); }
  else if (state.loopMode === 'all') { state.epIdx = 0; playCurrent(); }
}

export function onAudioError() {
  const dom = getDOM();
  if (!dom.audio.error || dom.audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
  isSwitching = false;
  setBuffering(false);

  const errCode = dom.audio.error.code;
  const src = dom.audio.src;

  // #17: Distinguish error types; first retry is silent
  if (src && audioRetries < 2) {
    audioRetries++;
    // Only show toast on second retry, first retry is silent
    if (audioRetries === 2) {
      if (errCode === MediaError.MEDIA_ERR_NETWORK) {
        showToast(t('error_retry') || '\u7F51\u7EDC\u4E0D\u7A33\u5B9A\uFF0C\u91CD\u8BD5\u4E2D...');
      } else if (errCode === MediaError.MEDIA_ERR_DECODE) {
        showToast(t('error_decode') || '\u97F3\u9891\u89E3\u7801\u5931\u8D25\uFF0C\u91CD\u8BD5\u4E2D...');
      } else {
        showToast(t('error_retry') || '\u52A0\u8F7D\u5F02\u5E38\uFF0C\u91CD\u8BD5\u4E2D...');
      }
    }
    setTimeout(() => {
      if (dom.audio.src === src) { dom.audio.load(); dom.audio.play().catch(() => {}); }
    }, 1500 * audioRetries);
  } else {
    setPlayState(false);
    if (errCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      showToast(t('error_format') || '\u97F3\u9891\u683C\u5F0F\u4E0D\u652F\u6301');
    } else {
      showToast(t('error_play') || '\u64AD\u653E\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC');
    }
  }
}

export function togglePlay() {
  const dom = getDOM();
  if (dom.audio.paused && dom.audio.src) {
    dom.audio.play().catch(() => {});
  } else {
    // If switching tracks, cancel the switch cleanly
    if (isSwitching) {
      isSwitching = false;
      cleanupReadyListeners(dom);
      setBuffering(false);
    }
    dom.audio.pause();
    setPlayState(false);
  }
}

let _skipDebounce = 0;
const SKIP_DEBOUNCE_MS = 300;

function schedulePlayCurrent() {
  // Update UI immediately so user sees track title change
  const tr = state.playlist[state.epIdx];
  if (tr) updateUI(tr);
  const now = Date.now();
  _skipDebounce = now;
  // Debounce: wait briefly so rapid presses settle on final index before loading audio
  setTimeout(() => {
    if (_skipDebounce === now) playCurrent();
  }, SKIP_DEBOUNCE_MS);
}

export function prevTrack() {
  const dom = getDOM();
  if (dom.audio.currentTime > 3 && !isSwitching) { dom.audio.currentTime = 0; return; }
  if (state.epIdx > 0) {
    state.epIdx--;
    schedulePlayCurrent();
  } else {
    // #9: At first track with <=3s elapsed, restart from beginning
    dom.audio.currentTime = 0;
  }
}

export function nextTrack() {
  if (state.loopMode === 'shuffle') state.epIdx = Math.floor(Math.random() * state.playlist.length);
  else if (state.epIdx < state.playlist.length - 1) state.epIdx++;
  else if (state.loopMode === 'all') state.epIdx = 0;
  else return;
  schedulePlayCurrent();
}

/* ===== Loop Modes ===== */
export function applyLoopUI() {
  const btn = document.getElementById('expLoop');
  if (state.loopMode === 'one') {
    btn.innerHTML = SVG.loopOne;
    btn.classList.add('active');
    btn.title = t('loop_one') || 'Single loop';
  } else if (state.loopMode === 'shuffle') {
    btn.innerHTML = SVG.shuffle;
    btn.classList.add('active');
    btn.title = t('loop_shuffle') || 'Shuffle';
  } else {
    state.loopMode = 'all';
    btn.innerHTML = SVG.loopAll;
    btn.classList.add('active');
    btn.title = t('loop_all') || 'Loop all';
  }
}

export function cycleLoop() {
  const modes = ['all', 'one', 'shuffle'];
  const i = (modes.indexOf(state.loopMode) + 1) % modes.length;
  state.loopMode = modes[i];
  applyLoopUI();
}

/* ===== Share ===== */
export function shareTrack(ep, series) {
  const title = (ep.title || ep.fileName) + ' - ' + (series.title || '');
  const text = title + '\n' + t('share_from');
  const base = window.location.origin + window.location.pathname;
  const hash = '#' + encodeURIComponent(series.id + '/' + ep.id);
  if (navigator.share) {
    navigator.share({ title, text, url: base + hash }).catch(() => {});
  } else {
    const full = base + hash;
    navigator.clipboard.writeText(text + '\n' + full).then(() => {
      showToast(t('link_copied'));
    }).catch(() => {});
  }
}

/* ===== Speed Control ===== */
export function cycleSpeed() {
  const dom = getDOM();
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  const s = SPEEDS[speedIdx];
  dom.audio.playbackRate = s;
  document.getElementById('expSpeed').textContent = s === 1 ? '1.0x' : s + 'x';
  document.getElementById('expSpeed').classList.toggle('active', s !== 1);
}

export function getSpeedIdx() { return speedIdx; }
export function getSpeeds() { return SPEEDS; }
export function setSpeedIdx(idx) {
  speedIdx = idx;
  const dom = getDOM();
  dom.audio.playbackRate = SPEEDS[speedIdx];
  document.getElementById('expSpeed').textContent = SPEEDS[speedIdx] === 1 ? '1.0x' : SPEEDS[speedIdx] + 'x';
  document.getElementById('expSpeed').classList.toggle('active', SPEEDS[speedIdx] !== 1);
}

/* ===== Sleep Timer ===== */
export function cycleSleepTimer() {
  timerIdx = (timerIdx + 1) % TIMER_OPTS.length;
  const mins = TIMER_OPTS[timerIdx];
  if (sleepTimerId) { clearInterval(sleepTimerId); sleepTimerId = null; }
  const btn = document.getElementById('expTimer');
  const oldBadge = btn.querySelector('.timer-badge');
  if (oldBadge) oldBadge.remove();
  if (mins === 0) {
    sleepRemaining = 0;
    btn.classList.remove('active');
    showToast(t('timer_off'));
  } else {
    const dom = getDOM();
    sleepRemaining = mins * 60;
    btn.classList.add('active');
    const badge = document.createElement('span');
    badge.className = 'timer-badge';
    badge.textContent = mins;
    btn.appendChild(badge);
    showToast(t('timer_set') + mins + t('timer_min'));
    sleepTimerId = setInterval(() => {
      sleepRemaining--;
      const remaining = Math.ceil(sleepRemaining / 60);
      const b = btn.querySelector('.timer-badge');
      if (b) b.textContent = remaining;
      if (sleepRemaining <= 0) {
        clearInterval(sleepTimerId); sleepTimerId = null;
        dom.audio.pause(); timerIdx = 0;
        // #6: Explicitly update play state UI so button reflects paused state
        setPlayState(false);
        btn.classList.remove('active');
        const bd = btn.querySelector('.timer-badge');
        if (bd) bd.remove();
      }
    }, 1000);
  }
}

/* ===== Preload Next Track ===== */
function getNextTrackIdx() {
  if (!state.playlist.length) return -1;
  if (state.loopMode === 'shuffle') return -1;
  if (state.epIdx < state.playlist.length - 1) return state.epIdx + 1;
  if (state.loopMode === 'all') return 0;
  return -1;
}

export function preloadNextTrack() {
  const ni = getNextTrackIdx();
  if (ni < 0) { cleanupPreload(); return; }
  const nurl = state.playlist[ni]?.url;
  if (!nurl || nurl === preloadedUrl) return;
  const conn = navigator.connection || navigator.mozConnection;
  if (conn && (conn.saveData || conn.effectiveType === '2g')) return;
  cleanupPreload();
  preloadAudio = new Audio();
  preloadAudio.preload = 'metadata';
  preloadAudio.src = nurl;
  preloadedUrl = nurl;
}

export function cleanupPreload() {
  if (preloadAudio) { preloadAudio.src = ''; preloadAudio.load(); preloadAudio = null; }
  preloadedUrl = '';
}

/* ===== Playlist Panel ===== */
let plTab = 'current'; // 'current' | 'history'
let plSortAsc = true;

export function togglePlaylist() {
  const dom = getDOM();
  playlistVisible = !playlistVisible;
  dom.playlistPanel.classList.toggle('show', playlistVisible);
  dom.playlistPanel.setAttribute('aria-hidden', playlistVisible ? 'false' : 'true');
  dom.expPlayerContent.classList.toggle('hide', playlistVisible);
  dom.expQueue.classList.toggle('active', playlistVisible);
  if (playlistVisible) {
    plTab = 'current';
    updatePlTabs();
    renderPlaylistItems();
    // #1: Don't set scrollTop=0 then smooth-scroll — causes visible jump.
    // renderPlaylistItems() handles instant scroll positioning after panel animation settles.
  }
}

/* Close playlist only (without closing full screen) */
export function closePlaylist() {
  if (playlistVisible) togglePlaylist();
}

/* ===== Fullscreen Player API ===== */
export function openFullScreen(trackId) {
  const dom = getDOM();
  if (trackId && state.playlist && state.playlist.length) {
    const idx = state.playlist.findIndex(x => x.id === trackId || x.fileName === trackId);
    if (idx >= 0 && idx !== state.epIdx) {
      state.epIdx = idx;
      playCurrent();
    }
  }
  dom.expPlayer.classList.add('show');
  dom.expPlayer.setAttribute('aria-hidden', 'false');
}

export function closeFullScreen() {
  const dom = getDOM();
  // Close playlist first if open (without re-triggering full screen close)
  if (playlistVisible) {
    playlistVisible = false;
    dom.playlistPanel.classList.remove('show');
    dom.playlistPanel.setAttribute('aria-hidden', 'true');
    dom.expPlayerContent.classList.remove('hide');
    dom.expQueue.classList.remove('active');
  }
  dom.expPlayer.classList.remove('show');
  dom.expPlayer.setAttribute('aria-hidden', 'true');
}

function updatePlTabs() {
  const tabCur = document.getElementById('plTabCurrent');
  const tabHist = document.getElementById('plTabHistory');
  const sortBtn = document.getElementById('plSortBtn');
  if (tabCur) tabCur.classList.toggle('active', plTab === 'current');
  if (tabHist) tabHist.classList.toggle('active', plTab === 'history');
  if (sortBtn) sortBtn.style.display = plTab === 'current' ? '' : 'none';
}

export function initPlaylistTabs() {
  const tabCur = document.getElementById('plTabCurrent');
  const tabHist = document.getElementById('plTabHistory');
  const sortBtn = document.getElementById('plSortBtn');
  if (tabCur) tabCur.addEventListener('click', () => { haptic(); plTab = 'current'; updatePlTabs(); renderPlaylistItems(); });
  if (tabHist) tabHist.addEventListener('click', () => { haptic(); plTab = 'history'; updatePlTabs(); renderPlaylistItems(); });
  if (sortBtn) sortBtn.addEventListener('click', () => { haptic(); plSortAsc = !plSortAsc; document.getElementById('plSortLabel').textContent = t(plSortAsc ? 'pl_sort_asc' : 'pl_sort_desc'); renderPlaylistItems(); });
}

export function renderPlaylistItems() {
  const dom = getDOM();
  if (!playlistVisible) return;

  if (plTab === 'history') {
    renderHistoryTab(dom);
    return;
  }

  // Current series tab
  const items = plSortAsc ? [...state.playlist] : [...state.playlist].reverse();
  dom.plCount.textContent = state.playlist.length + ' ' + t(state.tab === 'fohao' ? 'tracks' : 'episodes');
  dom.plItems.innerHTML = '';
  const hist = getHistory();
  const histMap = new Map();
  hist.forEach(h => { const key = h.seriesId + ':' + h.epIdx; histMap.set(key, h); });
  const frag = document.createDocumentFragment();
  items.forEach((tr, displayIdx) => {
    const realIdx = plSortAsc ? displayIdx : state.playlist.length - 1 - displayIdx;
    const isCurrent = realIdx === state.epIdx;
    const div = document.createElement('div');
    div.className = 'pl-item' + (isCurrent ? ' current' : '');

    // Build meta info (duration + progress)
    let metaHTML = '';
    if (tr.duration) {
      metaHTML += `<span class="pl-item-duration">${fmt(tr.duration)}</span>`;
    }
    // Show progress from history if available
    const hEntry = histMap.get(tr.seriesId + ':' + realIdx);
    if (hEntry && hEntry.duration > 0) {
      const pct = Math.round(hEntry.time / hEntry.duration * 100);
      if (pct > 0 && pct < 100) metaHTML += `<span class="pl-item-progress">${t('pl_played')}${pct}%</span>`;
    }

    div.innerHTML = `<span class="pl-item-num">${realIdx + 1}</span><div class="pl-item-body"><div class="pl-item-title">${tr.title || tr.fileName}</div>${metaHTML ? '<div class="pl-item-meta">' + metaHTML + '</div>' : ''}</div>`;
    div.addEventListener('click', () => { haptic(); state.epIdx = realIdx; playCurrent(); });
    frag.appendChild(div);
  });
  dom.plItems.appendChild(frag);
  // #1: Scroll current item into view after panel animation completes (340ms).
  // Use instant scroll (no behavior:'smooth') to avoid visible jump.
  const cur = dom.plItems.querySelector('.current');
  if (cur) {
    const doScroll = () => {
      const containerH = dom.plItems.clientHeight;
      const itemTop = cur.offsetTop;
      const itemH = cur.offsetHeight;
      dom.plItems.scrollTo({ top: itemTop - containerH / 2 + itemH / 2 });
    };
    // If panel is still animating in, defer until animation settles
    if (dom.plItems.clientHeight < 10) {
      setTimeout(doScroll, 360);
    } else {
      doScroll();
    }
  }
}

function renderHistoryTab(dom) {
  const hist = getHistory();
  dom.plCount.textContent = hist.length + ' ' + t('episodes');
  dom.plItems.innerHTML = '';
  if (!hist.length) {
    dom.plItems.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.8rem">${t('my_no_history')}</div>`;
    return;
  }
  hist.forEach(h => {
    const div = document.createElement('div');
    div.className = 'pl-item';
    const pct = h.duration > 0 ? Math.round(h.time / h.duration * 100) : 0;
    let metaHTML = '';
    if (h.duration > 0) metaHTML += `<span class="pl-item-duration">${fmt(h.duration)}</span>`;
    if (pct > 0) metaHTML += `<span class="pl-item-progress">${t('pl_played')}${pct}%</span>`;
    div.innerHTML = `<span class="pl-item-num">\u25B6</span><div class="pl-item-body"><div class="pl-item-title">${h.epTitle}</div><div class="pl-hist-sub">${h.seriesTitle}${h.speaker ? ' \u00B7 ' + h.speaker : ''}</div>${metaHTML ? '<div class="pl-item-meta">' + metaHTML + '</div>' : ''}</div>`;
    div.addEventListener('click', () => {
      haptic();
      if (!state.data) return;
      for (const cat of state.data.categories) {
        const sr = cat.series.find(s => s.id === h.seriesId);
        if (sr) { playList(sr.episodes, h.epIdx, sr, h.time); return; }
      }
    });
    dom.plItems.appendChild(div);
  });
}

/* ===== Media Session ===== */
function updateMediaSession(tr) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: tr.title || tr.fileName,
    artist: tr.speaker || '\u5927\u5B89\u6CD5\u5E08',
    album: tr.seriesTitle || '\u51C0\u571F\u6CD5\u97F3'
  });
  try {
    const dom = getDOM();
    navigator.mediaSession.setActionHandler('play', () => dom.audio.play());
    navigator.mediaSession.setActionHandler('pause', () => dom.audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('seekbackward', () => { if (dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { if (dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 10); });
    navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime != null) dom.audio.currentTime = d.seekTime; });
  } catch (e) { /* ignore */ }
}

/* ===== Persistence ===== */
export function saveState() {
  const dom = getDOM();
  try {
    const tr = state.playlist[state.epIdx];
    if (!tr) return;
    localStorage.setItem('pl-state', JSON.stringify({
      seriesId: tr.seriesId, idx: state.epIdx, time: dom.audio.currentTime, duration: dom.audio.duration || 0,
      tab: state.tab, loop: state.loopMode, speed: SPEEDS[speedIdx]
    }));
    syncHistoryProgress(dom.audio);
  } catch (e) { /* ignore */ }
}

export function restoreState(renderCategory, renderHomePage, renderMyPage) {
  const dom = getDOM();
  try {
    const s = JSON.parse(localStorage.getItem('pl-state'));
    if (!s || !s.seriesId) return;
    for (const cat of state.data.categories) {
      const sr = cat.series.find(x => x.id === s.seriesId);
      if (sr) {
        state.playlist = sr.episodes.map(ep => ({ ...ep, seriesId: sr.id, seriesTitle: sr.title, speaker: sr.speaker }));
        state.epIdx = s.idx || 0;
        const tr = state.playlist[state.epIdx];
        if (tr) {
          dom.audio.src = tr.url;
          if (s.time) dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = s.time; }, { once: true });
          updateUI(tr);
        }
        if (s.loop) {
          state.loopMode = (s.loop === 'none') ? 'all' : s.loop;
          applyLoopUI();
        }
        if (s.speed && s.speed !== 1) {
          const si = SPEEDS.indexOf(s.speed);
          if (si >= 0) { speedIdx = si; dom.audio.playbackRate = s.speed; document.getElementById('expSpeed').textContent = s.speed + 'x'; document.getElementById('expSpeed').classList.add('active'); }
        }
        if (s.tab) {
          state.tab = s.tab === 'fohao' ? 'home' : s.tab;
          document.querySelectorAll('.tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === state.tab);
            b.setAttribute('aria-selected', b.dataset.tab === state.tab ? 'true' : 'false');
          });
          const ti18n = { home: 'tab_home', tingjingtai: 'tab_lectures', youshengshu: 'tab_audiobooks', mypage: 'tab_my' };
          dom.navTitle.textContent = t(ti18n[state.tab] || 'tab_home');
          dom.navTitle.dataset.i18n = ti18n[state.tab] || 'tab_home';
          if (state.tab === 'mypage') renderMyPage();
          else if (state.tab === 'home') renderHomePage();
          else renderCategory(state.tab);
        }
        state.isFirstVisit = false;
        break;
      }
    }
  } catch (e) { /* ignore */ }
}
