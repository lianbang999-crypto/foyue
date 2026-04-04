const THEMES = ['light', 'dark'];
let theme = 'light';

export function getTheme() {
  return theme;
}

export function isDark() {
  return theme === 'dark';
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.removeAttribute('data-color');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = { light: '#F9F8F6', dark: '#1D1D1D' };
    meta.content = colors[theme] || colors.light;
  }
  localStorage.setItem('pl-theme', theme);
}

export function toggleTheme() {
  const i = (THEMES.indexOf(theme) + 1) % THEMES.length;
  theme = THEMES[i];
  applyTheme();
}

export function setTheme(t) {
  if (THEMES.includes(t)) theme = t;
  applyTheme();
}

/**
 * 子页面用：优先跟随用户保存的主题，缺省时再回退到系统深浅色偏好。
 * @param {{ light?: string, dark?: string }} [themeColors] meta theme-color 映射
 */
export function syncSystemTheme(themeColors) {
  const saved = localStorage.getItem('pl-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
    if (themeColors) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', themeColors[saved] || '');
    }
    return;
  }

  if (saved === 'ink' || saved === 'terracotta') {
    const t = saved === 'ink' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    if (themeColors) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', themeColors[t] || '');
    }
    return;
  }

  const oldColor = localStorage.getItem('pl-color');
  if (oldColor === 'terracotta' || oldColor === 'ink') {
    const t = oldColor === 'ink' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    if (themeColors) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', themeColors[t] || '');
    }
    return;
  }

  const applyTheme = (isDark) => {
    const t = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    if (themeColors) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', themeColors[t] || '');
    }
  };

  if (typeof window.matchMedia !== 'function') { applyTheme(false); return; }

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme(mq.matches);

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', (e) => applyTheme(e.matches));
  } else if (typeof mq.addListener === 'function') {
    mq.addListener((e) => applyTheme(e.matches));
  }
}

export function initTheme() {
  const saved = localStorage.getItem('pl-theme');
  // Migrate old color scheme setting
  const oldColor = localStorage.getItem('pl-color');
  if (oldColor === 'terracotta' && saved !== 'terracotta') {
    theme = 'light';
    localStorage.removeItem('pl-color');
  } else if (oldColor === 'ink' && saved !== 'ink') {
    theme = 'dark';
    localStorage.removeItem('pl-color');
  } else if (saved === 'terracotta') {
    theme = 'light';
  } else if (saved === 'ink') {
    theme = 'dark';
  } else if (saved && THEMES.includes(saved)) {
    theme = saved;
  }
  applyTheme();
}
