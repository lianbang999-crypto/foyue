/* audio-url.js — Centralized audio URL resolution with Opus support */
'use strict';

/**
 * Audio Format Strategy:
 * - Opus is the primary format (smaller files, better quality)
 * - MP3 is the fallback for browsers that don't support Opus
 * - Detection runs once on module load; result is cached
 *
 * URL Mapping:
 *   MP3:  audio.foyue.org/{bucketHexId}/{folder}/{file}.mp3
 *   Opus: opus.foyue.org/{categoryTitle}/{folder}/{file}.opus
 *
 * The R2 opus bucket uses category Chinese titles as top-level prefixes
 * (e.g. "听经台/净土资粮信愿行（正编）/file.opus"), while the MP3 buckets
 * use hex IDs. registerOpusMapping() builds the translation table from
 * the API data so resolveAudioUrl() can rewrite paths correctly.
 *
 * The data layer (D1 database) always stores MP3 URLs.
 * This module resolves them to Opus at runtime when supported.
 */

const MP3_DOMAIN = 'audio.foyue.org';
const OPUS_DOMAIN = 'opus.foyue.org';

/* ── Opus R2 path mapping ── */
// Primary: bucketHexId → categoryTitle (for buckets used by single category)
const _opusPathMap = new Map();
// Fine-grained: "hexId/folder" → categoryTitle (for shared buckets)
const _opusFolderMap = new Map();
// Reverse primary: categoryTitle → bucketHexId (for single-bucket categories)
const _reversePathMap = new Map();
// Reverse fine-grained: "catTitle/folder" → hexId (for canonicalAudioUrl)
const _reverseFolderMap = new Map();

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
 * Register Opus path mapping from loaded API data.
 * Builds a lookup from MP3 bucket hex IDs to opus category folder prefixes.
 *
 * The opus R2 bucket structure: opus.foyue.org/{categoryTitle}/{folder}/{file}.opus
 * The MP3 structure:            audio.foyue.org/{bucketHexId}/{folder}/{file}.mp3
 *
 * Each category in the data has series with a `bucket` name. We use BUCKET_MAP
 * (same as server-side) to get the hex ID, then map hexId → categoryTitle.
 *
 * Note: If a bucket is shared across multiple categories (e.g. daanfashi is used
 * by both 听经台 and 有声书), the mapping uses the FIRST category encountered.
 * Only categories with opus files converted need correct mapping; others fall
 * back gracefully (opus URL 404 → browser plays original MP3 via error handler).
 *
 * @param {Array} categories - The categories array from /api/categories response
 */
const BUCKET_MAP = {
  daanfashi:        '7be57e30faae4f81bbd76b61006ac8fc',
  fohao:            '8c99ae05414d4672b1ec08a569ab3299',
  yinguangdashi:    '7a334cb009c14e10bbcfee54bb593a2a',
  jingtushengxian:  '05d3db9f377146d5bb450025565f7d1b',
  youshengshu:      '772643034503463d9b954f0eea5ce80b',
  jingdiandusong:   '09eef2d346704b409a5fbef97ce6464a',
};

// Categories that have been converted to Opus in the R2 opus bucket.
// Only these categories will be resolved to opus URLs.
// Update this set when more categories are converted.
const OPUS_CONVERTED_CATEGORIES = new Set([
  '听经台',
  '有声书',
]);

export function registerOpusMapping(categories) {
  if (!categories || !Array.isArray(categories)) return;
  _opusPathMap.clear();
  _opusFolderMap.clear();
  _reversePathMap.clear();
  _reverseFolderMap.clear();

  // Track which hexIds are used by multiple categories
  const hexIdCategories = new Map(); // hexId → Set of catTitles

  for (const cat of categories) {
    const catTitle = cat.title;
    if (!catTitle) continue;

    // Only build mappings for categories that have opus files
    if (!OPUS_CONVERTED_CATEGORIES.has(catTitle)) continue;

    for (const s of (cat.series || [])) {
      const hexId = BUCKET_MAP[s.bucket];
      if (!hexId) continue;

      // Track all categories using this hexId
      if (!hexIdCategories.has(hexId)) hexIdCategories.set(hexId, new Set());
      hexIdCategories.get(hexId).add(catTitle);

      // Build fine-grained folder mapping for all series
      if (s.folder) {
        const fwdKey = hexId + '/' + s.folder;
        _opusFolderMap.set(fwdKey, catTitle);
        // Reverse: catTitle/folder → hexId
        const revKey = catTitle + '/' + s.folder;
        _reverseFolderMap.set(revKey, hexId);
      }
    }
  }

  // Build primary maps (only for non-shared buckets)
  for (const [hexId, catTitles] of hexIdCategories) {
    if (catTitles.size === 1) {
      const catTitle = [...catTitles][0];
      _opusPathMap.set(hexId, catTitle);
      _reversePathMap.set(catTitle, hexId);
    }
    // Shared buckets: rely on folder-level maps for exact resolution
  }
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

  // No mapping registered yet — can't resolve, use MP3
  if (_opusPathMap.size === 0 && _opusFolderMap.size === 0) return url;

  // Parse the URL path to extract bucketHexId
  // URL format: https://audio.foyue.org/{bucketHexId}/{folder}/{file}.mp3
  // or:         https://audio.foyue.org/{bucketHexId}/{file}.mp3 (no folder)
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length < 1) return url;

    const bucketHexId = segments[0]; // first path segment

    // Determine the category title for the opus path prefix
    let catTitle = null;

    // Try fine-grained folder lookup first (handles shared buckets like daanfashi)
    // The "folder" may span multiple path segments (e.g. 专题讲座/净土宗教程)
    // Extract: segments = [hexId, ...folderParts, fileName]
    if (segments.length >= 3) {
      // folder = everything between hexId and last segment (fileName)
      const folderParts = segments.slice(1, -1).map(s => decodeURIComponent(s));
      const folder = folderParts.join('/');
      const folderKey = bucketHexId + '/' + folder;
      catTitle = _opusFolderMap.get(folderKey);
      // Also try with just the first folder segment (some DB entries only store top-level)
      if (!catTitle && folderParts.length > 1) {
        catTitle = _opusFolderMap.get(bucketHexId + '/' + folderParts[0]);
      }
    }

    // Fall back to primary bucket-level mapping
    if (!catTitle) {
      catTitle = _opusPathMap.get(bucketHexId);
    }

    if (!catTitle) return url; // no opus mapping for this bucket — stay on MP3

    // Rebuild path: replace bucketHexId with categoryTitle
    segments[0] = encodeURIComponent(catTitle);

    // Replace file extension: .mp3 → .opus
    const lastIdx = segments.length - 1;
    segments[lastIdx] = segments[lastIdx].replace(/\.mp3(\?|$)/, '.opus$1');

    return `https://${OPUS_DOMAIN}/${segments.join('/')}${u.search}`;
  } catch {
    return url;
  }
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

  // If not an opus URL, nothing to reverse
  if (!url.includes(OPUS_DOMAIN)) return url;

  // Reverse Opus path mapping → MP3
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length < 1) return url;

    // First segment is the encoded categoryTitle — decode and look up hex ID
    const catTitle = decodeURIComponent(segments[0]);
    let hexId = null;

    // Try fine-grained folder lookup first (handles shared buckets)
    // Opus path: /{catTitle}/{folderParts...}/{fileName}.opus
    if (segments.length >= 3) {
      const folderParts = segments.slice(1, -1).map(s => decodeURIComponent(s));
      const folder = folderParts.join('/');
      hexId = _reverseFolderMap.get(catTitle + '/' + folder);
      // Also try top-level folder only
      if (!hexId && folderParts.length > 1) {
        hexId = _reverseFolderMap.get(catTitle + '/' + folderParts[0]);
      }
    }

    // Fall back to primary category-level mapping
    if (!hexId) {
      hexId = _reversePathMap.get(catTitle);
    }

    if (hexId) {
      segments[0] = hexId;
    }

    // Replace .opus → .mp3
    const lastIdx = segments.length - 1;
    segments[lastIdx] = segments[lastIdx].replace(/\.opus(\?|$)/, '.mp3$1');

    return `https://${MP3_DOMAIN}/${segments.join('/')}${u.search}`;
  } catch {
    // Fallback: simple string replacement
    let canonical = url.replace(OPUS_DOMAIN, MP3_DOMAIN);
    canonical = canonical.replace(/\.opus(\?|$)/, '.mp3$1');
    return canonical;
  }
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
