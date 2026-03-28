export function json(data, cors, status = 200, cacheControl) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl || (status === 200 ? 'public, max-age=300' : 'no-cache'),
      ...cors,
    },
  });
}

export function buildCategoriesCacheKey(url, { homeView }) {
  const cacheUrl = new URL(url.toString());
  cacheUrl.search = '';
  if (homeView) cacheUrl.searchParams.set('home', '1');
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export function buildCategoryCacheKey(url, { categoryId }) {
  const cacheUrl = new URL(url.toString());
  cacheUrl.pathname = `/api/category/${encodeURIComponent(categoryId)}`;
  cacheUrl.search = '';
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export async function getEdgeCachedJson(request, cacheKey, waitUntil, buildResponse) {
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return withEdgeCacheHeader(cached, 'HIT');

  const response = await buildResponse(request);
  if (response.ok) {
    const cacheWrite = cache.put(cacheKey, response.clone());
    if (typeof waitUntil === 'function') waitUntil(cacheWrite);
    else await cacheWrite;
  }
  return withEdgeCacheHeader(response, 'MISS');
}

export function withEdgeCacheHeader(response, status) {
  const headers = new Headers(response.headers);
  headers.set('X-Edge-Cache', status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
