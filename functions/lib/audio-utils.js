/**
 * 音频 URL 工具模块 — 服务端共享
 * 负责从 bucket + folder + fileName 动态构建音频 URL
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

/**
 * 从 bucket 名称 + folder + fileName 构建完整音频 URL
 *
 * @param {string} bucket   - R2 bucket 名称 (如 'daanfashi')
 * @param {string} folder   - 文件夹名 (如 '净土资粮信愿行（正编）')
 * @param {string} fileName - 文件名 (如 '净土资粮信愿行（正编）第1讲.mp3')
 * @returns {string} 完整 URL
 */
export function buildAudioUrl(bucket, folder, fileName) {
  const bucketId = BUCKET_MAP[bucket];
  if (!bucketId) {
    throw new Error(`[audio-utils] Unknown bucket: ${bucket}`);
  }

  const parts = [MP3_DOMAIN, bucketId];
  if (folder) parts.push(encodeURIComponent(folder));
  parts.push(encodeURIComponent(fileName));
  return parts.join('/');
}
