/**
 * Cloudflare Worker for audio.foyue.org
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

const RANGE_CACHE_WARM_MAX_SIZE = 32 * 1024 * 1024;
const RANGE_CACHE_WARM_MAX_CHUNK = 256 * 1024;

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

async function getObjectBody(bucket, candidateKeys, options) {
  for (const key of candidateKeys) {
    const object = await bucket.get(key, options);
    if (object) return { key, object };
  }
  return null;
}

function parseRequestedRange(rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { suffix };
  }

  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start) || start < 0) return null;

  if (!endRaw) {
    return { offset: start };
  }

  const end = Number.parseInt(endRaw, 10);
  if (!Number.isFinite(end) || end < start) return null;
  return { offset: start, length: end - start + 1 };
}

function normalizeRange(range, size) {
  if (!range) return null;

  if (typeof range.suffix === 'number') {
    const start = Math.max(size - range.suffix, 0);
    return { start, end: size - 1 };
  }

  const start = range.offset;
  if (start >= size) return null;

  if (typeof range.length === 'number') {
    return {
      start,
      end: Math.min(start + range.length - 1, size - 1)
    };
  }

  return { start, end: size - 1 };
}

function createCacheKey(request) {
  return new Request(request.url, { method: 'GET' });
}

function shouldWarmFullObjectFromRange(range, size) {
  const normalizedRange = normalizeRange(range, size);
  if (!normalizedRange) return false;
  if (size > RANGE_CACHE_WARM_MAX_SIZE) return false;
  if (normalizedRange.start !== 0) return false;
  return normalizedRange.end - normalizedRange.start + 1 <= RANGE_CACHE_WARM_MAX_CHUNK;
}

async function warmFullObjectCache(bucket, key, cache, cacheKey) {
  const fullObject = await bucket.get(key);
  if (!fullObject) return;

  const headers = buildBaseHeaders(fullObject);
  headers.set('Content-Length', String(fullObject.size));
  await cache.put(cacheKey, new Response(fullObject.body, { headers }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const bucketRequest = resolveBucketRequest(url.pathname, env);
    if (!bucketRequest) {
      return new Response('Not Found', { status: 404 });
    }

    const { bucket, candidateKeys } = bucketRequest;

    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' }
      });
    }

    const cache = caches.default;
    const cacheKey = createCacheKey(request);

    if (request.method === 'HEAD') {
      const resolvedHead = await getObjectHead(bucket, candidateKeys);
      if (!resolvedHead) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = buildBaseHeaders(resolvedHead.object);
      headers.set('Content-Length', String(resolvedHead.object.size));
      return new Response(null, { status: 200, headers });
    }

    // 正确处理Range请求，确保206响应和实际返回体一致
    const rangeHeader = request.headers.get('Range');
    const cachedResponse = await cache.match(rangeHeader ? request : cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (rangeHeader) {
      const parsedRange = parseRequestedRange(rangeHeader);
      if (!parsedRange) {
        const resolvedHead = await getObjectHead(bucket, candidateKeys);
        if (!resolvedHead) {
          return new Response('Not Found', { status: 404 });
        }

        const invalidHeaders = buildBaseHeaders(resolvedHead.object);
        invalidHeaders.set('Content-Range', `bytes */${resolvedHead.object.size}`);
        return new Response(null, { status: 416, headers: invalidHeaders });
      }

      const resolvedObject = await getObjectBody(bucket, candidateKeys, { range: parsedRange });
      if (!resolvedObject) {
        return new Response('Not Found', { status: 404 });
      }

      const normalizedRange = normalizeRange(parsedRange, resolvedObject.object.size);
      const headers = buildBaseHeaders(resolvedObject.object);
      if (!normalizedRange) {
        headers.set('Content-Range', `bytes */${resolvedObject.object.size}`);
        return new Response(null, { status: 416, headers });
      }

      const chunkSize = normalizedRange.end - normalizedRange.start + 1;
      headers.set('Content-Range', `bytes ${normalizedRange.start}-${normalizedRange.end}/${resolvedObject.object.size}`);
      headers.set('Content-Length', String(chunkSize));

      if (shouldWarmFullObjectFromRange(parsedRange, resolvedObject.object.size)) {
        ctx.waitUntil(warmFullObjectCache(bucket, resolvedObject.key, cache, cacheKey).catch(() => { }));
      }

      return new Response(resolvedObject.object.body, {
        status: 206,
        headers
      });
    }

    const resolvedObject = await getObjectBody(bucket, candidateKeys);
    if (!resolvedObject) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = buildBaseHeaders(resolvedObject.object);
    headers.set('Content-Length', String(resolvedObject.object.size));
    const response = new Response(resolvedObject.object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => { }));
    return response;
  }
};
