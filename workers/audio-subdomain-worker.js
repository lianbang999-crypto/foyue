/**
 * Cloudflare Worker for audio.foyue.org and opus.foyue.org
 * 为音频子域名添加正确的HTTP响应头
 */

const BUCKET_BINDING_BY_ID = {
  '7be57e30faae4f81bbd76b61006ac8fc': 'DAANFASHI',
  '8c99ae05414d4672b1ec08a569ab3299': 'FOHAO',
  '7a334cb009c14e10bbcfee54bb593a2a': 'YINGUANGDASHI',
  '05d3db9f377146d5bb450025565f7d1b': 'JINGTUSHENGXIAN',
  '772643034503463d9b954f0eea5ce80b': 'YOUSHENGSHU',
  '09eef2d346704b409a5fbef97ce6464a': 'JINGDIANDUSONG',
};

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

function resolveBucketRequest(pathname, env) {
  const rawPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const slashIndex = rawPath.indexOf('/');
  if (slashIndex <= 0) return null;

  const bucketId = rawPath.slice(0, slashIndex);
  const rawKey = rawPath.slice(slashIndex + 1);
  const bindingName = BUCKET_BINDING_BY_ID[bucketId];
  if (!bindingName || !rawKey) return null;

  const bucket = env[bindingName];
  if (!bucket) return null;

  const candidateKeys = [];
  try {
    const decodedKey = decodeURIComponent(rawKey);
    if (decodedKey) candidateKeys.push(decodedKey);
  } catch {
    // Ignore malformed encodings and fall back to the raw key.
  }
  if (!candidateKeys.includes(rawKey)) candidateKeys.push(rawKey);

  return { bucket, candidateKeys };
}

async function getObjectHead(bucket, candidateKeys) {
  for (const key of candidateKeys) {
    const object = await bucket.head(key);
    if (object) return { key, object };
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const bucketRequest = resolveBucketRequest(url.pathname, env);
    if (!bucketRequest) {
      return new Response('Not Found', { status: 404 });
    }

    const { bucket, candidateKeys } = bucketRequest;

    // 先读对象元信息，后续按需决定是否走分段读取
    const resolvedObject = await getObjectHead(bucket, candidateKeys);
    if (!resolvedObject) {
      return new Response('Not Found', { status: 404 });
    }

    const { key, object } = resolvedObject;

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
      const rangedObject = await bucket.get(key, {
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

    const fullObject = await bucket.get(key);
    if (!fullObject) {
      return new Response('Not Found', { status: 404, headers });
    }

    headers.set('Content-Length', String(object.size));
    return new Response(fullObject.body, { headers });
  }
};
