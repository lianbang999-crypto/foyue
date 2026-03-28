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
  daanfashi: '7be57e30faae4f81bbd76b61006ac8fc',
  fohao: '8c99ae05414d4672b1ec08a569ab3299',
  yinguangdashi: '7a334cb009c14e10bbcfee54bb593a2a',
  jingtushengxian: '05d3db9f377146d5bb450025565f7d1b',
  youshengshu: '772643034503463d9b954f0eea5ce80b',
  jingdiandusong: '09eef2d346704b409a5fbef97ce6464a',
};

const MP3_DOMAIN = 'https://audio.foyue.org';

// 全站回退 MP3：保留常量导出，避免其他模块改动，但不再下发 Opus 链接。
export const OPUS_CATEGORIES = new Set();

/**
 * 从 bucket 名称 + folder + fileName 构建完整音频 URL
 *
 * 当前策略：全站统一返回 MP3 URL，避免格式分流带来的兼容性与缓存复杂度。
 *
 * @param {string} bucket   - R2 bucket 名称 (如 'daanfashi')
 * @param {string} folder   - 文件夹名 (如 '净土资粮信愿行（正编）')
 * @param {string} fileName - 文件名 (如 '净土资粮信愿行（正编）第1讲.mp3')
 * @param {object} [opts]
 * @returns {string} 完整 URL
 */
export function buildAudioUrl(bucket, folder, fileName, opts) {
  const bucketId = BUCKET_MAP[bucket];
  if (!bucketId) {
    throw new Error(`[audio-utils] Unknown bucket: ${bucket}`);
  }

  // MP3 path (default)
  const parts = [MP3_DOMAIN, bucketId];
  if (folder) parts.push(encodeURIComponent(folder));
  parts.push(encodeURIComponent(fileName));
  return parts.join('/');
}
