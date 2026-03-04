/* ===== Audio Duration Cache ===== */
/* Lazily probes audio URLs for duration via Audio API and caches in localStorage */

const STORAGE_KEY = 'foyue_duration_cache';
const MAX_CONCURRENT = 3;

let cache = null;

function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { cache = {}; }
  return cache;
}

function saveCache() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}

/**
 * Get cached duration for a URL (seconds), or null if not cached.
 */
export function getCachedDuration(url) {
  const c = loadCache();
  return c[url] ?? null;
}

/**
 * Probe a single audio URL for its duration.
 * Returns a Promise<number|null> (duration in seconds or null on failure).
 */
function probeOne(url) {
  return new Promise(resolve => {
    const a = new Audio();
    a.preload = 'metadata';
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      a.src = '';       // release network connection
      a.remove?.();
      resolve(val);
    };
    a.addEventListener('loadedmetadata', () => {
      const d = a.duration;
      if (d && isFinite(d) && d > 0) {
        const c = loadCache();
        c[url] = Math.round(d);
        cache = c;
        done(Math.round(d));
      } else {
        done(null);
      }
    });
    a.addEventListener('error', () => done(null));
    // Timeout after 15s per file
    setTimeout(() => done(null), 15000);
    a.src = url;
  });
}

/**
 * Probe durations for an array of episodes.
 * Calls onDuration(idx, seconds) for each resolved duration.
 * Skips already-cached entries (calls onDuration immediately for those).
 * Runs at most MAX_CONCURRENT probes in parallel.
 * Returns a cleanup function to abort remaining probes.
 */
export function probeDurations(episodes, onDuration) {
  const c = loadCache();
  const queue = [];
  let aborted = false;
  let saveTimer = null;

  // Immediately report cached durations
  episodes.forEach((ep, idx) => {
    const d = c[ep.url];
    if (d) {
      onDuration(idx, d);
    } else {
      queue.push(idx);
    }
  });

  // Nothing to probe
  if (!queue.length) return () => {};

  let running = 0;
  let qi = 0;

  function schedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCache, 2000);
  }

  function next() {
    if (aborted) return;
    while (running < MAX_CONCURRENT && qi < queue.length) {
      const idx = queue[qi++];
      running++;
      probeOne(episodes[idx].url).then(d => {
        running--;
        if (aborted) return;
        if (d) {
          onDuration(idx, d);
          schedSave();
        }
        next();
      });
    }
    // All done — final save
    if (qi >= queue.length && running === 0) {
      clearTimeout(saveTimer);
      saveCache();
    }
  }
  next();

  return () => {
    aborted = true;
    clearTimeout(saveTimer);
    saveCache();
  };
}
