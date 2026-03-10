/* audio-url.js — Centralized audio URL resolution with Opus support */
'use strict';

/**
 * Audio Format Strategy:
 * - Opus is the primary format (smaller files, better quality)
 * - MP3 is the fallback for browsers that don't support Opus
 * - Detection runs once on module load; result is cached
 *
 * URL Mapping:
 *   audio.foyue.org/{bucketId}/{folder}/{file}.mp3
 *     → opus.foyue.org/{bucketId}/{folder}/{file}.opus
 *
 * The data layer (audio-data.json, D1 database) always stores MP3 URLs.
 * This module resolves them to Opus at runtime when supported.
 */

const MP3_DOMAIN = 'audio.foyue.org';
const OPUS_DOMAIN = 'opus.foyue.org';

/* ── One-time Opus support detection ── */
let _opusSupported = null; // null = not yet checked

function detectOpusSupport() {
  if (_opusSupported !== null) return _opusSupported;
  try {
    const a = document.createElement('audio');
    // Check multiple MIME variants for broad compatibility
    const ogg = a.canPlayType('audio/ogg; codecs=opus');
    const opus = a.canPlayType('audio/opus');
    const webm = a.canPlayType('audio/webm; codecs=opus');
    // canPlayType returns '', 'maybe', or 'probably'
    _opusSupported = (ogg === 'probably' || opus === 'probably' || webm === 'probably' ||
                      ogg === 'maybe' || opus === 'maybe' || webm === 'maybe');
  } catch {
    _opusSupported = false;
  }
  return _opusSupported;
}

// Run detection immediately on module load
detectOpusSupport();

/**
 * Check if Opus audio format is supported by this browser.
 * @returns {boolean}
 */
export function isOpusSupported() {
  return detectOpusSupport();
}

/**
 * Resolve an audio URL to the best format for the current browser.
 * - If Opus is supported: maps audio.foyue.org → opus.foyue.org, .mp3 → .opus
 * - If not supported: returns the original MP3 URL unchanged
 *
 * Also handles already-resolved Opus URLs and blob URLs (returns them as-is).
 *
 * @param {string} url - The original audio URL (typically MP3)
 * @returns {string} The resolved URL (Opus or original MP3)
 */
export function resolveAudioUrl(url) {
  if (!url) return url;

  // Blob URLs, data URLs — pass through
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  // Already an Opus URL — pass through
  if (url.includes(OPUS_DOMAIN)) return url;

  // Not an audio.foyue.org URL — pass through (e.g. pub-*.r2.dev legacy URLs)
  if (!url.includes(MP3_DOMAIN)) return url;

  // Browser doesn't support Opus — use original MP3
  if (!detectOpusSupport()) return url;

  // Map: audio.foyue.org → opus.foyue.org, .mp3 → .opus
  let resolved = url.replace(MP3_DOMAIN, OPUS_DOMAIN);
  resolved = resolved.replace(/\.mp3(\?|$)/, '.opus$1');

  return resolved;
}

/**
 * Get the canonical (MP3) URL from any audio URL.
 * Used as a stable cache key regardless of format.
 *
 * @param {string} url - Any audio URL (MP3, Opus, or blob)
 * @returns {string} The canonical MP3 URL, or the original if not resolvable
 */
export function canonicalAudioUrl(url) {
  if (!url) return url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  // Reverse Opus mapping → MP3
  let canonical = url.replace(OPUS_DOMAIN, MP3_DOMAIN);
  canonical = canonical.replace(/\.opus(\?|$)/, '.mp3$1');

  return canonical;
}

/**
 * Get the preferred MIME type for audio content.
 * @returns {string}
 */
export function preferredMimeType() {
  return detectOpusSupport() ? 'audio/ogg' : 'audio/mpeg';
}

/**
 * Check if a URL is an audio URL (any format, any domain).
 * @param {string} url
 * @returns {boolean}
 */
export function isAudioUrl(url) {
  if (!url) return false;
  if (url.includes(MP3_DOMAIN) || url.includes(OPUS_DOMAIN)) return true;
  return /\.(mp3|m4a|ogg|opus|webm)(\?|$)/i.test(url);
}
