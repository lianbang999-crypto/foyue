/* audio-cache.js — Cache API wrapper for offline audio playback */
'use strict';

const AUDIO_CACHE = 'audio-v1';

/**
 * Store a fetched blob as a proper Response in Cache API.
 * @param {string} url - The original audio URL (used as cache key)
 * @param {Blob} blob - The audio data
 */
export async function cacheAudio(url, blob) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const headers = new Headers({
      'Content-Type': blob.type || 'audio/mpeg',
      'Content-Length': String(blob.size)
    });
    const response = new Response(blob, { status: 200, headers });
    await cache.put(url, response);
  } catch (e) {
    // Silently fail — quota exceeded or other cache error
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
 * Clear all cached audio.
 * @returns {Promise<boolean>}
 */
export async function clearAudioCache() {
  try {
    return await caches.delete(AUDIO_CACHE);
  } catch (e) {
    return false;
  }
}

/**
 * Remove a single cached entry.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function removeCachedAudio(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    return await cache.delete(url);
  } catch (e) {
    return false;
  }
}
