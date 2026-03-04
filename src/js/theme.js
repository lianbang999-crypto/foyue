const THEMES = ['light', 'dark', 'terracotta'];
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
    const colors = { light: '#FAF9F6', dark: '#0F0F0F', terracotta: '#F7F2EA' };
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

export function initTheme() {
  const saved = localStorage.getItem('pl-theme');
  // Migrate old color scheme setting
  const oldColor = localStorage.getItem('pl-color');
  if (oldColor === 'terracotta' && saved !== 'terracotta') {
    theme = 'terracotta';
    localStorage.removeItem('pl-color');
  } else if (saved && THEMES.includes(saved)) {
    theme = saved;
  }
  applyTheme();
}
