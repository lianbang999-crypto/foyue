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
  const version = cacheUrl.searchParams.get('v');
  cacheUrl.search = '';
  if (homeView) cacheUrl.searchParams.set('home', '1');
  if (version) cacheUrl.searchParams.set('v', version);
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export function buildCategoryCacheKey(url, { categoryId }) {
  const cacheUrl = new URL(url.toString());
  const version = cacheUrl.searchParams.get('v');
  cacheUrl.pathname = `/api/category/${encodeURIComponent(categoryId)}`;
  cacheUrl.search = '';
  if (version) cacheUrl.searchParams.set('v', version);
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export function buildPathCacheKey(url, { pathname, allowedSearchParams = [], extraSearchParams = {} } = {}) {
  const cacheUrl = new URL(url.toString());
  if (pathname) cacheUrl.pathname = pathname;

  const preservedEntries = [];
  for (const key of allowedSearchParams) {
    const value = cacheUrl.searchParams.get(key);
    if (value !== null && value !== '') preservedEntries.push([key, value]);
  }

  cacheUrl.search = '';

  for (const [key, value] of preservedEntries) {
    cacheUrl.searchParams.set(key, value);
  }

  for (const [key, value] of Object.entries(extraSearchParams)) {
    if (value === undefined || value === null || value === '') continue;
    cacheUrl.searchParams.set(key, String(value));
  }

  return new Request(cacheUrl.toString(), { method: 'GET' });
}

function isCacheableResponse(response) {
  if (!response.ok) return false;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !/(^|,|\s)(no-store|private|no-cache)(,|\s|$)/.test(cacheControl);
}

export async function getEdgeCachedJson(request, cacheKey, waitUntil, buildResponse) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.has('refresh') || url.searchParams.has('ts');
  const cache = caches.default;
  void waitUntil;
  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return withEdgeCacheHeader(cached, 'HIT');
  }

  const response = await buildResponse(request);
  if (isCacheableResponse(response)) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      // Ignore cache write failures and continue serving the fresh response.
    }
  }
  return withEdgeCacheHeader(
    response,
    !isCacheableResponse(response)
      ? 'BYPASS'
      : (forceRefresh ? 'REFRESH' : 'MISS')
  );
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
