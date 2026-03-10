/* audio-url.js — Minimal audio URL utilities */
/* "Server Decides, Client Plays" — the server returns the final playable URL.
 * This module only provides Opus detection (for the ?opus=1 API param)
 * and a simple emergency fallback helper. */
'use strict';

/* ── One-time Opus support detection ── */
let _opusSupported = null;

function detectOpusSupport() {
  if (_opusSupported !== null) return _opusSupported;
  try {
    const a = document.createElement('audio');
    const ogg = a.canPlayType('audio/ogg; codecs=opus');
    const opus = a.canPlayType('audio/opus');
    const webm = a.canPlayType('audio/webm; codecs=opus');
    _opusSupported = (ogg === 'probably' || opus === 'probably' || webm === 'probably' ||
                      ogg === 'maybe' || opus === 'maybe' || webm === 'maybe');
  } catch {
    _opusSupported = false;
  }
  return _opusSupported;
}

// Detect on module load
detectOpusSupport();

/**
 * Check if Opus audio format is supported by this browser.
 * @returns {boolean}
 */
export function isOpusSupported() {
  return detectOpusSupport();
}

/**
 * Build the opus query parameter string for API requests.
 * @returns {string} '?opus=1' if browser supports Opus, '' otherwise
 */
export function opusQueryParam() {
  return detectOpusSupport() ? '?opus=1' : '';
}

/**
 * Given an Opus URL, derive a best-effort MP3 fallback URL.
 * Only used as emergency fallback when ep.mp3Url is unavailable.
 * Note: This does a simple domain+extension swap; the path structure
 * (categoryTitle vs hexId) won't match, so this is NOT guaranteed to work.
 * The server-provided mp3Url should always be preferred.
 * @param {string} url
 * @returns {string}
 */
export function mp3FallbackUrl(url) {
  if (!url) return url;
  if (!url.includes('opus.foyue.org')) return url;
  return url.replace('opus.foyue.org', 'audio.foyue.org')
            .replace(/\.opus(\?|$)/, '.mp3$1');
}

/**
 * Check if a URL is an audio URL (any format, any domain).
 * @param {string} url
 * @returns {boolean}
 */
export function isAudioUrl(url) {
  if (!url) return false;
  if (url.includes('audio.foyue.org') || url.includes('opus.foyue.org')) return true;
  return /\.(mp3|m4a|ogg|opus|webm)(\?|$)/i.test(url);
}
