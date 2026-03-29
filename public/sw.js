/* Service Worker — 净土法音 Offline Cache */
'use strict';

const CACHE_VERSION = 'v8';
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const DATA_CACHE = 'data-' + CACHE_VERSION;
const AUDIO_CACHE = 'audio-v2';

/* App-shell files to pre-cache on install */
const APP_SHELL = [
  '/',
  '/nianfo',
  '/gongxiu',
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
    ).then(async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

/* ── Fetch: cache-first for static, stale-while-revalidate for data ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (shouldSkip(url)) return;

  // ✅ 修复：Range请求直接走网络，避免缓存冲突
  if (event.request.headers.get('range')) return;

  /* Cached audio: serve from audio cache if available.
   * Cache key = the actual URL the player uses. */
  if (url.hostname.includes('audio.foyue.org') || /\.(mp3|m4a|ogg)(\?|$)/.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(event.request.url).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            // Only cache successful full responses (not partial 206)
            if (response.ok && response.status === 200) {
              cache.put(event.request.url, response.clone());
              // 通知主线程更新缓存 URL 集合
              self.clients.matchAll().then(cls => {
                cls.forEach(c => c.postMessage({ type: 'audio-cached', url: event.request.url }));
              });
            }
            return response;
          });
        })
      )
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

  /* Data / API: stale-while-revalidate — serve cache immediately, update in background */
  if (isDataRequest(url)) {
    // ── Categories API: detect changes and notify page clients ──
    if (url.pathname === '/api/categories' && !url.searchParams.has('home')) {
      event.respondWith(
        caches.open(DATA_CACHE).then(async cache => {
          const cachedResp = await cache.match(event.request);
          if (cachedResp) {
            // Clone before returning so we can compare in the background task
            const cachedClone = cachedResp.clone();
            // Fetch fresh in background; compare; notify if changed
            (async () => {
              try {
                const netResp = await fetch(event.request);
                if (!netResp.ok) return;
                const freshText = await netResp.text();
                const oldText = await cachedClone.text();
                // Always refresh the cached entry
                cache.put(event.request, new Response(freshText, {
                  status: netResp.status,
                  statusText: netResp.statusText,
                  headers: netResp.headers,
                }));
                // Broadcast to all page clients when data changed
                if (freshText !== oldText) {
                  try {
                    const freshData = JSON.parse(freshText);
                    const clients = await self.clients.matchAll({ type: 'window' });
                    clients.forEach(c => c.postMessage({ type: 'data-updated', data: freshData }));
                  } catch (e) { /* ignore JSON parse errors */ }
                }
              } catch (e) { /* network failed; keep serving stale */ }
            })();
            return cachedResp; // serve stale immediately
          }
          // No cache yet: fetch from network and cache the result
          try {
            const netResp = await fetch(event.request);
            if (netResp.ok) {
              cache.put(event.request, netResp.clone());
            }
            return netResp;
          } catch (e) {
            return new Response('{"error":"offline"}', { status: 503 });
          }
        })
      );
      return;
    }

    event.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(err => {
            console.warn('[SW] Data fetch failed:', err);
            // Return offline error response (cannot return null — invalid for respondWith)
            return cached || new Response('{"error":"offline"}', {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });

          // Return cached response immediately if available; otherwise wait for network
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  /* HTML navigation: network-first, fall back to cached shell */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(event.request) || await cache.match('/');
        const networkFetch = (async () => {
          try {
            const preloadResponse = await event.preloadResponse;
            const response = preloadResponse || await fetch(event.request);
            if (response && response.ok) {
              await cache.put(event.request, response.clone());
              if (url.pathname === '/' || url.pathname === '/index.html') {
                await cache.put('/', response.clone());
              }
            }
            return response;
          } catch {
            return null;
          }
        })();

        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }

        const response = await networkFetch;
        return response || cache.match('/');
      })
    );
    return;
  }
});
