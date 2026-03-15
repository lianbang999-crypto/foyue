/* audio-cache.js — Cache API wrapper for offline audio playback */
'use strict';

import { get, set } from './store.js';

const AUDIO_CACHE = 'audio-v2'; // v2: cache key = actual URL (no canonicalization)
const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB cap

/* ===== Store-backed cached URL set ===== */

function _getCachedSet() {
  const arr = get('cachedUrls');
  return new Set(Array.isArray(arr) ? arr : []);
}

function _saveCachedSet(set_) {
  set('cachedUrls', [...set_]);
}

function _addCachedUrl(url) {
  const s = _getCachedSet();
  s.add(url);
  _saveCachedSet(s);
  _dispatchChange();
}

function _removeCachedUrl(url) {
  const s = _getCachedSet();
  s.delete(url);
  _saveCachedSet(s);
  _dispatchChange();
}

function _clearCachedUrls() {
  set('cachedUrls', []);
  _dispatchChange();
}

function _dispatchChange() {
  try {
    window.dispatchEvent(new CustomEvent('audiocache:change'));
  } catch {}
}

/**
 * Synchronously check if a URL is in the store's cached-URL set.
 * Faster than the async Cache API lookup — use for rendering.
 * @param {string} url
 * @returns {boolean}
 */
export function isCachedSync(url) {
  return _getCachedSet().has(url);
}

/**
 * Initialise the store's cachedUrls by scanning the actual Cache API.
 * Call once on app start so the sync set reflects reality.
 * @returns {Promise<void>}
 */
export async function initCachedUrls() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    set('cachedUrls', keys.map(r => r.url));
    _dispatchChange();
  } catch {
    set('cachedUrls', []);
  }
}

/**
 * Store a fetched blob as a proper Response in Cache API.
 * Cache key is always the canonical (MP3) URL for consistency.
 * @param {string} url - The original audio URL (used as cache key)
 * @param {Blob} blob - The audio data
 */
export async function cacheAudio(url, blob) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const key = url;
    const headers = new Headers({
      'Content-Type': blob.type || 'audio/mpeg',
      'Content-Length': String(blob.size)
    });
    const response = new Response(blob, { status: 200, headers });
    await cache.put(key, response);
    // Update store so UI can reflect instantly
    _addCachedUrl(url);
    // LRU eviction: if total exceeds cap, remove oldest entries
    _evictIfNeeded(cache).catch(() => {});
  } catch (e) {
    // Silently fail — quota exceeded or other cache error
  }
}

/**
 * Evict oldest cache entries until total size is under MAX_CACHE_BYTES.
 * Cache API keys() returns entries in insertion order (FIFO).
 */
async function _evictIfNeeded(cache) {
  const keys = await cache.keys();
  let total = 0;
  const sizes = [];
  for (const req of keys) {
    const resp = await cache.match(req);
    const cl = resp ? parseInt(resp.headers.get('Content-Length') || '0', 10) : 0;
    sizes.push(cl);
    total += cl;
  }
  // Delete oldest entries until under the cap
  let i = 0;
  while (total > MAX_CACHE_BYTES && i < keys.length) {
    await cache.delete(keys[i]);
    total -= sizes[i];
    i++;
  }
}

/**
 * Check if a URL is in cache.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isAudioCached(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const resp = await cache.match(url);
    return !!resp;
  } catch (e) {
    return false;
  }
}

/**
 * Get cached audio as Object URL for playback.
 * Caller is responsible for revoking the URL when done.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export async function getCachedAudioUrl(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const resp = await cache.match(url);
    if (!resp) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    return null;
  }
}

/**
 * Count cached audio entries.
 * @returns {Promise<number>}
 */
export async function getCachedCount() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    return keys.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Get total size of cached audio in bytes.
 * @returns {Promise<number>}
 */
export async function getCachedSize() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    let total = 0;
    for (const req of keys) {
      const resp = await cache.match(req);
      if (resp) {
        const cl = resp.headers.get('Content-Length');
        if (cl) total += parseInt(cl, 10);
      }
    }
    return total;
  } catch (e) {
    return 0;
  }
}

/**
 * Clear all cached audio.
 * @returns {Promise<boolean>}
 */
export async function clearAudioCache() {
  try {
    const result = await caches.delete(AUDIO_CACHE);
    _clearCachedUrls();
    return result;
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function removeCachedAudio(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const result = await cache.delete(url);
    if (result) _removeCachedUrl(url);
    return result;
  } catch (e) {
    return false;
  }
}
