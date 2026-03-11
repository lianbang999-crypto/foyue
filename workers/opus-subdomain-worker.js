/**
 * Cloudflare Worker for opus.foyue.org
 * 为Opus音频子域名添加正确的HTTP响应头
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 从R2获取文件
    const object = await env.BUCKET.get(url.pathname.slice(1));

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    // 构建响应头
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // ✅ 添加音频优化相关的HTTP头
    headers.set('Cache-Control', 'public, max-age=2592000, immutable');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', 'https://foyue.org');
    headers.set('Timing-Allow-Origin', 'https://foyue.org');
    headers.set('X-Content-Type-Options', 'nosniff');

    // 处理Range请求（音频seek支持）
    const range = request.headers.get('Range');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
      const chunkSize = (end - start) + 1;

      headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
      headers.set('Content-Length', chunkSize);

      return new Response(object.body, {
        status: 206,
        headers
      });
    }

    return new Response(object.body, { headers });
  }
};
