/* ===== Audio Player Engine ===== */
import { state } from './state.js';
import { getDOM, RING_CIRCUMFERENCE } from './dom.js';
import { SVG, ICON_PLAY, ICON_PAUSE, ICON_PLAY_FILLED, ICON_PAUSE_FILLED, ICON_APPRECIATE, ICON_APPRECIATE_FILLED } from './icons.js';
import { t } from './i18n.js';
import { fmt, showToast, seekAt, haptic, fmtCount } from './utils.js';
import { addHistory, syncHistoryProgress, getHistory } from './history.js';
import { recordPlay, getAppreciateCount } from './api.js';
import { cacheAudio, getCachedAudioUrl, isAudioCached } from './audio-cache.js';
import { mp3FallbackUrl } from './audio-url.js';

/* ===== Playback State ===== */
let pendingSeek = 0;
let isSwitching = false;
let audioRetries = 0;
let _dragging = false;

/* ===== Background Full-Load State ===== */
// After playback starts, fetch the full audio file in the background.
// Once downloaded, switch <audio> to a Blob URL so all subsequent playback is local.
let bgFetchController = null;
let bgFetchUrl = '';
let bgBlobUrl = '';

/* ===== Network Quality State ===== */
let _networkWeak = false;  // set true on stall or slow connection detection

export function isNetworkWeak() { return _networkWeak; }
export function setNetworkWeak(v) { _networkWeak = v; state.networkWeak = v; }

/**
 * Detect connection type: 'wifi' | 'cellular' | 'unknown'
 * Uses navigator.connection.type (supported in Chrome/Android/Samsung).
 * Falls back to 'unknown' on iOS Safari and other browsers without the API.
 */
export function getConnType() {
  const conn = navigator.connection || navigator.mozConnection;
  if (!conn) return 'unknown';
  // conn.type: 'wifi', 'cellular', 'bluetooth', 'ethernet', 'none', 'other', 'unknown'
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'wifi';
  if (conn.type === 'cellular') return 'cellular';
  // Fallback: if type is missing but API exists, we can't determine — treat as unknown
  return 'unknown';
}

/* ===== Stall Detection State ===== */
let stallTimer = null;       // Timer for detecting prolonged stall
let stallRetries = 0;        // Auto-retry count for stalls
const MAX_STALL_RETRIES = 3;
const STALL_DETECT_MS = 12000; // 12s without progress → stalled

/* ===== Buffering UI helper ===== */
function setBuffering(on) {
  const dom = getDOM();
  dom.playerTrack.classList.toggle('buffering', on);
  dom.centerPlayBtn.classList.toggle('buffering', on);
  dom.expPlay.classList.toggle('buffering', on);
  // Clear error state when buffering starts (means we're retrying)
  if (on) clearErrorState();
}

/* ===== Error State UI ===== */
// Shows a persistent "tap to retry" message on the player track area
function setErrorState(msg) {
  const dom = getDOM();
  dom.playerTrack.classList.add('error');
  dom.playerTrack.dataset.errorMsg = msg || t('error_tap_retry');
  dom.centerPlayBtn.classList.add('error');
}

function clearErrorState() {
  const dom = getDOM();
  dom.playerTrack.classList.remove('error');
  delete dom.playerTrack.dataset.errorMsg;
  dom.centerPlayBtn.classList.remove('error');
}

/* ===== Stall Detection ===== */
// Called when audio stalls mid-playback (large files on R2 CDN)
function onStallDetected() {
  const dom = getDOM();
  if (!dom.audio.src || dom.audio.paused || dom.audio.ended) return;

  stallRetries++;
  console.warn(`[Player] Stall detected, auto-retry ${stallRetries}/${MAX_STALL_RETRIES}`);

  // Mark network as weak — this pauses preloading and reduces duration probe concurrency
  setNetworkWeak(true);
  cleanupPreload();

  if (stallRetries <= MAX_STALL_RETRIES) {
    // Auto-recover: save position, reload, and resume
    const currentTime = dom.audio.currentTime;
    const src = dom.audio.src;
    setBuffering(true);

    if (stallRetries >= 2) {
      showToast(t('error_stall'));
    }

    // Reload audio from current position
    dom.audio.src = src;
    dom.audio.load();
    dom.audio.addEventListener('loadeddata', function onLoad() {
      dom.audio.removeEventListener('loadeddata', onLoad);
      if (currentTime > 0) dom.audio.currentTime = currentTime;
      dom.audio.play().then(() => {
        setBuffering(false);
      }).catch(() => {
        setBuffering(false);
        setErrorState(t('error_stall_tap'));
        setPlayState(false);
      });
    }, { once: true });

    // Timeout for this recovery attempt
    setTimeout(() => {
      if (dom.audio.paused && !dom.audio.ended) {
        setBuffering(false);
        setErrorState(t('error_stall_tap'));
        setPlayState(false);
      }
    }, 20000);
  } else {
    // Exhausted retries — show persistent error
    setBuffering(false);
    setErrorState(t('error_stall_tap'));
    setPlayState(false);
  }
}

export function startStallWatch() {
  clearStallWatch();
  const dom = getDOM();
  let lastTime = dom.audio.currentTime;

  stallTimer = setInterval(() => {
    if (dom.audio.paused || dom.audio.ended || !dom.audio.src) {
      clearStallWatch();
      return;
    }
    const now = dom.audio.currentTime;
    if (now === lastTime && !dom.audio.seeking) {
      // No progress — audio might be stalled
      clearStallWatch();
      onStallDetected();
    }
    lastTime = now;
  }, STALL_DETECT_MS);
}

export function clearStallWatch() {
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
}

export function retryPlayback() {
  const dom = getDOM();
  if (!dom.audio.src) return;
  clearErrorState();
  audioRetries = 0;
  stallRetries = 0;
  setBuffering(true);
  const currentTime = dom.audio.currentTime;
  dom.audio.load();
  dom.audio.play().then(() => {
    setBuffering(false);
    setPlayState(true);
    if (currentTime > 0) dom.audio.currentTime = currentTime;
  }).catch(() => {
    // Fall back to waiting for canplay
    dom.audio.addEventListener('canplay', function onReady() {
      dom.audio.removeEventListener('canplay', onReady);
      setBuffering(false);
      if (currentTime > 0) dom.audio.currentTime = currentTime;
      dom.audio.play().then(() => setPlayState(true)).catch(() => {
        setBuffering(false);
        setErrorState(t('error_tap_retry'));
        setPlayState(false);
      });
    }, { once: true });
    // Timeout
    setTimeout(() => {
      setBuffering(false);
    }, 30000);
  });
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

// Prepare playlist + UI without calling play() — for autoplay-blocked contexts
// (first visit default track, restore from saved state without user gesture)
export function prepareList(episodes, idx, series, restoreTime) {
  cleanupPreload();
  state.playlist = episodes.map(ep => ({ ...ep, seriesId: series.id, seriesTitle: series.title, speaker: series.speaker }));
  state.epIdx = idx;
  pendingSeek = restoreTime || 0;
  const tr = state.playlist[state.epIdx];
  if (!tr) return;
  const dom = getDOM();
  dom.audio.src = tr.url;
  dom.audio.load();
  // ✅ Offline playback: async check cache, swap to blob URL if found
  getCachedAudioUrl(tr.url).then(cachedUrl => {
    if (!cachedUrl) return;
    dom.audio.src = cachedUrl;
    dom.audio.load();
    dom.audio._cachedBlobUrl = cachedUrl;
  }).catch(() => {});
  updateUI(tr);
  highlightEp();
  updateMediaSession(tr);
  updateAppreciateBtn(tr.seriesId);
  setPlayState(false);
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
  stallRetries = 0;
  clearStallWatch();
  clearErrorState();
  cleanupBgFetch(); // Cancel any in-progress background fetch for previous track
  const tr = state.playlist[state.epIdx];
  const callId = ++_playCurrentId; // unique ID for this invocation

  // Remove any stale listeners from previous rapid switches
  cleanupReadyListeners(dom);

  dom.audio.pause();

  // ✅ 核心优化：如果预加载的音频匹配当前要播放的URL，直接复用已缓冲的数据
  let usePreloaded = false;
  if (preloadAudio && preloadedUrl === tr.url && preloadAudio.readyState >= 2) {
    // Swap: copy the preloaded src (already buffered) to main audio
    usePreloaded = true;
    console.log('[Player] Reusing preloaded audio, readyState:', preloadAudio.readyState);
  }

  dom.audio.src = tr.url;
  dom.audio.playbackRate = SPEEDS[speedIdx];
  // Explicitly start loading — mobile browsers may ignore preload="auto"
  dom.audio.load();
  // Show loading state immediately (skip if preloaded — will resolve fast)
  if (!usePreloaded) setBuffering(true);
  const seekTime = pendingSeek > 0 ? pendingSeek : 0;
  pendingSeek = 0;

  // ✅ Offline playback: async check cache, swap to blob URL if found
  if (!usePreloaded) {
    getCachedAudioUrl(tr.url).then(cachedUrl => {
      if (callId !== _playCurrentId) { if (cachedUrl) URL.revokeObjectURL(cachedUrl); return; }
      if (cachedUrl) {
        const pos = dom.audio.currentTime;
        const rate = dom.audio.playbackRate;
        dom.audio.src = cachedUrl;
        dom.audio.playbackRate = rate;
        dom.audio.load();
        dom.audio._cachedBlobUrl = cachedUrl;
        if (pos > 0) dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = pos; }, { once: true });
      }
    }).catch(() => {});
  }

  // Clean up preload reference (src already set on main audio)
  if (usePreloaded) {
    preloadAudio.src = '';
    preloadAudio.load();
    preloadAudio = null;
    preloadedUrl = '';
  }

  // ✅ 优化：添加超时保护，防止isSwitching卡住（预加载时缩短到1.5秒）
  // Note: this only resets the isSwitching flag, NOT playback — play() continues independently
  const switchTimeout = usePreloaded ? 1500 : 8000;
  let switchingTimeout = setTimeout(() => {
    if (isSwitching && callId === _playCurrentId) {
      console.warn('[Player] isSwitching timeout, auto-reset');
      isSwitching = false;
      setBuffering(false);
      // Don't call setPlayState(false) here — audio.play() may still be pending
      // and will resolve on its own. Let the play/pause events handle UI state.
    }
  }, switchTimeout);

  function tryPlay() {
    if (callId !== _playCurrentId) return; // stale callback from previous switch
    setBuffering(false);
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    dom.audio.play().then(() => {
      clearTimeout(switchingTimeout);
      isSwitching = false;
      setPlayState(true);
      startStallWatch();
      // Reset networkWeak on successful playback start
      if (_networkWeak) setNetworkWeak(false);
      // Start background full-load after playback begins
      startBgFullLoad(tr.url);
    }).catch(err => {
      clearTimeout(switchingTimeout);
      isSwitching = false;
      if (callId === _playCurrentId && err.name !== 'AbortError') {
        setPlayState(false);
      }
    });
  }

  if (dom.audio.readyState >= 2) {
    tryPlay();
  } else {
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    dom.audio.play().then(() => {
      clearTimeout(switchingTimeout);
      isSwitching = false;
      setBuffering(false);
      setPlayState(true);
      startStallWatch();
      // Reset networkWeak on successful playback start
      if (_networkWeak) setNetworkWeak(false);
      // Start background full-load after playback begins
      startBgFullLoad(tr.url);
    }).catch(err => {
      if (err.name === 'AbortError') return;
      // Otherwise fall back to waiting for canplay/loadeddata events
      function onReady() {
        if (callId !== _playCurrentId) return;
        cleanupReadyListeners(dom);
        tryPlay();
      }
      dom.audio._onReady = onReady;
      dom.audio.addEventListener('canplay', onReady);
      dom.audio.addEventListener('loadeddata', onReady);

      // #18: Soft timeout at 15s — show "loading slow" hint but keep waiting
      dom.audio._slowTimeout = setTimeout(() => {
        dom.audio._slowTimeout = null;
        if (callId !== _playCurrentId) return;
        if (dom.audio._onReady) {
          showToast(t('loading_slow'));
        }
      }, 15000);

      // #18: Hard timeout at 45s — give up if still not ready (long audio files can be 80MB+)
      dom.audio._readyTimeout = setTimeout(() => {
        dom.audio._readyTimeout = null;
        if (callId !== _playCurrentId) return;
        if (dom.audio._onReady) {
          cleanupReadyListeners(dom);
          if (dom.audio.readyState >= 2) {
            tryPlay();
          } else {
            isSwitching = false;
            setBuffering(false);
            setPlayState(false);
            setErrorState(t('error_tap_retry'));
            showToast(t('error_play'));
          }
        }
      }, 45000);
    });
  }

  updateUI(tr);
  highlightEp();
  updateMediaSession(tr);
  updateAppreciateBtn(tr.seriesId); // Reset badge first (no count yet)
  
  // ✅ 优化：延迟加载点赞计数，避免阻塞播放启动
  // 使用 requestIdleCallback 在浏览器空闲时加载，或2秒后强制加载
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      getAppreciateCount(tr.seriesId).then(data => {
        if (data && data.total != null) updateAppreciateBtn(tr.seriesId, data.total);
      });
    }, { timeout: 2000 });
  } else {
    // 降级方案：延迟500ms后加载
    setTimeout(() => {
      getAppreciateCount(tr.seriesId).then(data => {
        if (data && data.total != null) updateAppreciateBtn(tr.seriesId, data.total);
      });
    }, 500);
  }
  
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

/* ===== Appreciate State (per-series, persisted in localStorage) ===== */

function getAppreciatedSet() {
  try {
    const raw = localStorage.getItem('appreciated');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) { return new Set(); }
}

function saveAppreciated(seriesId) {
  try {
    const set = getAppreciatedSet();
    set.add(seriesId);
    localStorage.setItem('appreciated', JSON.stringify([...set]));
  } catch (e) { /* ignore */ }
}

export function isAppreciated(seriesId) {
  return getAppreciatedSet().has(seriesId);
}

export function markAppreciated(seriesId) {
  saveAppreciated(seriesId);
}

export function updateAppreciateBtn(seriesId, total) {
  const btn = document.getElementById('expAppreciate');
  if (!btn) return;
  const appreciated = isAppreciated(seriesId);
  // Set icon based on localStorage state
  btn.innerHTML = appreciated ? ICON_APPRECIATE_FILLED : ICON_APPRECIATE;
  btn.classList.toggle('active', appreciated);
  btn.classList.remove('appreciate-pop');
  // Show badge with total count if available
  const oldBadge = btn.querySelector('.appreciate-badge');
  if (oldBadge) oldBadge.remove();
  if (total && total > 0) {
    const badge = document.createElement('span');
    badge.className = 'appreciate-badge';
    badge.textContent = fmtCount(total);
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

  // ✅ 优化：如果有总数，更新badge
  if (total != null && total > 0) {
    const oldBadge = btn.querySelector('.appreciate-badge');
    if (oldBadge) oldBadge.remove();
    const badge = document.createElement('span');
    badge.className = 'appreciate-badge';
    badge.textContent = fmtCount(total);
    btn.appendChild(badge);
  }
  
  setTimeout(() => { btn.classList.remove('appreciate-pop'); }, 600);
}

// ✅ 新增：更新点赞数（带动画）
export function updateAppreciateCount(total) {
  const btn = document.getElementById('expAppreciate');
  if (!btn || total == null) return;
  
  const oldBadge = btn.querySelector('.appreciate-badge');
  if (oldBadge) {
    // ✅ 数字增加动画
    oldBadge.classList.add('badge-bump');
    oldBadge.textContent = fmtCount(total);
    setTimeout(() => {
      oldBadge.classList.remove('badge-bump');
    }, 300);
  } else if (total > 0) {
    // 创建新badge
    const badge = document.createElement('span');
    badge.className = 'appreciate-badge';
    badge.textContent = fmtCount(total);
    btn.appendChild(badge);
  }
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
  // Remove dim state once audio is loaded
  dom.centerPlayBtn.classList.remove('no-audio');
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

// ✅ 优化：使用 requestAnimationFrame 节流 onTimeUpdate
let updateRafId = null;
let cachedDom = null;

export function onTimeUpdate() {
  if (_dragging) return; // Skip UI updates while user is dragging progress bar
  if (updateRafId) return; // 已经有待处理的更新，跳过
  
  updateRafId = requestAnimationFrame(() => {
    updateRafId = null;
    
    if (!cachedDom) cachedDom = getDOM();
    const dom = cachedDom;
    
    const dur = dom.audio.duration;
    if (!dur || !isFinite(dur)) return;
    const ct = dom.audio.currentTime;
    const p = Math.min(100, (ct / dur) * 100);
    
    // 批量更新DOM，减少重排/重绘
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

    // ✅ 优化：当播放进度达到80%时提前预加载下一曲，确保无缝切换
    if (p >= 80 && !preloadedUrl) {
      preloadNextTrack();
    }
  });
}

export function onEnded() {
  clearStallWatch();
  const dom = getDOM();
  if (state.loopMode === 'one') { dom.audio.currentTime = 0; dom.audio.play(); }
  else if (state.loopMode === 'shuffle') { state.epIdx = Math.floor(Math.random() * state.playlist.length); playCurrent(); }
  else if (state.epIdx < state.playlist.length - 1) { state.epIdx++; playCurrent(); }
  else if (state.loopMode === 'all') { state.epIdx = 0; playCurrent(); }
}

export function onAudioError() {
  clearStallWatch();
  const dom = getDOM();
  if (!dom.audio.error || dom.audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
  isSwitching = false;
  setBuffering(false);
  clearStallWatch();

  const errCode = dom.audio.error.code;
  const src = dom.audio.src;

  // Opus → MP3 fallback: if the current src is an opus URL that failed,
  // fall back to the server-provided MP3 URL (or best-effort derivation)
  if (src && src.includes('opus.foyue.org')) {
    const tr = state.playlist[state.epIdx];
    const mp3Url = (tr && tr.mp3Url) || mp3FallbackUrl(src);
    if (mp3Url && mp3Url !== src) {
      console.log('[Audio] Opus failed, falling back to MP3:', mp3Url);
      audioRetries = 0; // reset retries for the MP3 URL
      dom.audio.src = mp3Url;
      dom.audio.load();
      dom.audio.play().catch(() => {});
      return;
    }
  }

  // #17: Distinguish error types; first retry is silent
  if (src && audioRetries < 3) {
    audioRetries++;

    // Adjust retry delay based on error type
    const retryDelay = errCode === MediaError.MEDIA_ERR_NETWORK ?
      1000 * audioRetries :  // Network: fast retry
      2000 * audioRetries;   // Other: slow retry

    // Show toast on second retry, first is silent
    if (audioRetries === 2) {
      if (errCode === MediaError.MEDIA_ERR_NETWORK) {
        showToast(t('error_retry'));
      } else if (errCode === MediaError.MEDIA_ERR_DECODE) {
        showToast(t('error_decode'));
      } else {
        showToast(t('error_retry'));
      }
    }

    console.log(`[Audio Error] Retry ${audioRetries}/3 after ${retryDelay}ms`);

    setTimeout(() => {
      if (dom.audio.src === src) {
        setBuffering(true);
        dom.audio.load();
        dom.audio.play().catch(() => {
          setBuffering(false);
          console.log('[Audio Error] Retry failed');
        });
      }
    }, retryDelay);
  } else {
    // All retries exhausted — show persistent error state with tap-to-retry
    setPlayState(false);
    let errorMsg = '';
    switch (errCode) {
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorMsg = t('error_format');
        break;
      case MediaError.MEDIA_ERR_NETWORK:
        errorMsg = t('error_network');
        break;
      case MediaError.MEDIA_ERR_DECODE:
        errorMsg = t('error_decode');
        break;
      default:
        errorMsg = t('error_play');
    }
    // Show persistent error on player + toast
    setErrorState(t('error_tap_retry'));
    showToast(errorMsg);
    console.error('[Audio Error] Final error:', errCode, errorMsg);
  }
}

export function togglePlay() {
  const dom = getDOM();
  if (dom.audio.paused && dom.audio.src) {
    // ✅ 优化：立即更新UI为播放状态，提供即时视觉反馈
    setPlayState(true);
    dom.audio.play().then(() => {
      startStallWatch();
    }).catch(() => {
      // ✅ 如果播放失败，回滚UI状态
      setPlayState(false);
    });
  } else {
    // If switching tracks, cancel the switch cleanly
    if (isSwitching) {
      isSwitching = false;
      cleanupReadyListeners(dom);
      setBuffering(false);
    }
    dom.audio.pause();
    clearStallWatch();
    setPlayState(false);
  }
}

let _skipDebounce = 0;
const SKIP_DEBOUNCE_MS = 150;

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
  const title = '\u300A' + (series.title || '') + '\u300B' + (ep.title || ep.fileName);
  const shareUrl = window.location.origin + '/share/' + encodeURIComponent(series.id) + '/' + ep.id;
  if (navigator.share) {
    navigator.share({ title, text: title, url: shareUrl }).catch(() => {});
  } else {
    navigator.clipboard.writeText(title + '\n' + shareUrl).then(() => {
      showToast(t('link_copied'));
    }).catch(() => {});
  }
}

export function shareSeries(series) {
  const epCount = series.totalEpisodes || series.episodes?.length || 0;
  const unit = t('episodes') || '\u96C6';
  const title = '\u300A' + (series.title || '') + '\u300B' + (epCount ? '\u5171' + epCount + unit : '');
  const shareUrl = window.location.origin + '/share/' + encodeURIComponent(series.id);
  if (navigator.share) {
    navigator.share({ title, text: title, url: shareUrl }).catch(() => {});
  } else {
    navigator.clipboard.writeText(title + '\n' + shareUrl).then(() => {
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
  const nurl = state.playlist[ni] && state.playlist[ni].url;
  if (!nurl || nurl === preloadedUrl) return;

  // Skip preload when network is weak, save-data is on, or connection is 2G/3G
  if (_networkWeak) return;
  var conn = navigator.connection || navigator.mozConnection;
  if (conn && conn.saveData) return;
  if (conn && (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g')) return;

  cleanupPreload();
  preloadAudio = new Audio();
  // ✅ 关键优化：始终使用 preload="auto" 让浏览器真正缓冲音频数据
  // 这样切换下一曲时可以直接复用已缓冲的数据，大幅减少等待时间
  preloadAudio.preload = 'auto';
  preloadAudio.src = nurl;
  preloadedUrl = nurl;
  // Error handler: silently discard failed preloads so they aren't reused
  preloadAudio.addEventListener('error', () => {
    console.warn('[Preload] Failed to preload:', nurl);
    cleanupPreload();
  });
  // Timeout: if preload hasn't loaded enough data in 30s, discard it
  preloadAudio._preloadTimeout = setTimeout(() => {
    if (preloadAudio && preloadAudio.readyState < 2) {
      console.warn('[Preload] Timeout, discarding stalled preload');
      cleanupPreload();
    }
  }, 30000);
}

export function cleanupPreload() {
  if (preloadAudio) {
    if (preloadAudio._preloadTimeout) clearTimeout(preloadAudio._preloadTimeout);
    preloadAudio.src = '';
    preloadAudio.load();
    preloadAudio = null;
  }
  preloadedUrl = '';
}

/* ===== Background Full-Load ===== */
// Silently fetches the entire audio file via fetch(), then swaps <audio>.src
// to a local Blob URL so the rest of playback is fully local — zero network dependency.
const BG_LOAD_MAX_SIZE = 150 * 1024 * 1024; // Skip files > 150 MB

function cleanupBgFetch() {
  if (bgFetchController) { bgFetchController.abort(); bgFetchController = null; }
  if (bgBlobUrl) { URL.revokeObjectURL(bgBlobUrl); bgBlobUrl = ''; }
  bgFetchUrl = '';
  // Also revoke cached blob URL if present
  const dom = getDOM();
  if (dom.audio._cachedBlobUrl) { URL.revokeObjectURL(dom.audio._cachedBlobUrl); dom.audio._cachedBlobUrl = null; }
}

function startBgFullLoad(url) {
  // Don't re-fetch if already loading this URL or already blobbed
  if (bgFetchUrl === url) return;

  // Skip if audio is already in offline cache
  isAudioCached(url).then(cached => {
    if (cached) return;
    _doBgFullLoad(url);
  }).catch(() => _doBgFullLoad(url));
}

function _doBgFullLoad(url) {
  if (bgFetchUrl === url) return;
  cleanupBgFetch();

  // Skip on save-data or 2g (extremely slow connections)
  const conn = navigator.connection || navigator.mozConnection;
  if (conn && (conn.saveData || conn.effectiveType === '2g')) return;

  bgFetchUrl = url;
  bgFetchController = new AbortController();
  const fetchUrl = url;

  fetch(fetchUrl, { signal: bgFetchController.signal })
    .then(resp => {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      // Check Content-Length — skip very large files
      const cl = parseInt(resp.headers.get('content-length') || '0', 10);
      if (cl > BG_LOAD_MAX_SIZE) {
        console.log('[BgLoad] File too large (' + Math.round(cl / 1024 / 1024) + 'MB), skipping full load');
        cleanupBgFetch();
        return null;
      }
      return resp.blob();
    })
    .then(blob => {
      if (!blob) return;
      const dom = getDOM();
      // Only swap if still playing the same URL (compare resolved URL since dom.audio.src is resolved)
      if (dom.audio.src !== fetchUrl && !dom.audio.src.startsWith('blob:')) {
        cleanupBgFetch();
        return;
      }
      // Also check the original URL stored on the audio element
      const currentTrack = state.playlist[state.epIdx];
      if (!currentTrack || currentTrack.url !== bgFetchUrl) {
        cleanupBgFetch();
        return;
      }

      bgBlobUrl = URL.createObjectURL(blob);
      // Also cache for offline playback
      cacheAudio(url, blob).catch(() => {});
      const pos = dom.audio.currentTime;
      const wasPlaying = !dom.audio.paused;
      const rate = dom.audio.playbackRate;

      dom.audio.src = bgBlobUrl;
      dom.audio.playbackRate = rate;
      dom.audio.addEventListener('loadedmetadata', function onMeta() {
        dom.audio.removeEventListener('loadedmetadata', onMeta);
        dom.audio.currentTime = pos;
        if (wasPlaying) dom.audio.play().catch(() => {});
      }, { once: true });
      dom.audio.load();

      console.log('[BgLoad] Switched to local Blob URL');
      bgFetchController = null;
      bgFetchUrl = '';
      // Mark network as strong since full download succeeded
      setNetworkWeak(false);
    })
    .catch(err => {
      if (err.name !== 'AbortError') {
        console.warn('[BgLoad] Failed:', err.message);
      }
      bgFetchController = null;
      bgFetchUrl = '';
    });
}

/* ===== Visibility Change — Resume Buffer on Foreground ===== */
export function onVisibilityResume() {
  const dom = getDOM();
  if (!dom.audio.src || dom.audio.paused || dom.audio.ended) return;

  // Check if buffer is running low
  const ct = dom.audio.currentTime;
  const buffered = dom.audio.buffered;
  let bufEnd = 0;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= ct && buffered.end(i) >= ct) {
      bufEnd = buffered.end(i);
      break;
    }
  }
  const bufAhead = bufEnd - ct;

  // If less than 5s buffered ahead, nudge the audio to re-trigger buffering
  if (bufAhead < 5) {
    console.log('[Player] Low buffer on resume (' + bufAhead.toFixed(1) + 's), nudging playback');
    dom.audio.currentTime = ct; // Triggers a new Range request
    startStallWatch();
  }
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
          // ✅ Offline playback: async check cache, swap to blob URL if found
          getCachedAudioUrl(tr.url).then(cachedUrl => {
            if (!cachedUrl) return;
            dom.audio.src = cachedUrl;
            dom.audio._cachedBlobUrl = cachedUrl;
            if (s.time) dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = s.time; }, { once: true });
          }).catch(() => {});
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
