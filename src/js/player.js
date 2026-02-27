/* ===== Audio Player Engine ===== */
import { state } from './state.js';
import { getDOM, RING_CIRCUMFERENCE } from './dom.js';
import { SVG, ICON_PLAY, ICON_PAUSE, ICON_PLAY_FILLED, ICON_PAUSE_FILLED } from './icons.js';
import { t } from './i18n.js';
import { fmt, showToast, seekAt } from './utils.js';
import { addHistory, syncHistoryProgress } from './history.js';

/* ===== Playback State ===== */
let pendingSeek = 0;
let isSwitching = false;
let audioRetries = 0;

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

export function playList(episodes, idx, series, restoreTime) {
  cleanupPreload();
  const sameSeries = state.playlist.length && state.epIdx >= 0 && state.playlist[state.epIdx] && state.playlist[state.epIdx].seriesId === series.id;
  if (!sameSeries) {
    state.playlist = episodes.map(ep => ({ ...ep, seriesId: series.id, seriesTitle: series.title, speaker: series.speaker }));
  }
  state.epIdx = idx;
  pendingSeek = restoreTime || 0;
  playCurrent();
}

function playCurrent() {
  const dom = getDOM();
  if (state.epIdx < 0 || state.epIdx >= state.playlist.length) return;
  isSwitching = true;
  audioRetries = 0;
  const tr = state.playlist[state.epIdx];
  const targetUrl = tr.url;
  dom.audio.pause();
  dom.audio.src = targetUrl;
  dom.audio.playbackRate = SPEEDS[speedIdx];
  // Show loading state immediately
  dom.playerTrack.classList.add('buffering');
  dom.centerPlayBtn.classList.add('buffering');
  const seekTime = pendingSeek > 0 ? pendingSeek : 0;
  pendingSeek = 0;
  // Wait for canplay before calling play()
  dom.audio.addEventListener('canplay', function onReady() {
    dom.audio.removeEventListener('canplay', onReady);
    if (dom.audio.src !== targetUrl && !dom.audio.src.endsWith(encodeURI(targetUrl.split('/').pop()))) return;
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    dom.audio.play().catch(() => { isSwitching = false; setPlayState(false); });
  });
  updateUI(tr);
  highlightEp();
  updateMediaSession(tr);
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
  dom.expSeries.textContent = `${tr.seriesTitle || ''}${tr.speaker ? ' \u00B7 ' + tr.speaker : ''}`;
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

export function setPlayState(playing) {
  const dom = getDOM();
  const icon = playing ? SVG.pause : SVG.play;
  dom.btnPlay.innerHTML = icon;
  dom.expPlay.innerHTML = icon;
  dom.centerPlayIcon.innerHTML = playing ?
    '<rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/>' :
    '<polygon points="8,4 20,12 8,20"/>';
  dom.centerPlayBtn.classList.toggle('playing', playing);
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
  dom.playerTrack.classList.remove('buffering');
  dom.centerPlayBtn.classList.remove('buffering');
  if (dom.audio.src && audioRetries < 2) {
    audioRetries++;
    const src = dom.audio.src;
    setTimeout(() => {
      if (dom.audio.src === src) { dom.audio.load(); dom.audio.play().catch(() => {}); }
    }, 1500 * audioRetries);
  } else {
    setPlayState(false);
  }
}

export function togglePlay() {
  const dom = getDOM();
  if (dom.audio.paused && dom.audio.src) dom.audio.play().catch(() => {});
  else dom.audio.pause();
}

export function prevTrack() {
  const dom = getDOM();
  if (dom.audio.currentTime > 3) { dom.audio.currentTime = 0; return; }
  if (state.epIdx > 0) { state.epIdx--; playCurrent(); }
}

export function nextTrack() {
  if (state.loopMode === 'shuffle') state.epIdx = Math.floor(Math.random() * state.playlist.length);
  else if (state.epIdx < state.playlist.length - 1) state.epIdx++;
  else if (state.loopMode === 'all') state.epIdx = 0;
  else return;
  playCurrent();
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
  const url = window.location.origin + window.location.pathname;
  if (navigator.share) {
    navigator.share({ title, text, url }).catch(() => {});
  } else {
    const full = url + '#' + encodeURIComponent(series.id + '/' + ep.id);
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
export function togglePlaylist() {
  const dom = getDOM();
  playlistVisible = !playlistVisible;
  dom.playlistPanel.classList.toggle('show', playlistVisible);
  dom.expPlayerContent.classList.toggle('hide', playlistVisible);
  dom.expQueue.classList.toggle('active', playlistVisible);
  if (playlistVisible) renderPlaylistItems();
}

export function renderPlaylistItems() {
  const dom = getDOM();
  if (!playlistVisible) return;
  dom.plCount.textContent = state.playlist.length + ' ' + t(state.tab === 'fohao' ? 'tracks' : 'episodes');
  dom.plItems.innerHTML = '';
  state.playlist.forEach((tr, i) => {
    const div = document.createElement('div');
    div.className = 'pl-item' + (i === state.epIdx ? ' current' : '');
    div.innerHTML = `<span class="pl-item-num">${i + 1}</span><span class="pl-item-title">${tr.title || tr.fileName}</span>`;
    div.addEventListener('click', () => { state.epIdx = i; playCurrent(); });
    dom.plItems.appendChild(div);
  });
  const cur = dom.plItems.querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
