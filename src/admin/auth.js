/* ===== Admin Auth ===== */

const STORAGE_KEY = 'admin-token';

export function getToken() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

export function setToken(token) {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

/**
 * Initialize the login overlay. Calls onSuccess() once verified.
 */
export function initLogin(onSuccess) {
  const overlay = document.getElementById('loginOverlay');
  const input = document.getElementById('loginToken');
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');

  overlay.style.display = '';

  async function doLogin() {
    const token = input.value.trim();
    if (!token) return;
    btn.disabled = true;
    btn.textContent = '验证中...';
    errEl.textContent = '';

    try {
      const resp = await fetch('/api/admin/verify', {
        headers: { 'X-Admin-Token': token },
      });
      if (resp.ok) {
        setToken(token);
        onSuccess();
      } else {
        errEl.textContent = '密钥无效';
      }
    } catch {
      errEl.textContent = '网络错误，请重试';
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  }

  btn.addEventListener('click', doLogin);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}
