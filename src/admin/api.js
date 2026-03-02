/* ===== Admin API Client ===== */

import { getToken, clearToken } from './auth.js';

async function request(path, options = {}) {
  const token = getToken();
  const resp = await fetch('/api/admin' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
      ...(options.headers || {}),
    },
  });
  if (resp.status === 401) {
    clearToken();
    location.reload();
    return null;
  }
  return resp.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
};
