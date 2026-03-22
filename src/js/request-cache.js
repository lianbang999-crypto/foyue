/* ===== Shared Request Cache ===== */

export function createRequestCache({ ttlMs = 5 * 60 * 1000, maxEntries = Infinity } = {}) {
  const cache = new Map();
  const pending = new Map();

  function get(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > ttlMs) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function set(key, data) {
    if (cache.size >= maxEntries) {
      let oldestKey = null;
      let oldestTs = Infinity;
      for (const [k, v] of cache) {
        if (v.ts < oldestTs) {
          oldestTs = v.ts;
          oldestKey = k;
        }
      }
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(key, { data, ts: Date.now() });
  }

  function dedupe(key, fetcher) {
    if (pending.has(key)) return pending.get(key);
    const promise = fetcher().finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  return { get, set, dedupe };
}

export function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
