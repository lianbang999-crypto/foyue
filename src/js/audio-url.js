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

export async function drainResponseBody(response) {
  if (!response?.body?.getReader) return;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export function warmAudioUrl(url, options = {}) {
  if (!isAudioUrl(url)) return;
  if (typeof window === 'undefined' || window.location.origin !== AUDIO_WARM_ORIGIN) return;
  const bytes = Number.isFinite(Number(options.bytes)) && Number(options.bytes) > 0 ? Math.floor(Number(options.bytes)) : AUDIO_WARM_BYTES;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0 ? Math.floor(Number(options.timeoutMs)) : 4000;
  const warmKey = `${url}::${bytes}`;
  if (warmedAudioUrls.has(warmKey)) return;

  warmedAudioUrls.add(warmKey);

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  fetch(url, {
    method: 'GET',
    headers: { Range: `bytes=0-${bytes - 1}` },
    signal: controller ? controller.signal : undefined,
  }).then(resp => {
    if (!resp.ok && resp.status !== 206) throw new Error('HTTP ' + resp.status);
    return drainResponseBody(resp);
  }).catch(() => {
    warmedAudioUrls.delete(warmKey);
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
