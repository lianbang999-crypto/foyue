/**
 * player.js — Playback core logic
 * Depends on: state.js, i18n.js, history.js
 */
(function(){
'use strict';

var App = window.App;

/* ===== Preload ===== */
var preloadAudio = null, preloadedUrl = '';

function getNextTrackIdx() {
  if (!App.playlist.length) return -1;
  if (App.loopMode === 'shuffle') return -1;
  if (App.epIdx < App.playlist.length - 1) return App.epIdx + 1;
  if (App.loopMode === 'all') return 0;
  return -1;
}

function preloadNextTrack() {
  var ni = getNextTrackIdx();
  if (ni < 0) { cleanupPreload(); return; }
  var nurl = App.playlist[ni] && App.playlist[ni].url;
  if (!nurl || nurl === preloadedUrl) return;
  var conn = navigator.connection || navigator.mozConnection;
  if (conn && (conn.saveData || conn.effectiveType === '2g')) return;
  cleanupPreload();
  preloadAudio = new Audio();
  preloadAudio.preload = 'metadata';
  preloadAudio.src = nurl;
  preloadedUrl = nurl;
}

function cleanupPreload() {
  if (preloadAudio) { preloadAudio.src = ''; preloadAudio.load(); preloadAudio = null; }
  preloadedUrl = '';
}

/* ===== Core playback ===== */
function playList(episodes, idx, series, restoreTime) {
  cleanupPreload();
  var sameSeries = App.playlist.length && App.epIdx >= 0 && App.playlist[App.epIdx] && App.playlist[App.epIdx].seriesId === series.id;
  if (!sameSeries) {
    App.playlist = episodes.map(function(ep) {
      return Object.assign({}, ep, { seriesId: series.id, seriesTitle: series.title, speaker: series.speaker });
    });
  }
  App.epIdx = idx;
  App.pendingSeek = restoreTime || 0;
  playCurrent();
}

function playCurrent() {
  if (App.epIdx < 0 || App.epIdx >= App.playlist.length) return;
  App.isSwitching = true;
  App.audioRetries = 0;
  var tr = App.playlist[App.epIdx];
  var targetUrl = tr.url;
  App.audio.pause();
  App.audio.src = targetUrl;
  App.audio.playbackRate = App.SPEEDS[App.speedIdx];
  // Show loading state
  App.playerTrack.classList.add('buffering');
  App.centerPlayBtn.classList.add('buffering');
  var seekTime = App.pendingSeek > 0 ? App.pendingSeek : 0;
  App.pendingSeek = 0;
  // Wait for canplay
  App.audio.addEventListener('canplay', function onReady() {
    App.audio.removeEventListener('canplay', onReady);
    if (App.audio.src !== targetUrl && !App.audio.src.endsWith(encodeURI(targetUrl.split('/').pop()))) return;
    if (seekTime > 0) App.audio.currentTime = seekTime;
    App.audio.play().catch(function() { App.isSwitching = false; setPlayState(false); });
  });
  updateUI(tr);
  highlightEp();
  App.updateMediaSession(tr);
  renderPlaylistItems();
  App.addHistory(tr);
}

function updateUI(tr) {
  var title = tr.title || tr.fileName;
  App.playerTrack.textContent = title;
  var epNum = App.epIdx >= 0 ? ' \u00B7 ' + (App.epIdx + 1) + '/' + App.playlist.length : '';
  App.playerSub.textContent = (tr.seriesTitle || '') + epNum;
  App.expTitle.textContent = title;
  App.expSeries.textContent = (tr.seriesTitle || '') + (tr.speaker ? ' \u00B7 ' + tr.speaker : '');
  App.expSeriesName.textContent = tr.seriesTitle || '';
  App.expSeriesSpeaker.textContent = tr.speaker || '';
  var epNumExp = App.epIdx >= 0 ? (App.epIdx + 1) + ' / ' + App.playlist.length : '';
  App.expSeriesEpCount.textContent = epNumExp;
  // Reset progress UI
  App.miniProgressFill.style.width = '0%';
  App.expProgressFill.style.width = '0%';
  App.expProgressThumb.style.left = '0%';
  App.expBufferFill.style.width = '0%';
  App.expTimeCurr.textContent = '0:00';
  App.expTimeTotal.textContent = '0:00';
  App.centerRingFill.style.strokeDashoffset = App.RING_CIRCUMFERENCE;
}

function setPlayState(playing) {
  var icon = playing ? App.SVG.pause : App.SVG.play;
  App.btnPlay.innerHTML = icon;
  App.expPlay.innerHTML = icon;
  App.centerPlayIcon.innerHTML = playing ?
    '<rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/>' :
    '<polygon points="8,4 20,12 8,20"/>';
  App.centerPlayBtn.classList.toggle('playing', playing);
}

function highlightEp() {
  document.querySelectorAll('.ep-item').forEach(function(el, i) {
    el.classList.toggle('playing', isCurrentTrack(App.seriesId, i));
  });
}

function isCurrentTrack(sid, idx) {
  if (App.epIdx < 0 || !App.playlist.length) return false;
  var c = App.playlist[App.epIdx];
  return c && c.seriesId === sid && idx === App.epIdx;
}

function onTimeUpdate() {
  var dur = App.audio.duration;
  if (!dur || !isFinite(dur)) return;
  var ct = App.audio.currentTime;
  var p = Math.min(100, (ct / dur) * 100);
  App.miniProgressFill.style.width = p + '%';
  App.expProgressFill.style.width = p + '%';
  App.expProgressThumb.style.left = p + '%';
  App.expTimeCurr.textContent = App.fmt(ct);
  App.expTimeTotal.textContent = App.fmt(dur);
  var offset = App.RING_CIRCUMFERENCE * (1 - ct / dur);
  App.centerRingFill.style.strokeDashoffset = offset;
  if (App.audio.buffered.length > 0) {
    var bufEnd = App.audio.buffered.end(App.audio.buffered.length - 1);
    App.expBufferFill.style.width = Math.min(100, (bufEnd / dur) * 100) + '%';
  }
}

function onEnded() {
  if (App.loopMode === 'one') { App.audio.currentTime = 0; App.audio.play(); }
  else if (App.loopMode === 'shuffle') { App.epIdx = Math.floor(Math.random() * App.playlist.length); playCurrent(); }
  else if (App.epIdx < App.playlist.length - 1) { App.epIdx++; playCurrent(); }
  else if (App.loopMode === 'all') { App.epIdx = 0; playCurrent(); }
}

function onAudioError() {
  if (!App.audio.error || App.audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
  App.isSwitching = false;
  App.playerTrack.classList.remove('buffering');
  App.centerPlayBtn.classList.remove('buffering');
  if (App.audio.src && App.audioRetries < 2) {
    App.audioRetries++;
    var src = App.audio.src;
    setTimeout(function() {
      if (App.audio.src === src) { App.audio.load(); App.audio.play().catch(function() {}); }
    }, 1500 * App.audioRetries);
  } else {
    setPlayState(false);
  }
}

function togglePlay() {
  if (App.audio.paused && App.audio.src) App.audio.play().catch(function() {});
  else App.audio.pause();
}

function prevTrack() {
  if (App.audio.currentTime > 3) { App.audio.currentTime = 0; return; }
  if (App.epIdx > 0) { App.epIdx--; playCurrent(); }
}

function nextTrack() {
  if (App.loopMode === 'shuffle') App.epIdx = Math.floor(Math.random() * App.playlist.length);
  else if (App.epIdx < App.playlist.length - 1) App.epIdx++;
  else if (App.loopMode === 'all') App.epIdx = 0;
  else return;
  playCurrent();
}

/* ===== Loop control ===== */
function applyLoopUI() {
  var btn = App.$('expLoop');
  if (App.loopMode === 'one') {
    btn.innerHTML = App.SVG.loopOne;
    btn.classList.add('active');
    btn.title = App.t('loop_one') || 'Single loop';
  } else if (App.loopMode === 'shuffle') {
    btn.innerHTML = App.SVG.shuffle;
    btn.classList.add('active');
    btn.title = App.t('loop_shuffle') || 'Shuffle';
  } else {
    App.loopMode = 'all';
    btn.innerHTML = App.SVG.loopAll;
    btn.classList.add('active');
    btn.title = App.t('loop_all') || 'Loop all';
  }
}

function cycleLoop() {
  var modes = ['all', 'one', 'shuffle'];
  var i = (modes.indexOf(App.loopMode) + 1) % modes.length;
  App.loopMode = modes[i];
  applyLoopUI();
}

/* ===== Share ===== */
function shareTrack(ep, series) {
  series = series || {};
  var seriesId = series.id || series.seriesId || ep.seriesId || '';
  var seriesTitle = series.title || series.seriesTitle || ep.seriesTitle || '';
  var title = (ep.title || ep.fileName) + (seriesTitle ? ' - ' + seriesTitle : '');
  var text = title + '\n' + App.t('share_from');
  var baseUrl = window.location.origin + window.location.pathname;
  var url = (seriesId && ep.id) ? (baseUrl + '#' + encodeURIComponent(seriesId + '/' + ep.id)) : baseUrl;
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function() {});
  } else {
    navigator.clipboard.writeText(text + '\n' + url).then(function() {
      App.showToast(App.t('link_copied'));
    }).catch(function() {});
  }
}

/* ===== Playlist panel ===== */
function togglePlaylist() {
  App.playlistVisible = !App.playlistVisible;
  App.playlistPanel.classList.toggle('show', App.playlistVisible);
  App.expPlayerContent.classList.toggle('hide', App.playlistVisible);
  App.expQueue.classList.toggle('active', App.playlistVisible);
  if (App.playlistVisible) renderPlaylistItems();
}

function renderPlaylistItems() {
  if (!App.playlistVisible) return;
  App.plCount.textContent = App.playlist.length + ' ' + App.t(App.tab === 'fohao' ? 'tracks' : 'episodes');
  App.plItems.innerHTML = '';
  App.playlist.forEach(function(tr, i) {
    var div = document.createElement('div');
    div.className = 'pl-item' + (i === App.epIdx ? ' current' : '');
    div.innerHTML = '<span class="pl-item-num">' + (i + 1) + '</span><span class="pl-item-title">' + (tr.title || tr.fileName) + '</span>';
    div.addEventListener('click', function() { App.epIdx = i; playCurrent(); });
    App.plItems.appendChild(div);
  });
  var cur = App.plItems.querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ===== Seek ===== */
function seekAt(e, el) {
  var r = el.getBoundingClientRect();
  var p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (App.audio.duration && isFinite(App.audio.duration)) App.audio.currentTime = p * App.audio.duration;
}

/* ===== Speed control ===== */
function cycleSpeed() {
  App.speedIdx = (App.speedIdx + 1) % App.SPEEDS.length;
  var s = App.SPEEDS[App.speedIdx];
  App.audio.playbackRate = s;
  App.$('expSpeed').textContent = s === 1 ? '1.0x' : s + 'x';
  App.$('expSpeed').classList.toggle('active', s !== 1);
}

/* ===== Sleep timer ===== */
var TIMER_OPTS = [0, 30, 60, 120, 180];
var timerIdx = 0;
var sleepTimerId = null;
var sleepRemaining = 0;

function cycleSleepTimer() {
  timerIdx = (timerIdx + 1) % TIMER_OPTS.length;
  var mins = TIMER_OPTS[timerIdx];
  if (sleepTimerId) { clearInterval(sleepTimerId); sleepTimerId = null; }
  var btn = App.$('expTimer');
  var oldBadge = btn.querySelector('.timer-badge');
  if (oldBadge) oldBadge.remove();
  if (mins === 0) {
    sleepRemaining = 0;
    btn.classList.remove('active');
    App.showToast(App.t('timer_off'));
  } else {
    sleepRemaining = mins * 60;
    btn.classList.add('active');
    var badge = document.createElement('span');
    badge.className = 'timer-badge';
    badge.textContent = mins;
    btn.appendChild(badge);
    App.showToast(App.t('timer_set') + mins + App.t('timer_min'));
    sleepTimerId = setInterval(function() {
      sleepRemaining--;
      var remaining = Math.ceil(sleepRemaining / 60);
      var b = btn.querySelector('.timer-badge');
      if (b) b.textContent = remaining;
      if (sleepRemaining <= 0) {
        clearInterval(sleepTimerId); sleepTimerId = null;
        App.audio.pause(); timerIdx = 0;
        btn.classList.remove('active');
        var bd = btn.querySelector('.timer-badge');
        if (bd) bd.remove();
      }
    }, 1000);
  }
}

// Expose on App
App.playList = playList;
App.playCurrent = playCurrent;
App.updateUI = updateUI;
App.setPlayState = setPlayState;
App.highlightEp = highlightEp;
App.isCurrentTrack = isCurrentTrack;
App.onTimeUpdate = onTimeUpdate;
App.onEnded = onEnded;
App.onAudioError = onAudioError;
App.togglePlay = togglePlay;
App.prevTrack = prevTrack;
App.nextTrack = nextTrack;
App.applyLoopUI = applyLoopUI;
App.cycleLoop = cycleLoop;
App.shareTrack = shareTrack;
App.togglePlaylist = togglePlaylist;
App.renderPlaylistItems = renderPlaylistItems;
App.seekAt = seekAt;
App.cycleSpeed = cycleSpeed;
App.cycleSleepTimer = cycleSleepTimer;
App.preloadNextTrack = preloadNextTrack;
App.cleanupPreload = cleanupPreload;

})();
