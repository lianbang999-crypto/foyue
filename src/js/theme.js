let dark = false;

export function isDark() {
  return dark;
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0F0F0F' : '#FAF9F6';
  localStorage.setItem('pl-theme', dark ? 'dark' : 'light');
}

export function toggleTheme() {
  dark = !dark;
  applyTheme();
}

export function initTheme() {
  const saved = localStorage.getItem('pl-theme');
  dark = saved === 'dark';
  applyTheme();
}
