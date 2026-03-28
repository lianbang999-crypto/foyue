/**
 * Cloudflare Worker for opus.foyue.org
 * 为Opus音频子域名添加正确的HTTP响应头
 */

function buildBaseHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', 'https://foyue.org');
  headers.set('Timing-Allow-Origin', 'https://foyue.org');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function parseRangeHeader(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1 };
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);

    // 先读对象元信息，后续按需决定是否走分段读取
    const object = await env.BUCKET.head(key);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = buildBaseHeaders(object);

    // 正确处理Range请求，确保206响应和实际返回体一致
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const parsedRange = parseRangeHeader(rangeHeader, object.size);
      if (!parsedRange) {
        headers.set('Content-Range', `bytes */${object.size}`);
        return new Response(null, { status: 416, headers });
      }

      const chunkSize = parsedRange.end - parsedRange.start + 1;
      const rangedObject = await env.BUCKET.get(key, {
        range: { offset: parsedRange.start, length: chunkSize }
      });
      if (!rangedObject) {
        headers.set('Content-Range', `bytes */${object.size}`);
        return new Response(null, { status: 416, headers });
      }

      headers.set('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${object.size}`);
      headers.set('Content-Length', String(chunkSize));

      return new Response(rangedObject.body, {
        status: 206,
        headers
      });
    }

    const fullObject = await env.BUCKET.get(key);
    if (!fullObject) {
      return new Response('Not Found', { status: 404, headers });
    }

    headers.set('Content-Length', String(object.size));
    return new Response(fullObject.body, { headers });
  }
};
