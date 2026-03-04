/* ===== Utility Functions ===== */

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
export function haptic(ms = 50) {
  // ✅ 优化：增加震动时长，使其更明显
  // Android设备：使用更长的震动时长（10ms太短，建议15-30ms）
  const vibrationDuration = ms === 50 ? 15 : ms; // 默认使用15ms，比50ms更合适
  
  if (navigator.vibrate) {
    try {
      // ✅ 优化：使用震动模式，提供更清晰的触觉反馈
      // [震动时长, 暂停时长, 震动时长] - 双击震动效果
      navigator.vibrate([vibrationDuration, 30, vibrationDuration]);
      
      // ✅ 调试：在开发环境输出日志
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('📳 Haptic feedback triggered:', vibrationDuration + 'ms');
      }
    } catch (e) {
      // 静默失败，不影响用户体验
      console.log('Haptic feedback not supported:', e.message);
    }
  } else {
    // ✅ 调试：在开发环境提示不支持
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('⚠️ Vibration API not supported on this device/browser');
    }
  }
  
  // ✅ 优化：为支持的浏览器提供视觉反馈作为降级方案
  // 通过CSS类添加点击波纹效果（已在CSS中实现）
}

/* 检测设备是否支持震动 */
export function isHapticSupported() {
  return !!navigator.vibrate;
}

/* 测试震动功能 */
export function testHaptic() {
  console.log('=== Haptic Test ===');
  console.log('Vibration API supported:', !!navigator.vibrate);
  console.log('User Agent:', navigator.userAgent);
  console.log('Platform:', navigator.platform);
  
  if (navigator.vibrate) {
    console.log('Testing vibration...');
    haptic(20);
    return true;
  } else {
    console.log('❌ Vibration not supported on this device');
    return false;
  }
}
