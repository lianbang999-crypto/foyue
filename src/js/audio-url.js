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
