/* Service Worker — 净土法音 Offline Cache */
'use strict';

const CACHE_VERSION = 'v3';
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const DATA_CACHE   = 'data-'   + CACHE_VERSION;
const AUDIO_CACHE  = 'audio-v2';

/* App-shell files to pre-cache on install */
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* Patterns that go into static cache (immutable assets) */
function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|png|svg|ico|webp|jpg|jpeg)(\?.*)?$/.test(url.pathname);
}

/* Patterns that go into data cache (API / JSON) */
function isDataRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.endsWith('.json');
}

/* Never cache these */
function shouldSkip(url) {
  return (
    url.pathname.startsWith('/api/admin') ||
    url.pathname === '/admin.html' ||
    url.protocol !== 'https:'
  );
}

/* ── Install: pre-cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: purge old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for static, network-first for data ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (shouldSkip(url)) return;

  // ✅ 修复：Range请求直接走网络，避免缓存冲突
  if (event.request.headers.get('range')) return;

  /* Cached audio: serve from audio cache if available.
   * "Server Decides" — no URL normalization needed.
   * Cache key = the actual URL the player uses (Opus or MP3). */
  if (url.hostname.includes('audio.foyue.org') || url.hostname.includes('opus.foyue.org') || /\.(mp3|m4a|ogg|opus)(\?|$)/.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE)
        .then(cache => cache.match(event.request.url))
        .then(cached => cached || fetch(event.request))
    );
    return;
  }

  /* Static assets: cache-first */
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match('/'))
    );
    return;
  }

  /* Data / API: network-first with cache fallback */
  if (isDataRequest(url)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(DATA_CACHE).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  /* HTML navigation: network-first, fall back to cached shell */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
});
