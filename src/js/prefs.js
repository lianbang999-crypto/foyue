/* ===== User preferences (localStorage) ===== */

const HIDE_PLAY_COUNT_KEY = 'foyue-hide-play-count';

/** When true, hide server-reported play counts in home / category UI. */
export function getHidePublicPlayCount() {
  try {
    return localStorage.getItem(HIDE_PLAY_COUNT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHidePublicPlayCount(hide) {
  try {
    if (hide) localStorage.setItem(HIDE_PLAY_COUNT_KEY, '1');
    else localStorage.removeItem(HIDE_PLAY_COUNT_KEY);
  } catch { /* ignore */ }
  syncHidePublicPlayCountClass();
}

export function syncHidePublicPlayCountClass() {
  document.documentElement.classList.toggle('hide-public-play-count', getHidePublicPlayCount());
}
