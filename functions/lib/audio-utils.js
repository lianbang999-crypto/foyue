/**
 * 音频 URL 工具模块 — 服务端共享
 * 负责从 bucket + folder + fileName 动态构建音频 URL
 *
 * "Server Decides" strategy:
 *   The server returns the final playable URL (Opus or MP3).
 *   The client plays whatever URL it receives — no format detection or rewriting.
 *   OPUS_CATEGORIES is the single source of truth for which categories have Opus files.
 */

// R2 bucket 名称 → bucket ID 映射
export const BUCKET_MAP = {
  daanfashi:        '7be57e30faae4f81bbd76b61006ac8fc',
  fohao:            '8c99ae05414d4672b1ec08a569ab3299',
  yinguangdashi:    '7a334cb009c14e10bbcfee54bb593a2a',
  jingtushengxian:  '05d3db9f377146d5bb450025565f7d1b',
  youshengshu:      '772643034503463d9b954f0eea5ce80b',
  jingdiandusong:   '09eef2d346704b409a5fbef97ce6464a',
};

const MP3_DOMAIN = 'https://audio.foyue.org';
const OPUS_DOMAIN = 'https://opus.foyue.org';

// Categories that have Opus files in the R2 opus bucket.
// Update this set as more categories are converted.
export const OPUS_CATEGORIES = new Set([
  '听经台',
]);

/**
 * 从 bucket 名称 + folder + fileName 构建完整音频 URL
 *
 * When opts.opusSupported is true AND the category has Opus files,
 * returns an Opus URL (opus.foyue.org/{catTitle}/{folder}/{file}.opus).
 * Otherwise returns the standard MP3 URL (audio.foyue.org/{hexId}/{folder}/{file}.mp3).
 *
 * @param {string} bucket   - R2 bucket 名称 (如 'daanfashi')
 * @param {string} folder   - 文件夹名 (如 '净土资粮信愿行（正编）')
 * @param {string} fileName - 文件名 (如 '净土资粮信愿行（正编）第1讲.mp3')
 * @param {object} [opts]
 * @param {boolean} [opts.opusSupported] - Client supports Opus
 * @param {string}  [opts.categoryTitle] - Category title (如 '听经台')
 * @returns {string} 完整 URL
 */
export function buildAudioUrl(bucket, folder, fileName, opts) {
  const bucketId = BUCKET_MAP[bucket];
  if (!bucketId) {
    throw new Error(`[audio-utils] Unknown bucket: ${bucket}`);
  }

  const { opusSupported = false, categoryTitle = '' } = opts || {};

  // Opus path: only for categories with Opus files AND when client supports Opus
  if (opusSupported && OPUS_CATEGORIES.has(categoryTitle)) {
    const opusFileName = fileName.replace(/\.mp3$/i, '.opus');
    const parts = [OPUS_DOMAIN, encodeURIComponent(categoryTitle)];
    if (folder) parts.push(encodeURIComponent(folder));
    parts.push(encodeURIComponent(opusFileName));
    return parts.join('/');
  }

  // MP3 path (default)
  const parts = [MP3_DOMAIN, bucketId];
  if (folder) parts.push(encodeURIComponent(folder));
  parts.push(encodeURIComponent(fileName));
  return parts.join('/');
}
