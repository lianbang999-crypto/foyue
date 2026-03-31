/* ===== Audio Player Engine ===== */
import { state } from './state.js';
import { getDOM, RING_CIRCUMFERENCE } from './dom.js';
import { SVG, CENTER_PLAY_INNER, ICON_PLAY, ICON_PAUSE, ICON_PLAY_FILLED, ICON_PAUSE_FILLED, ICON_APPRECIATE, ICON_APPRECIATE_FILLED } from './icons.js';
import { t } from './i18n.js';
import { fmt, showToast, haptic, fmtCount, escapeHtml, shareContent, isAppleMobile } from './utils.js';
import { addHistory, syncHistoryProgress, getHistory, findHistoryEntryForTrack, resolveHistoryTarget } from './history.js';
import { recordPlay, getAppreciateCount } from './api.js';
import { cacheAudio, getCachedAudioUrl, isAudioCached, isCachedSync } from './audio-cache.js';
import { getTrackWithCachedAudioMeta } from './audio-meta-cache.js';
import { drainResponseBody } from './audio-url.js';
import { isInAppBrowser } from './pwa.js';
import { getPlaybackPolicy } from './playback-policy.js';
import { get, set, patch, saveNow } from './store.js';

/* ===== Playback State ===== */
let pendingSeek = 0;
let isSwitching = false;
let audioRetries = 0;
let _dragging = false;
// Prevents a second play() from racing while the first is still resolving (rapid-click guard)
let _playPending = false;
let _switchingTimeoutId = null;
// Prevents pause event from changing play state during stall/ghost recovery
let _isRecovering = false;

function finishRecovery() {
  _isRecovering = false;
}

/**
 * Tracks explicit user intent: true when user pressed pause themselves.
 * Guards all auto-resume paths (stall recovery, bg-load swap) so they never
 * restart playback against the user's will.
 */
let _userPaused = false;

/* ===== Background Full-Load State ===== */
// After playback starts, fetch the full audio file in the background.
// Once downloaded, switch <audio> to a Blob URL so all subsequent playback is local.
let bgFetchController = null;
let bgFetchUrl = '';
let bgBlobUrl = '';
const SHORT_AUDIO_DURATION_S = 15 * 60;

function buildPlaylistEntries(episodes, series) {
  return episodes.map(ep => {
    return {
      ...ep,
      seriesId: series.id,
      seriesTitle: series.title,
      speaker: series.speaker,
      categoryId: series.categoryId,
    };
  });
}

/* ===== Play count (server-side series.play_count) =====
 * 旧逻辑：在 playCurrent() 末尾立刻 recordPlay → 加载失败也会 +1，且连点同一集会重复计数。
 * 现逻辑：仅在 audio.play() 成功且仍为当前 callId 时上报，并对同一 series+集号短时去重。
 */
const PLAY_COUNT_DEBOUNCE_MS = 6000;
let _lastPlayCountKey = '';
let _lastPlayCountAt = 0;

function episodeNumForPlayCount(tr) {
  const id = tr.id;
  if (typeof id === 'number' && Number.isInteger(id) && id >= 0) return id;
  if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10);
  return state.epIdx + 1;
}

function maybeRecordPlayCount(tr, callId) {
  if (callId !== _playCurrentId) return;
  const epNum = episodeNumForPlayCount(tr);
  const key = `${tr.seriesId}:${epNum}`;
  const now = Date.now();
  if (key === _lastPlayCountKey && now - _lastPlayCountAt < PLAY_COUNT_DEBOUNCE_MS) return;
  _lastPlayCountKey = key;
  _lastPlayCountAt = now;
  recordPlay(tr.seriesId, epNum);
}

/* ===== Network Quality State ===== */
let _networkWeak = false;  // set true on stall or slow connection detection

export function isNetworkWeak() { return _networkWeak; }
export function setNetworkWeak(v) {
  _networkWeak = v;
  state.networkWeak = v;
  // ✅ 优化：网络状态变化时更新stall检测间隔
  updateStallDetectInterval();
}

/* ===== Stall Detection State ===== */
let stallTimer = null;       // Timer for detecting prolonged stall
let stallRetries = 0;        // Auto-retry count for stalls
let _ghostSuspectCount = 0;  // Consecutive checks where played ranges didn't advance
let _ghostPlaybackDriftSince = 0;
let _ghostPlaybackLastPlayedEnd = 0;
const MAX_STALL_RETRIES = 3;
// ✅ 优化：根据网络状况动态调整stall检测间隔
let STALL_DETECT_MS = 12000; // 默认12s without progress → stalled
const IOS_GHOST_PLAYED_LAG_S = 1.5;
const IOS_IN_APP_GHOST_PLAYED_LAG_S = 0.8;
const IOS_GHOST_RECOVERY_DELAY_MS = 2500;
const IOS_IN_APP_GHOST_RECOVERY_DELAY_MS = 1200;
const _isInAppBrowser = isInAppBrowser();

function resetGhostPlaybackTracking() {
  _ghostSuspectCount = 0;
  _ghostPlaybackDriftSince = 0;
  _ghostPlaybackLastPlayedEnd = 0;
}

function getGhostPlaybackThresholds() {
  if (_isInAppBrowser) {
    return {
      lagSeconds: IOS_IN_APP_GHOST_PLAYED_LAG_S,
      recoveryDelayMs: IOS_IN_APP_GHOST_RECOVERY_DELAY_MS,
    };
  }

  return {
    lagSeconds: IOS_GHOST_PLAYED_LAG_S,
    recoveryDelayMs: IOS_GHOST_RECOVERY_DELAY_MS,
  };
}

function getGhostPlaybackLag(audio) {
  return audio.currentTime - getLastPlayedEnd(audio);
}

function shouldForceGhostRecovery(audio) {
  if (!isAppleMobile()) return false;
  if (!audio || audio.paused || audio.ended || audio.seeking) return false;
  const thresholds = getGhostPlaybackThresholds();
  return getGhostPlaybackLag(audio) >= thresholds.lagSeconds;
}

function updateStallDetectInterval() {
  // On a weak network the browser takes longer to buffer, so give it more time
  // before declaring a stall (shorter threshold → more false positives, not fewer).
  if (_networkWeak) {
    STALL_DETECT_MS = 25000; // 网络弱时延长到25秒，避免把正常缓冲误判为卡顿
  } else {
    STALL_DETECT_MS = 12000; // 正常情况12秒
  }
}

/* ===== Buffering UI helper ===== */
export function setBuffering(on) {
  const dom = getDOM();
  dom.playerTrack.classList.toggle('buffering', on);
  if (dom.centerPlayBtn) dom.centerPlayBtn.classList.toggle('buffering', on);
  dom.expPlay.classList.toggle('buffering', on);
  // Clear error state when buffering starts (means we're retrying)
  if (on) clearErrorState();
}

function syncBufferingUi() {
  const dom = getDOM();
  if (!dom.audio.src || dom.audio.ended) {
    setBuffering(false);
    return;
  }
  if (isSwitching || _playPending) return;

  const hasFutureData = dom.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const hasCurrentData = dom.audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

  if (dom.audio.paused) {
    setBuffering(false);
    return;
  }

  if (hasFutureData || (hasCurrentData && !dom.audio.seeking)) {
    setBuffering(false);
  }
}

export function reconcilePlaybackUiAfterForeground() {
  const dom = getDOM();
  if (!dom.audio.src || dom.audio.ended) {
    setBuffering(false);
    return;
  }

  if (isSwitching || _playPending) return;

  if (dom.audio.paused) {
    setBuffering(false);
    if (_userPaused) setPlayState(false);
    return;
  }

  syncBufferingUi();
}

/* ===== Error State UI ===== */
// Shows a persistent "tap to retry" message on the player track area
function setErrorState(msg) {
  const dom = getDOM();
  dom.playerTrack.classList.add('error');
  dom.playerTrack.dataset.errorMsg = msg || t('error_tap_retry');
  if (dom.centerPlayBtn) dom.centerPlayBtn.classList.add('error');
}

function clearErrorState() {
  const dom = getDOM();
  dom.playerTrack.classList.remove('error');
  delete dom.playerTrack.dataset.errorMsg;
  if (dom.centerPlayBtn) dom.centerPlayBtn.classList.remove('error');
}

/* ===== Stall Detection ===== */

/**
 * 获取 audio.played TimeRanges 中最后一段的结束时间。
 * played TimeRanges 反映浏览器实际解码播放过的时间区间，
 * 在幽灵播放 (ghost playback) 下不会跟随 currentTime 推进。
 */
function getLastPlayedEnd(audio) {
  try {
    if (audio.played && audio.played.length > 0) {
      return audio.played.end(audio.played.length - 1);
    }
  } catch (e) { /* SecurityError on some cross-origin setups */ }
  return 0;
}

/**
 * 共享卡顿恢复逻辑：幽灵播放和普通卡顿共用。
 * @param {number} safePosition - 恢复播放的安全位置
 * @param {boolean} fullReset - 是否完全重置音频元素（幽灵播放需要）
 */
function _recoverAudio(safePosition, fullReset) {
  const dom = getDOM();
  stallRetries++;
  setNetworkWeak(true);
  _isRecovering = true;

  if (stallRetries > MAX_STALL_RETRIES) {
    finishRecovery();
    setBuffering(false);
    dom.audio.pause();
    setPlayState(false);
    setErrorState(t('error_stall_tap'));
    showToast(t('error_stall'));
    return;
  }

  const src = dom.audio.src;
  const recoveryCallId = _playCurrentId;
  setBuffering(true);
  if (stallRetries >= 2) showToast(t('error_stall'));

  function doReload() {
    if (recoveryCallId !== _playCurrentId) { finishRecovery(); return; }
    dom.audio.src = src;
    dom.audio.load();
    dom.audio.addEventListener('loadeddata', function onLoad() {
      dom.audio.removeEventListener('loadeddata', onLoad);
      if (recoveryCallId !== _playCurrentId) { finishRecovery(); return; }
      if (safePosition > 0) dom.audio.currentTime = safePosition;
      if (_userPaused) {
        finishRecovery();
        setBuffering(false);
        setPlayState(false);
        return;
      }
      dom.audio.play().then(() => {
        finishRecovery();
        setBuffering(false);
        startStallWatch();
      }).catch(() => {
        finishRecovery();
        setBuffering(false);
        setErrorState(t('error_stall_tap'));
        setPlayState(false);
      });
    }, { once: true });

    // 20秒超时保护
    setTimeout(() => {
      if (recoveryCallId !== _playCurrentId) { finishRecovery(); return; }
      if (dom.audio.paused && !dom.audio.ended) {
        finishRecovery();
        setBuffering(false);
        if (!_userPaused) setErrorState(t('error_stall_tap'));
        setPlayState(false);
      }
    }, 20000);
  }

  if (fullReset) {
    // 幽灵播放需要完全重置音频元素，清除损坏的 iOS 音频会话
    dom.audio.pause();
    dom.audio.removeAttribute('src');
    dom.audio.load();
    setTimeout(doReload, 100);
  } else {
    doReload();
  }
}

/**
 * iOS 幽灵播放恢复：当检测到 currentTime 在推进但 played 时间段停滞时，
 * 强制重置音频元素并从真实播放位置恢复。
 */
function onGhostPlaybackDetected(safePosition) {
  console.warn(`[Player] Ghost playback recovery ${stallRetries + 1}/${MAX_STALL_RETRIES} — resuming from ${safePosition.toFixed(1)}s`);
  _recoverAudio(safePosition, true);
}

// Called when audio stalls mid-playback (large files on R2 CDN)
function onStallDetected() {
  const dom = getDOM();
  if (!dom.audio.src || dom.audio.paused || dom.audio.ended) return;
  console.warn(`[Player] Stall detected, auto-retry ${stallRetries + 1}/${MAX_STALL_RETRIES}`);
  _recoverAudio(dom.audio.currentTime, false);
}

export function startStallWatch() {
  clearStallWatch();
  const dom = getDOM();
  let lastTime = dom.audio.currentTime;
  let lastPlayedEnd = getLastPlayedEnd(dom.audio);
  resetGhostPlaybackTracking();
  _ghostPlaybackLastPlayedEnd = lastPlayedEnd;

  stallTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') {
      lastTime = dom.audio.currentTime;
      lastPlayedEnd = getLastPlayedEnd(dom.audio);
      resetGhostPlaybackTracking();
      _ghostPlaybackLastPlayedEnd = lastPlayedEnd;
      return;
    }
    if (dom.audio.paused || dom.audio.ended || !dom.audio.src) {
      clearStallWatch();
      return;
    }
    const now = dom.audio.currentTime;

    // 原始卡顿检测：currentTime 完全不推进
    if (now === lastTime && !dom.audio.seeking) {
      clearStallWatch();
      onStallDetected();
      return;
    }

    // ✅ iOS 幽灵播放检测：currentTime 在推进但 played 时间段没有延伸
    // 这表明音频解码器已停止工作，但浏览器仍认为在"播放中"
    const currentPlayedEnd = getLastPlayedEnd(dom.audio);
    if (now > lastTime + 1 && currentPlayedEnd < lastPlayedEnd + 0.5) {
      _ghostSuspectCount++;
      if (_ghostSuspectCount >= 2) {
        // 连续两次检测窗口内 played 未推进 → 确认幽灵播放
        console.warn('[Player] Ghost playback — currentTime:', now.toFixed(1),
          'played.end:', currentPlayedEnd.toFixed(1));
        clearStallWatch();
        onGhostPlaybackDetected(currentPlayedEnd > 0 ? currentPlayedEnd : lastPlayedEnd);
        return;
      }
    } else {
      _ghostSuspectCount = 0;
    }

    lastTime = now;
    lastPlayedEnd = currentPlayedEnd;
  }, STALL_DETECT_MS);
}

export function clearStallWatch() {
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
  resetGhostPlaybackTracking();
}

export function retryPlayback() {
  const dom = getDOM();
  if (!dom.audio.src) return;
  clearErrorState();
  audioRetries = 0;
  stallRetries = 0;
  _ghostSuspectCount = 0;
  setBuffering(true);

  // ✅ 修复seek竞态：保存当前位置，使用pendingSeek机制
  const savedTime = dom.audio.currentTime;
  // ✅ iOS 修复：用 played 范围确定真实播放位置（防止幽灵播放后 currentTime 虚高）
  const lastPlayed = getLastPlayedEnd(dom.audio);
  pendingSeek = (lastPlayed > 0 && lastPlayed < savedTime - 2) ? lastPlayed : savedTime;
  const retryCallId = _playCurrentId; // ✅ 修复：用callId防护stale回调

  // ✅ iOS 修复：完全重置音频元素，清除损坏的音频会话
  const src = dom.audio.src;
  dom.audio.pause();
  dom.audio.removeAttribute('src');
  dom.audio.load();
  dom.audio.src = src;

  dom.audio.load();
  dom.audio.play().then(() => {
    if (retryCallId !== _playCurrentId) return; // ✅ 已切曲目，忽略
    setBuffering(false);
    setPlayState(true);
    startStallWatch(); // Resume stall detection after manual retry
  }).catch(() => {
    // Fall back to waiting for canplay
    dom.audio.addEventListener('canplay', function onReady() {
      dom.audio.removeEventListener('canplay', onReady);
      if (retryCallId !== _playCurrentId) return; // ✅ 已切曲目，忽略stale回调
      setBuffering(false);
      // ✅ 使用pendingSeek而不是直接设置currentTime
      if (pendingSeek > 0) {
        dom.audio.currentTime = pendingSeek;
        pendingSeek = 0; // 清除pendingSeek
      }
      dom.audio.play().then(() => {
        setPlayState(true);
        startStallWatch(); // Resume stall detection after canplay retry
      }).catch(() => {
        setBuffering(false);
        setErrorState(t('error_tap_retry'));
        setPlayState(false);
      });
    }, { once: true });
    // Timeout
    setTimeout(() => {
      if (retryCallId !== _playCurrentId) return; // ✅ 已切曲目，忽略
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



/* ===== Playlist Panel ===== */
let playlistVisible = false;

function setExpandedViewportLock(locked) {
  document.body.classList.toggle('player-modal-open', locked);
}

export function getIsSwitching() { return isSwitching; }
export function getIsRecovering() { return _isRecovering; }
export function getPlaylistVisible() { return playlistVisible; }
export function setDragging(v) { _dragging = v; }

export function playList(episodes, idx, series, restoreTime) {
  _userPaused = false; // User is explicitly requesting playback of a new track
  // #8: Always rebuild playlist — even for same series, episodes data may have been refreshed
  state.playlist = buildPlaylistEntries(episodes, series);
  state.epIdx = idx;
  pendingSeek = restoreTime || 0;
  playCurrent();
}

// Prepare playlist + UI without calling play() — for autoplay-blocked contexts
// (first visit default track, restore from saved state without user gesture)
export function prepareList(episodes, idx, series, restoreTime) {
  state.playlist = buildPlaylistEntries(episodes, series);
  state.epIdx = idx;
  pendingSeek = restoreTime || 0;
  const tr = state.playlist[state.epIdx];
  if (!tr) return;
  const dom = getDOM();
  const capturedId = _playCurrentId; // guard against rapid calls overwriting each other
  if (!isCachedSync(tr.url)) {
    if (_playCurrentId !== capturedId) return;
    dom.audio.src = tr.url;
    dom.audio.load();
  } else {
    getCachedAudioUrl(tr.url).then(cachedUrl => {
      if (_playCurrentId !== capturedId) {
        if (cachedUrl) URL.revokeObjectURL(cachedUrl);
        return;
      }
      const srcUrl = cachedUrl || tr.url;
      if (cachedUrl) dom.audio._cachedBlobUrl = cachedUrl;
      dom.audio.src = srcUrl;
      dom.audio.load();
    }).catch(() => {
      if (_playCurrentId !== capturedId) return;
      dom.audio.src = tr.url;
      dom.audio.load();
    });
  }
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

function clearSwitchingTimeout() {
  if (_switchingTimeoutId) {
    clearTimeout(_switchingTimeoutId);
    _switchingTimeoutId = null;
  }
}

function cancelPendingTrackLoad() {
  if (!isSwitching) return;
  const dom = getDOM();
  _playCurrentId += 1;
  finishRecovery();
  clearSwitchingTimeout();
  cleanupPlaybackPreparations();
  cleanupReadyListeners(dom);
  isSwitching = false;
  setBuffering(false);
  renderPlaylistItems();
}

function cleanupPlaybackPreparations() {
  cleanupBgFetch();
}

function scheduleCurrentTrackLoading(track) {
  const policy = getPlaybackPolicy({ track: getTrackWithCachedAudioMeta(track) });
  if (policy.shouldFullLoadCurrent) {
    startBgFullLoad(track?.url);
  }
}

/** 计算本次播放的起始位置：pendingSeek > 历史续播位置 > 0 */
function _computeSeekTime(tr) {
  if (pendingSeek > 0) {
    const t = pendingSeek;
    pendingSeek = 0;
    return t;
  }
  pendingSeek = 0;
  const hist = getHistory();
  const histEntry = findHistoryEntryForTrack(hist, tr, state.epIdx);
  if (histEntry && histEntry.time > 5 && (!histEntry.duration || histEntry.time < histEntry.duration - 5)) {
    return histEntry.time;
  }
  return 0;
}

/** 异步延迟加载点赞计数，不阻塞播放 */
function _loadAppreciateCountAsync(seriesId) {
  const loadCount = () => {
    getAppreciateCount(seriesId).then(data => {
      if (data && data.total != null) updateAppreciateBtn(seriesId, data.total);
    });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadCount, { timeout: 2000 });
  } else {
    setTimeout(loadCount, 500);
  }
}

function playCurrent() {
  const dom = getDOM();
  if (state.epIdx < 0 || state.epIdx >= state.playlist.length) return;
  finishRecovery();

  // A new track is starting — clear any pending play lock from a previous togglePlay() call
  _playPending = false;
  // Any track switch (next/prev/direct click) counts as a fresh play intent.
  // Reset _userPaused so stall recovery auto-resumes on the new track.
  _userPaused = false;

  // ✅ 修复Blob URL竞态：延迟释放旧Blob URL，等新音源确认后再释放
  // 如果立即释放而新缓存获取失败，会导致播放中途静音
  const oldBlobUrl = dom.audio._cachedBlobUrl;
  dom.audio._cachedBlobUrl = null;
  function revokeOldBlob() {
    if (oldBlobUrl) URL.revokeObjectURL(oldBlobUrl);
  }

  isSwitching = true;
  audioRetries = 0;
  stallRetries = 0;
  clearStallWatch();
  clearErrorState();
  cleanupPlaybackPreparations();
  const tr = state.playlist[state.epIdx];
  const trackForPolicy = getTrackWithCachedAudioMeta(tr);
  const policy = getPlaybackPolicy({ track: trackForPolicy });
  const callId = ++_playCurrentId; // unique ID for this invocation

  // Remove any stale listeners from previous rapid switches
  cleanupReadyListeners(dom);

  dom.audio.pause();
  // ✅ iOS 修复：完全重置音频元素，清除可能损坏的音频会话
  // 当 iOS 音频会话被中断（来电/通知/系统声音）后进入幽灵状态,
  // 仅设置新 src 不足以恢复，必须先 removeAttribute('src') 强制重置
  dom.audio.removeAttribute('src');
  dom.audio.load();

  // ✅ Fix 3: Compute seek time — pendingSeek > history resume > 0
  let seekTime = _computeSeekTime(tr);

  // ✅ 优化：添加超时保护，防止isSwitching卡住
  const switchTimeout = policy.switchTimeoutMs;
  clearSwitchingTimeout();
  _switchingTimeoutId = setTimeout(() => {
    _switchingTimeoutId = null;
    if (isSwitching && callId === _playCurrentId) {
      console.warn('[Player] isSwitching timeout, auto-reset');
      cleanupReadyListeners(dom); // ✅ 修复：超时时也必须清理孤儿监听器，否则后续事件触发过期回调
      isSwitching = false;
      setBuffering(false);
      renderPlaylistItems(); // Remove loading indicator from playlist item
    }
  }, switchTimeout);

  function tryPlay() {
    if (callId !== _playCurrentId) {
      setBuffering(false);
      return; // stale callback from previous switch
    }
    setBuffering(false);
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    dom.audio.play().then(() => {
      if (callId !== _playCurrentId) return; // ✅ Fix 5: guard stale resolution
      clearSwitchingTimeout();
      isSwitching = false;
      // ✅ 修复Android：不在play()解析时设置播放状态，等待playing事件确认音频实际输出
      renderPlaylistItems(); // Remove loading indicator from playlist item
      startStallWatch();
      if (_networkWeak) setNetworkWeak(false);
      scheduleCurrentTrackLoading(tr);
      maybeRecordPlayCount(tr, callId);
    }).catch(err => {
      clearSwitchingTimeout();
      isSwitching = false;
      setBuffering(false);
      if (callId === _playCurrentId && err.name !== 'AbortError') {
        setPlayState(false);
        renderPlaylistItems(); // Remove loading indicator from playlist item
      }
    });
  }

  // ✅ Fix 1+4: doLoad sets src after cache check; all async paths guarded by callId
  function doLoad(srcUrl) {
    if (callId !== _playCurrentId) return;
    dom.audio.src = srcUrl;
    dom.audio.playbackRate = SPEEDS[speedIdx];
    dom.audio.load();
    setBuffering(true);
    if (dom.audio.readyState >= 2) {
      tryPlay();
    } else {
      if (seekTime > 0) dom.audio.currentTime = seekTime;
      dom.audio.play().then(() => {
        if (callId !== _playCurrentId) return; // ✅ Fix 5
        clearSwitchingTimeout();
        isSwitching = false;
        // ✅ 修复Android：不在play()解析时清除缓冲/设置播放状态
        // playing事件会在音频实际输出时触发setPlayState和hideBufferingUI
        startStallWatch();
        if (_networkWeak) setNetworkWeak(false);
        scheduleCurrentTrackLoading(tr);
        maybeRecordPlayCount(tr, callId);
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

        // #18: Hard timeout at 20s — give up if still not ready
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
              renderPlaylistItems(); // Remove loading indicator from playlist item
            }
          }
        }, 20000);
      });
    }
  }

  // 在线时直接走原始音频地址；离线且已有缓存时才回退本地 Blob。
  if (navigator.onLine !== false || !isCachedSync(tr.url)) {
    revokeOldBlob(); // ✅ 直连路径：新源已确定，安全释放旧Blob
    doLoad(tr.url);
  } else {
    getCachedAudioUrl(tr.url).then(cachedUrl => {
      if (callId !== _playCurrentId) {
        if (cachedUrl) URL.revokeObjectURL(cachedUrl);
        revokeOldBlob(); // ✅ 过期回调也释放
        return;
      }
      revokeOldBlob(); // ✅ 新缓存源已确认，安全释放旧Blob
      if (cachedUrl) dom.audio._cachedBlobUrl = cachedUrl;
      doLoad(cachedUrl || tr.url);
    }).catch(() => {
      revokeOldBlob(); // ✅ 缓存失败回退直连，也释放旧Blob
      doLoad(tr.url);
    });
  }

  updateUI(tr);
  highlightEp();
  updateMediaSession(tr);
  updateAppreciateBtn(tr.seriesId); // Reset badge first (no count yet)
  _loadAppreciateCountAsync(tr.seriesId);

  renderPlaylistItems();
  addHistory(tr, dom.audio);
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
  dom.miniProgressFill.style.transform = 'scaleX(0)';
  dom.expProgressFill.style.transform = 'scaleX(0)';
  dom.expProgressThumb.style.left = '0%';
  dom.expBufferFill.style.transform = 'scaleX(0)';
  dom.expTimeCurr.textContent = '0:00';
  dom.expTimeTotal.textContent = '0:00';
  if (dom.centerRingFill) dom.centerRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

/* ===== Appreciate State (per-series, persisted in unified store) ===== */

function getAppreciatedSet() {
  try {
    const arr = get('appreciated');
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}

function saveAppreciated(seriesId) {
  try {
    const s = getAppreciatedSet();
    s.add(seriesId);
    set('appreciated', [...s]);
  } catch (e) { console.warn('[Player] saveAppreciated failed:', e); }
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
  // Set icon based on store state
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
  if (dom.centerPlayIcon) dom.centerPlayIcon.innerHTML = playing ? CENTER_PLAY_INNER.pause : CENTER_PLAY_INNER.play;
  if (dom.centerPlayBtn) {
    dom.centerPlayBtn.classList.toggle('playing', playing);
    // Remove dim state once audio is loaded
    dom.centerPlayBtn.classList.remove('no-audio');
  }
  // Update accessible labels
  const label = playing ? 'Pause' : 'Play';
  if (dom.centerPlayBtn) dom.centerPlayBtn.setAttribute('aria-label', label);
  dom.expPlay.setAttribute('aria-label', label);
  dom.btnPlay.setAttribute('aria-label', label);
}

export function highlightEp() {
  // 懒加载列表中可能存在哨兵节点，不能再把 DOM 子节点顺序当作业务索引。
  const ul = document.querySelector('.ep-view .ep-list');
  if (!ul) return;
  ul.querySelectorAll('.ep-item.playing').forEach((el) => el.classList.remove('playing'));

  if (state.epIdx < 0 || !state.playlist.length) return;
  const current = state.playlist[state.epIdx];
  if (!current || current.seriesId !== state.seriesId) return;

  const activeEl = ul.querySelector(`.ep-item[data-idx="${state.epIdx}"]`);
  if (activeEl) {
    activeEl.classList.add('playing');
  }
}

export function isCurrentTrack(sid, idx) {
  if (state.epIdx < 0 || !state.playlist.length) return false;
  const dom = getDOM();
  if (dom && dom.audio && dom.audio.ended) return false;
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

    // iPhone WeChat 有时已经恢复播放，但 waiting/playing 事件序列不完整，
    // buffering class 会残留在按钮上。只要时间在推进，就以真实播放状态为准清掉转圈。
    if (!dom.audio.paused && !dom.audio.ended && !dom.audio.seeking && dom.audio.currentTime > 0) {
      setBuffering(false);
    }

    const dur = dom.audio.duration;
    if (!dur || !isFinite(dur)) return;
    const ct = dom.audio.currentTime;

    if (isAppleMobile() && !_isRecovering) {
      if (!dom.audio.paused && !dom.audio.ended && !dom.audio.seeking && document.visibilityState === 'visible') {
        const playedEnd = getLastPlayedEnd(dom.audio);
        const playedAdvanced = playedEnd > _ghostPlaybackLastPlayedEnd + 0.35;
        const thresholds = getGhostPlaybackThresholds();
        const playedLag = ct - playedEnd;

        if (playedAdvanced || ct < 5 || playedLag < thresholds.lagSeconds) {
          _ghostPlaybackDriftSince = 0;
        } else {
          if (!_ghostPlaybackDriftSince) {
            _ghostPlaybackDriftSince = performance.now();
          } else if (performance.now() - _ghostPlaybackDriftSince >= thresholds.recoveryDelayMs) {
            clearStallWatch();
            onGhostPlaybackDetected(playedEnd > 0 ? playedEnd : Math.max(0, ct - 1));
            return;
          }
        }

        _ghostPlaybackLastPlayedEnd = Math.max(_ghostPlaybackLastPlayedEnd, playedEnd);
      } else {
        resetGhostPlaybackTracking();
      }
    }

    const p = Math.min(100, (ct / dur) * 100);

    // 批量更新DOM，减少重排/重绘
    dom.miniProgressFill.style.transform = `scaleX(${p / 100})`;
    dom.expProgressFill.style.transform = `scaleX(${p / 100})`;
    dom.expProgressThumb.style.left = p + '%';
    dom.expTimeCurr.textContent = fmt(ct);
    dom.expTimeTotal.textContent = fmt(dur);
    const offset = RING_CIRCUMFERENCE * (1 - ct / dur);
    if (dom.centerRingFill) dom.centerRingFill.style.strokeDashoffset = offset;

    if (dom.audio.buffered.length > 0) {
      const bufEnd = dom.audio.buffered.end(dom.audio.buffered.length - 1);
      dom.expBufferFill.style.transform = `scaleX(${Math.min(1, bufEnd / dur)})`;
    }


  });
}

export function onEnded() {
  clearStallWatch();
  const dom = getDOM();
  if (!dom?.audio || !state.playlist.length) {
    setPlayState(false);
    return;
  }

  if (state.loopMode === 'one') {
    _userPaused = false;
    dom.audio.currentTime = 0;
    setPlayState(true);
    const replay = dom.audio.play();
    if (replay && typeof replay.then === 'function') {
      replay.then(() => {
        startStallWatch();
      }).catch((err) => {
        if (err?.name !== 'AbortError') setPlayState(false);
      });
    } else {
      startStallWatch();
    }
    return;
  }

  if (state.loopMode === 'shuffle') {
    if (state.playlist.length > 1) {
      let nextIdx = state.epIdx;
      while (nextIdx === state.epIdx) nextIdx = Math.floor(Math.random() * state.playlist.length);
      state.epIdx = nextIdx;
    }
    playCurrent();
    return;
  }

  if (state.epIdx < state.playlist.length - 1) {
    state.epIdx++;
    playCurrent();
    return;
  }

  if (state.loopMode === 'all') {
    state.epIdx = 0;
    playCurrent();
    return;
  }

  setPlayState(false);
}

export function onAudioError() {
  clearStallWatch();
  const dom = getDOM();
  if (!dom.audio.error || dom.audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
  if (dom.audio.paused && !_playPending) return;
  // ✅ 修复：错误发生时也清理切换超时和就绪监听器，防止延迟触发覆盖错误状态
  clearSwitchingTimeout();
  cleanupReadyListeners(dom);
  isSwitching = false;
  setBuffering(false);

  const errCode = dom.audio.error.code;
  const src = dom.audio.src;

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

// Guard flag: prevents a second play() call from racing while the first is still pending.
// See `_playPending` declaration near the top of this file (Playback State section).

export function togglePlay() {
  const dom = getDOM();
  if (dom.audio.paused && dom.audio.src) {
    if (_playPending) return; // play() already in-flight, ignore duplicate tap
    if (_isInAppBrowser && shouldForceGhostRecovery(dom.audio)) {
      retryPlayback();
      return;
    }
    _playPending = true;
    _userPaused = false; // User explicitly wants to play
    // If audio reached the end, restart from the beginning
    if (dom.audio.ended) dom.audio.currentTime = 0;
    // 弱网 / iPhone 恢复播放时，先给出明确缓冲反馈，避免 UI 先进入“已播放”但实际还没出声。
    setBuffering(true);
    dom.audio.play().then(() => {
      startStallWatch();
      const currentTrack = state.playlist[state.epIdx];
      if (currentTrack) scheduleCurrentTrackLoading(currentTrack);
    }).catch((err) => {
      // AbortError means pause() was called before play() resolved — UI already handled
      if (err.name !== 'AbortError') {
        setBuffering(false);
        setPlayState(false);
      }
    }).finally(() => {
      _playPending = false;
    });
  } else {
    // If switching tracks, cancel the switch cleanly
    if (isSwitching) {
      cancelPendingTrackLoad();
    }
    _userPaused = true; // User explicitly paused — block all auto-resume paths
    cleanupPlaybackPreparations();
    dom.audio.pause();
    clearStallWatch();
    setPlayState(false);
  }
}

/** 打开念佛计数器时暂停播放并同步 UI，避免与计数专注冲突 */
export function pausePlaybackForCounter() {
  const dom = getDOM();
  if (!dom.audio.src) return;
  if (isSwitching) cancelPendingTrackLoad();
  _userPaused = true;
  cleanupPlaybackPreparations();
  dom.audio.pause();
  clearStallWatch();
  setPlayState(false);
}

let _skipDebounce = 0;
const SKIP_DEBOUNCE_MS = 80;

function schedulePlayCurrent() {
  cancelPendingTrackLoad();
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
  saveState();
}

/* ===== Share ===== */
export function shareTrack(ep, series) {
  const title = '\u300A' + (series.title || '') + '\u300B' + (ep.title || ep.fileName);
  const url = window.location.origin + '/share/' + encodeURIComponent(series.id) + '/' + ep.id;
  shareContent(title, url);
}

export function shareSeries(series) {
  const epCount = series.totalEpisodes || series.episodes?.length || 0;
  const unit = t('episodes') || '\u96C6';
  const title = '\u300A' + (series.title || '') + '\u300B' + (epCount ? '\u5171' + epCount + unit : '');
  const url = window.location.origin + '/share/' + encodeURIComponent(series.id);
  shareContent(title, url);
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
        _userPaused = true; // ✅ 修复：睡眠定时器暂停也视为用户意图，阻止自动恢复
        dom.audio.pause(); timerIdx = 0;
        clearStallWatch(); // ✅ 修复：暂停后停止卡顿检测
        // #6: Explicitly update play state UI so button reflects paused state
        setPlayState(false);
        btn.classList.remove('active');
        const bd = btn.querySelector('.timer-badge');
        if (bd) bd.remove();
      }
    }, 1000);
  }
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
  if (!url || bgFetchUrl === url) return;
  isAudioCached(url).then(cached => {
    if (cached || state.playlist[state.epIdx]?.url !== url) return;
    _doBgFullLoad(url);
  }).catch(() => {
    if (state.playlist[state.epIdx]?.url === url) _doBgFullLoad(url);
  });
}

function _doBgFullLoad(url) {
  if (bgFetchUrl === url) return;
  cleanupBgFetch();

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
      // ✅ Fix 2: Only cache for offline playback — do NOT swap dom.audio.src during playback
      const currentTrack = state.playlist[state.epIdx];
      if (!currentTrack || currentTrack.url !== bgFetchUrl) {
        bgFetchController = null;
        bgFetchUrl = '';
        return;
      }
      cacheAudio(url, blob).catch(() => { });
      console.log('[BgLoad] Cached audio for offline playback');
      bgFetchController = null;
      bgFetchUrl = '';
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
  // ✅ 修复：回到前台时立即清除旧 stallTimer，防止积压的 interval 回调
  // 在 visibilityState 变为 'visible' 后误判为卡顿（移动端后台节流会导致 currentTime 不推进）
  clearStallWatch();
  _ghostSuspectCount = 0; // ✅ 重置幽灵检测计数

  const dom = getDOM();
  if (!dom.audio.src || dom.audio.ended) {
    setBuffering(false);
    return;
  }
  if (document.body.hasAttribute('data-counter-active')) return;

  reconcilePlaybackUiAfterForeground();

  if (dom.audio.paused) return;

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

  // If less than 5s buffered ahead, keep buffering UI visible and let the
  // browser continue the stream naturally instead of forcing a same-position seek.
  if (bufAhead < 5) {
    console.log('[Player] Low buffer on resume (' + bufAhead.toFixed(1) + 's), waiting for stream recovery');
    setBuffering(true);
    startStallWatch();
    return;
  }

  setBuffering(false);
  startStallWatch();
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
  setExpandedViewportLock(true);
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
  setExpandedViewportLock(false);
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
  const frag = document.createDocumentFragment();
  items.forEach((tr, displayIdx) => {
    const realIdx = plSortAsc ? displayIdx : state.playlist.length - 1 - displayIdx;
    const isCurrent = realIdx === state.epIdx;
    // Show loading spinner on the current item while audio is being loaded
    const isLoading = isCurrent && isSwitching;
    const div = document.createElement('div');
    div.className = 'pl-item' + (isCurrent ? ' current' : '') + (isLoading ? ' loading' : '');

    // Build meta info (duration + progress)
    let metaHTML = '';
    if (tr.duration) {
      metaHTML += `<span class="pl-item-duration">${fmt(tr.duration)}</span>`;
    }
    // Show progress from history if available
    const hEntry = findHistoryEntryForTrack(hist, tr, realIdx);
    if (hEntry && hEntry.duration > 0) {
      const pct = Math.round(hEntry.time / hEntry.duration * 100);
      if (pct > 0 && pct < 100) metaHTML += `<span class="pl-item-progress">${t('pl_played')}${pct}%</span>`;
    }

    // Loading spinner (visible only when .loading class is present)
    const loadingSpinner = isLoading
      ? '<span class="pl-item-loading-spinner"></span>'
      : '';
    div.innerHTML = `<span class="pl-item-num">${realIdx + 1}</span><div class="pl-item-body"><div class="pl-item-title">${escapeHtml(tr.title || tr.fileName)}</div>${metaHTML ? '<div class="pl-item-meta">' + metaHTML + '</div>' : ''}</div>${loadingSpinner}`;
    div.addEventListener('click', () => { haptic(); state.epIdx = realIdx; playCurrent(); });
    frag.appendChild(div);
  });
  dom.plItems.appendChild(frag);

  // Async: mark cached episodes with a small badge (non-blocking).
  // Guard against stale callbacks if the list is re-rendered before the async check completes.
  const renderGen = dom.plItems.dataset.renderGen = String(Date.now());
  items.forEach((tr, displayIdx) => {
    isAudioCached(tr.url).then(cached => {
      if (!cached) return;
      // Bail if the list was re-rendered since this check started
      if (dom.plItems.dataset.renderGen !== renderGen) return;
      const el = dom.plItems.children[displayIdx];
      // Verify the element still corresponds to the expected track
      if (el && el.querySelector('.pl-item-title')?.textContent === (tr.title || tr.fileName)) {
        el.classList.add('pl-item-cached');
      }
    });
  });
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
    div.innerHTML = `<span class="pl-item-num">\u25B6</span><div class="pl-item-body"><div class="pl-item-title">${escapeHtml(h.epTitle)}</div><div class="pl-hist-sub">${escapeHtml(h.seriesTitle)}${h.speaker ? ' \u00B7 ' + escapeHtml(h.speaker) : ''}</div>${metaHTML ? '<div class="pl-item-meta">' + metaHTML + '</div>' : ''}</div>`;
    div.addEventListener('click', async () => {
      haptic();
      if (!state.isDataFull && state.ensureFullData) {
        await state.ensureFullData({ rerenderHome: false });
      }
      const target = resolveHistoryTarget(h);
      if (!target) return;
      playList(target.series.episodes, target.epIdx, target.series, h.time);
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
    // Route media-key play/pause through the same state management as the UI buttons,
    // so _userPaused is correctly maintained when the user operates lock-screen controls.
    navigator.mediaSession.setActionHandler('play', () => {
      // If the chanting counter is open and audio is paused, block system-initiated
      // play events (wake-lock resume, Bluetooth auto-play, OS audio-session restart)
      // that would override the user's deliberate pause mid-session.
      // The user can still explicitly resume via our UI play button (which calls
      // togglePlay() directly and bypasses this guard).
      if (document.body.hasAttribute('data-counter-active') && dom.audio.paused) return;
      if (dom.audio.paused && dom.audio.src) togglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      _userPaused = true;
      dom.audio.pause(); clearStallWatch(); setPlayState(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('seekbackward', () => { if (dom.audio.duration) dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { if (dom.audio.duration) dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 10); });
    navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime != null) dom.audio.currentTime = d.seekTime; });
  } catch (e) { console.warn('[Player] MediaSession setup failed:', e); }
}

/* ===== Persistence ===== */
export function saveState() {
  const dom = getDOM();
  try {
    const tr = state.playlist[state.epIdx];
    if (!tr) return;
    patch('player', {
      seriesId: tr.seriesId,
      epIdx: state.epIdx,
      time: dom.audio.currentTime,
      speed: SPEEDS[speedIdx],
      loop: state.loopMode,
    });
    syncHistoryProgress(dom.audio);
  } catch (e) { console.warn('[Player] saveState failed:', e); }
}

export function restoreState() {
  const dom = getDOM();
  try {
    const s = get('player');
    if (!s || !s.seriesId) return;
    for (const cat of state.data.categories) {
      const sr = cat.series.find(x => x.id === s.seriesId);
      if (sr) {
        state.playlist = buildPlaylistEntries(sr.episodes, sr);
        state.epIdx = s.epIdx || 0;
        const tr = state.playlist[state.epIdx];
        if (tr) {
          updateUI(tr);
          const savedTime = s.time;
          // ✅ 修复：先检查缓存再设置 src，避免双重 loadedmetadata 监听 + 浪费网络请求
          // Cache API 是本地读取，延迟极低，不影响恢复速度
          getCachedAudioUrl(tr.url).then(cachedUrl => {
            const srcUrl = cachedUrl || tr.url;
            if (cachedUrl) dom.audio._cachedBlobUrl = cachedUrl;
            dom.audio.src = srcUrl;
            if (savedTime) dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = savedTime; }, { once: true });
          }).catch(() => {
            dom.audio.src = tr.url;
            if (savedTime) dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = savedTime; }, { once: true });
          });
        }
        if (s.loop) {
          state.loopMode = (s.loop === 'none') ? 'all' : s.loop;
          applyLoopUI();
        }
        if (s.speed && s.speed !== 1) {
          const si = SPEEDS.indexOf(s.speed);
          if (si >= 0) { speedIdx = si; dom.audio.playbackRate = s.speed; document.getElementById('expSpeed').textContent = s.speed + 'x'; document.getElementById('expSpeed').classList.add('active'); }
        }
        state.isFirstVisit = false;
        break;
      }
    }
  } catch (e) { console.warn('[Player] restoreState failed:', e); }
}
