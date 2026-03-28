/* audio-url.js — Minimal audio URL utilities */
/* 当前策略：全站统一回退 MP3。
 * 保留旧的 Opus URL 改写能力，用来兜底用户本地残留状态。 */
'use strict';

/**
 * 全站禁用 Opus 下发，统一走 MP3。
 * @returns {boolean}
 */
export function isOpusSupported() {
  return false;
}

/**
 * 关闭 opus 查询参数，确保 API 永远返回 MP3 链接。
 * @returns {string}
 */
export function opusQueryParam() {
  return '';
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
