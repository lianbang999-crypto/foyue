/* ===== Utility Functions ===== */

/**
 * 莲池大师回向文（固定，所有模块共用此常量，不得各自定义）
 * 以"同生极乐国"为一切功德的最终归宿。
 */
export const HUIXIANG_TEXT =
  '愿以此功德，庄严佛净土，\n上报四重恩，下济三途苦，\n若有见闻者，悉发菩提心，\n尽此一报身，同生极乐国。';

/**
 * 格式化声数为易读字符串
 * 10800 → "10,800" ｜ 12345 → "1.2万" ｜ 1e8 → "1亿"
 */
export function formatCount(n) {
  if (!n || n <= 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000)     return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return n.toLocaleString ? n.toLocaleString('zh-CN') : String(n);
}

/**
 * 相对时间：ISO 字符串 → "刚刚 / X分钟前 / X小时前 / X天前 / M月D日"
 */
export function formatRelTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60)     return '刚刚';
    if (diff < 3600)   return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400)  return Math.floor(diff / 3600) + '小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + '天前';
    const d = new Date(isoStr);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export function fmt(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/* Format seconds to duration string: 45:30 or 1:23:45 */
export function fmtDuration(s) {
  if (!s || !isFinite(s) || s <= 0) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return m + ':' + String(sec).padStart(2, '0');
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
  dom.expProgressFill.style.transform = `scaleX(${p})`;
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

/* Debounce — delays fn execution until after wait ms of inactivity */
export function debounce(fn, wait) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* Legacy — kept for any other callers */
export function seekAt(e, el, audio) {
  const p = seekCalc(e, el);
  if (audio.duration && isFinite(audio.duration)) audio.currentTime = p * audio.duration;
}

/* Floating text animation — rises from an element and fades out */
export function showFloatText(anchorEl, text) {
  var el = document.createElement('span');
  el.className = 'appreciate-float';
  el.textContent = text;
  anchorEl.appendChild(el);
  el.addEventListener('animationend', function() { el.remove(); });
}

/* Format large numbers: 1234 -> 1.2k, 12345 -> 1.2万 */
export function fmtCount(n) {
  if (!n || n < 1) return '';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 10000).toFixed(1).replace(/\.0$/, '') + '\u4E07';
}

/* Haptic feedback — light vibration for button taps (Android) */
export function haptic(ms = 15) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch (e) { /* silently fail */ }
  }
}

/**
 * Universal share helper — deduplicates share logic across the codebase.
 *
 * On mobile: uses Web Share API (native sheet) with graceful AbortError handling.
 * Fallback: copies "title\nurl" to clipboard and shows a toast.
 *
 * @param {string} title  — display title for the share sheet
 * @param {string} url    — URL to share
 * @param {string} [text] — optional longer description; defaults to title
 */
export function shareContent(title, url, text) {
  const shareText = text || title;
  if (navigator.share) {
    navigator.share({ title, text: shareText, url }).catch(err => {
      // AbortError = user cancelled the native share sheet — no fallback needed
      if (err.name === 'AbortError') return;
      // Any other error (e.g. unsupported content) → fall back to clipboard
      _copyToClipboard(title + '\n' + url);
    });
    return;
  }
  _copyToClipboard(title + '\n' + url);
}

function _copyToClipboard(text) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('\u94fe\u63a5\u5df2\u590d\u5236'); // 链接已复制
  }).catch(() => { });
}

/**
 * Share an image blob using Web Share Files API (mobile) or trigger a download (desktop).
 * @param {Blob}   imageBlob — PNG/JPEG image blob
 * @param {string} filename  — suggested filename
 * @param {string} title     — share title
 */
export async function shareImageBlob(imageBlob, filename, title) {
  const file = new File([imageBlob], filename, { type: imageBlob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  // Fallback: download the image
  const url = URL.createObjectURL(imageBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
