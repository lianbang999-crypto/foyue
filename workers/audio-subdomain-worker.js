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

// P1修复：全量预热阈值提升至 50MB，覆盖更多法音文件
const RANGE_CACHE_WARM_MAX_SIZE = 50 * 1024 * 1024;
const SMALL_FILE_CACHE_WARM_MAX_SIZE = 20 * 1024 * 1024;
// P1修复：首次 Range 触发全量预热的最大块扩大至 1MB（原 256KB）
const RANGE_CACHE_WARM_MAX_CHUNK = 1 * 1024 * 1024;
const WORKER_CACHE_HEADER = 'X-Audio-Worker-Cache';
const WORKER_CACHE_DETAIL_HEADER = 'X-Audio-Worker-Cache-Detail';

function buildBaseHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', 'https://foyue.org');
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, ETag, Age, CF-Cache-Status, X-Audio-Worker-Cache, X-Audio-Worker-Cache-Detail');
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

function createNormalizedUrl(requestUrl) {
  const url = new URL(requestUrl);
  url.search = '';
  return url.toString();
}

function createCacheKey(request) {
  return new Request(createNormalizedUrl(request.url), { method: 'GET' });
}

function createRangeLookupRequest(request) {
  const headers = new Headers();
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) headers.set('Range', rangeHeader);

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);

  const ifModifiedSince = request.headers.get('If-Modified-Since');
  if (ifModifiedSince) headers.set('If-Modified-Since', ifModifiedSince);

  return new Request(createNormalizedUrl(request.url), {
    method: 'GET',
    headers,
  });
}

function shouldWarmFullObjectFromRange(range, size) {
  const normalizedRange = normalizeRange(range, size);
  if (!normalizedRange) return false;
  if (size <= SMALL_FILE_CACHE_WARM_MAX_SIZE) return true;
  if (size > RANGE_CACHE_WARM_MAX_SIZE) return false;
  if (normalizedRange.start > RANGE_CACHE_WARM_MAX_CHUNK) return false;
  return normalizedRange.end - normalizedRange.start + 1 <= RANGE_CACHE_WARM_MAX_CHUNK;
}

async function warmFullObjectCache(bucket, key, cache, cacheKey) {
  const fullObject = await bucket.get(key);
  if (!fullObject) return;

  const headers = buildBaseHeaders(fullObject);
  headers.set('Content-Length', String(fullObject.size));
  await cache.put(cacheKey, new Response(fullObject.body, { headers }));
}

function withWorkerCacheStatus(response, status, detail) {
  const headers = new Headers(response.headers);
  headers.set(WORKER_CACHE_HEADER, status);
  if (detail) headers.set(WORKER_CACHE_DETAIL_HEADER, detail);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function logCacheFailure(action, error) {
  console.warn(`[audio-cache] ${action} failed`, error);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const bucketRequest = resolveBucketRequest(url.pathname, env);
    if (!bucketRequest) {
      return new Response('Not Found', { status: 404 });
    }

    const { bucket, candidateKeys } = bucketRequest;

    // OPTIONS 预检请求（浏览器 fetch cors 模式会发送）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://foyue.org',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD, OPTIONS' }
      });
    }

    const cache = caches.default;
    const cacheKey = createCacheKey(request);
    const rangeLookupRequest = request.headers.get('Range') ? createRangeLookupRequest(request) : null;

    if (request.method === 'HEAD') {
      // P2修复：优先从全量缓存中提取元数据，避免每次都回源 R2
      const cachedFull = await cache.match(cacheKey);
      if (cachedFull) {
        const headers = new Headers();
        for (const [k, v] of cachedFull.headers) headers.set(k, v);
        headers.set(WORKER_CACHE_HEADER, 'HIT');
        headers.set(WORKER_CACHE_DETAIL_HEADER, 'head-from-full');
        return new Response(null, { status: 200, headers });
      }

      const resolvedHead = await getObjectHead(bucket, candidateKeys);
      if (!resolvedHead) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = buildBaseHeaders(resolvedHead.object);
      headers.set('Content-Length', String(resolvedHead.object.size));
      headers.set(WORKER_CACHE_HEADER, 'MISS');
      headers.set(WORKER_CACHE_DETAIL_HEADER, 'head-from-r2');
      return new Response(null, { status: 200, headers });
    }

    // 正确处理Range请求，确保206响应和实际返回体一致
    const rangeHeader = request.headers.get('Range');

    if (!rangeHeader) {
      // 无 Range：直接查全量缓存
      const cachedFull = await cache.match(cacheKey);
      if (cachedFull) return withWorkerCacheStatus(cachedFull, 'HIT', 'full');
    } else {
      // Cloudflare 会基于完整对象缓存自动处理 Range 响应。
      const cachedRange = await cache.match(rangeLookupRequest);
      if (cachedRange) return withWorkerCacheStatus(cachedRange, 'HIT', 'range-from-full');

      const cachedFull = await cache.match(cacheKey);
      if (cachedFull) {
        const fullSize = parseInt(cachedFull.headers.get('content-length') || '0', 10);
        // 仅对合理大小的全量缓存执行内存切片（避免 OOM）
        if (fullSize > 0 && fullSize <= RANGE_CACHE_WARM_MAX_SIZE) {
          const parsedRange = parseRequestedRange(rangeHeader);
          if (parsedRange) {
            const normalizedRange = normalizeRange(parsedRange, fullSize);
            if (normalizedRange) {
              const buffer = await cachedFull.arrayBuffer();
              const slice = buffer.slice(normalizedRange.start, normalizedRange.end + 1);
              const headers = new Headers();
              for (const [k, v] of cachedFull.headers) headers.set(k, v);
              headers.set('Content-Range', `bytes ${normalizedRange.start}-${normalizedRange.end}/${fullSize}`);
              headers.set('Content-Length', String(slice.byteLength));
              return withWorkerCacheStatus(
                new Response(slice, { status: 206, headers }),
                'HIT',
                'range-manual-slice'
              );
            }
          }
        }
      }
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
        ctx.waitUntil(
          warmFullObjectCache(bucket, resolvedObject.key, cache, cacheKey)
            .catch((error) => logCacheFailure('warm-full-object', error))
        );
      }

      const rangeResponse = new Response(resolvedObject.object.body, {
        status: 206,
        headers
      });
      return withWorkerCacheStatus(
        rangeResponse,
        'MISS',
        shouldWarmFullObjectFromRange(parsedRange, resolvedObject.object.size)
          ? 'range-r2-warm-scheduled'
          : 'range-r2-pass-through'
      );
    }

    const resolvedObject = await getObjectBody(bucket, candidateKeys);
    if (!resolvedObject) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = buildBaseHeaders(resolvedObject.object);
    headers.set('Content-Length', String(resolvedObject.object.size));
    const response = new Response(resolvedObject.object.body, { headers });
    ctx.waitUntil(
      cache.put(cacheKey, response.clone())
        .catch((error) => logCacheFailure('store-full-object', error))
    );
    return withWorkerCacheStatus(response, 'MISS', 'full-r2-store-scheduled');
  }
};
