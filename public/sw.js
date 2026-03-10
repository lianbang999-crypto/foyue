/* Service Worker — 净土法音 Offline Cache */
'use strict';

const CACHE_VERSION = 'v1';
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const DATA_CACHE   = 'data-'   + CACHE_VERSION;
const AUDIO_CACHE  = 'audio-v1';

/* Opus R2 path mapping: categoryTitle → bucketHexId (reverse of frontend mapping)
 * The opus bucket uses Chinese category titles as path prefixes:
 *   opus.foyue.org/{categoryTitle}/{folder}/{file}.opus
 * The canonical (MP3) cache key uses bucket hex IDs:
 *   audio.foyue.org/{bucketHexId}/{folder}/{file}.mp3
 * This map enables the SW to normalize opus URLs to canonical MP3 keys for cache lookup.
 */
const OPUS_CATEGORY_TO_BUCKET = {
  '听经台': '7be57e30faae4f81bbd76b61006ac8fc',
  '佛号': '8c99ae05414d4672b1ec08a569ab3299',
  '经典读诵': '09eef2d346704b409a5fbef97ce6464a',
};
/* Fine-grained overrides for series whose bucket differs from the category default.
 * 有声书 has no single bucket — each series uses a different one.
 * Map "catTitle/folder" → bucketHexId for series with a folder path segment.
 * Note: 有声书 series with NULL folder (印光大师永怀录, 净土圣贤录) use unique
 * buckets not shared with other categories; they don't need folder-level mapping
 * since their files sit at the bucket root without a distinguishing folder segment.
 * When those are converted to opus, update this map or add them to OPUS_CATEGORY_TO_BUCKET.
 */
const OPUS_FOLDER_TO_BUCKET = {
  '有声书/大安法师讲故事': '7be57e30faae4f81bbd76b61006ac8fc',
};

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

  /* Cached audio: serve from audio cache if available (even for Range requests) */
  /* Supports both MP3 (audio.foyue.org) and Opus (opus.foyue.org) domains */
  if (url.hostname.includes('audio.foyue.org') || url.hostname.includes('opus.foyue.org') || /\.(mp3|m4a|ogg|opus)(\?|$)/.test(url.pathname)) {
    // Normalize cache lookup key: always use canonical (MP3) URL
    let canonical = url.href;
    if (url.hostname.includes('opus.foyue.org')) {
      // Opus URL: opus.foyue.org/{categoryTitle}/{folder}/{file}.opus
      // → MP3 key: audio.foyue.org/{bucketHexId}/{folder}/{file}.mp3
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length >= 1) {
        const catTitle = decodeURIComponent(segments[0]);
        let hexId = null;
        // Try folder-level lookup first (for shared buckets like 有声书)
        if (segments.length >= 2) {
          const folder = decodeURIComponent(segments[1]);
          hexId = OPUS_FOLDER_TO_BUCKET[catTitle + '/' + folder];
        }
        // Fall back to category-level lookup
        if (!hexId) hexId = OPUS_CATEGORY_TO_BUCKET[catTitle];
        if (hexId) {
          segments[0] = hexId;
        }
      }
      const lastIdx = segments.length - 1;
      if (lastIdx >= 0) {
        segments[lastIdx] = segments[lastIdx].replace(/\.opus(\?|$)/, '.mp3$1');
      }
      canonical = 'https://audio.foyue.org/' + segments.join('/') + url.search;
    }
    event.respondWith(
      caches.open(AUDIO_CACHE)
        .then(cache => cache.match(canonical, { ignoreSearch: false }))
        .then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Never intercept Range requests (audio/video streaming)
  if (event.request.headers.get('range')) return;

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
