let dark = false;
let colorScheme = 'default'; // 'default' | 'terracotta'

export function isDark() {
  return dark;
}

export function getColorScheme() {
  return colorScheme;
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-color', colorScheme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (colorScheme === 'terracotta') {
      meta.content = dark ? '#141010' : '#F7F2EA';
    } else {
      meta.content = dark ? '#0F0F0F' : '#FAF9F6';
    }
  }
  localStorage.setItem('pl-theme', dark ? 'dark' : 'light');
  localStorage.setItem('pl-color', colorScheme);
}

export function toggleTheme() {
  dark = !dark;
  applyTheme();
}

export function setColorScheme(scheme) {
  colorScheme = scheme;
  applyTheme();
}

export function initTheme() {
  const saved = localStorage.getItem('pl-theme');
  dark = saved === 'dark';
  colorScheme = localStorage.getItem('pl-color') || 'default';
  applyTheme();
}
