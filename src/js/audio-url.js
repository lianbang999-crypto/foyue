/* audio-url.js — Minimal audio URL utilities */
'use strict';

/**
 * Check if a URL is an audio URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isAudioUrl(url) {
  if (!url) return false;
  if (url.includes('audio.foyue.org')) return true;
  return /\.(mp3|m4a|ogg|webm)(\?|$)/i.test(url);
}

const AUDIO_WARM_ORIGIN = 'https://foyue.org';
const AUDIO_WARM_BYTES = 64 * 1024;
const warmedAudioUrls = new Set();

export function warmAudioUrl(url) {
  if (!isAudioUrl(url)) return;
  if (typeof window === 'undefined' || window.location.origin !== AUDIO_WARM_ORIGIN) return;
  if (warmedAudioUrls.has(url)) return;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return;
  if (typeof connection?.effectiveType === 'string' && /(^|-)2g$/.test(connection.effectiveType)) return;

  warmedAudioUrls.add(url);

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

  fetch(url, {
    method: 'GET',
    headers: { Range: `bytes=0-${AUDIO_WARM_BYTES - 1}` },
    signal: controller ? controller.signal : undefined,
  }).catch(() => {
    warmedAudioUrls.delete(url);
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
