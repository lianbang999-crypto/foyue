/* ===== Utility Functions ===== */

export function fmt(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

export function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'position:fixed;bottom:calc(64px + var(--safe-bottom) + 16px);left:50%;transform:translateX(-50%);background:var(--text);color:var(--text-inverse);padding:8px 20px;border-radius:20px;font-size:.78rem;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;font-family:var(--font-zh)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

export function seekAt(e, el, audio) {
  const r = el.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (audio.duration && isFinite(audio.duration)) audio.currentTime = p * audio.duration;
}
