/* ===== Utility Functions ===== */

export function fmt(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

let toastTimer;
export function showToast(msg) {
  clearTimeout(toastTimer);
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'position:fixed;bottom:calc(64px + var(--safe-bottom) + 16px);left:50%;transform:translateX(-50%);background:var(--text);color:var(--text-inverse);padding:8px 20px;border-radius:20px;font-size:.78rem;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;font-family:var(--font-zh)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

/* Calculate seek percentage from pointer event */
export function seekCalc(e, el) {
  const r = el.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
}

/* Update only the visual UI during drag (no audio.currentTime write) */
export function seekUI(p, dom) {
  const pct = p * 100 + '%';
  dom.expProgressFill.style.width = pct;
  dom.expProgressThumb.style.left = pct;
  if (dom.audio.duration && isFinite(dom.audio.duration)) {
    dom.expTimeCurr.textContent = fmt(p * dom.audio.duration);
  }
}

/* Commit seek — actually set audio.currentTime (called once on pointer up) */
export function seekCommit(p, audio) {
  if (audio.duration && isFinite(audio.duration)) audio.currentTime = p * audio.duration;
}

/* Escape HTML to prevent XSS */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/* Legacy — kept for any other callers */
export function seekAt(e, el, audio) {
  const p = seekCalc(e, el);
  if (audio.duration && isFinite(audio.duration)) audio.currentTime = p * audio.duration;
}

/* Haptic feedback — light vibration for button taps (Android) */
export function haptic(ms = 10) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }
}
