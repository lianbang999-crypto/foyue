/* ===== Audio Duration Cache ===== */
/* Lazily probes audio URLs for duration via Audio API and stores in unified store.
 * When the JSON data source already has a duration field the probe is skipped entirely.
 */
import { state } from './state.js';
import { get, patch } from './store.js';
import { getConnType } from './player.js';

// Reduce concurrency when audio is playing to avoid bandwidth competition
const MAX_CONCURRENT_IDLE = 3;
const MAX_CONCURRENT_PLAYING = 1;

function releaseProbeAudio(audio) {
  if (!audio) return;
  try {
    audio.pause?.();
    audio.removeAttribute?.('src');
    audio.src = '';
    audio.load?.();
  } catch { /* ignore */ }
}

/**
 * Get cached duration for a URL (seconds), or null if not cached.
 */
export function getCachedDuration(url) {
  const d = get('durations');
  return (d && d[url] != null) ? d[url] : null;
}

function collectKnownDurations(episodes, target) {
  if (!Array.isArray(episodes)) return target;
  episodes.forEach(ep => {
    if (!ep?.url || !ep.duration || !isFinite(ep.duration) || ep.duration <= 0) return;
    target[ep.url] = Math.round(ep.duration);
  });
  return target;
}

export function seedCachedDurationsFromEpisodes(episodes) {
  const next = collectKnownDurations(episodes, {});
  if (Object.keys(next).length) patch('durations', next);
}

export function seedCachedDurationsFromData(data) {
  const next = {};
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  categories.forEach(cat => {
    const seriesList = Array.isArray(cat?.series) ? cat.series : [];
    seriesList.forEach(series => collectKnownDurations(series?.episodes, next));
  });
  if (Object.keys(next).length) patch('durations', next);
}

/**
 * Probe a single audio URL for its duration.
 * Returns a Promise<number|null> (duration in seconds or null on failure).
 */
function probeOne(url) {
  const a = new Audio();
  a.preload = 'metadata';
  let settled = false;
  let timeoutId = 0;
  let resolvePromise = () => {};

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = 0;
    }
    a.removeEventListener('loadedmetadata', onLoadedMetadata);
    a.removeEventListener('error', onError);
    releaseProbeAudio(a);
  };

  const done = (val) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(val);
  };

  const onLoadedMetadata = () => {
    const d = a.duration;
    if (d && isFinite(d) && d > 0) {
      const rounded = Math.round(d);
      patch('durations', { [url]: rounded });
      done(rounded);
    } else {
      done(null);
    }
  };

  const onError = () => done(null);

  const promise = new Promise(resolve => {
    resolvePromise = resolve;
  });

  a.addEventListener('loadedmetadata', onLoadedMetadata);
  a.addEventListener('error', onError);
  timeoutId = setTimeout(() => done(null), 15000);
  a.src = url;

  return {
    promise,
    cancel() {
      done(null);
    }
  };
}

/**
 * Probe durations for an array of episodes.
 * Calls onDuration(idx, seconds) for each resolved duration.
 * Skips already-cached entries (calls onDuration immediately for those).
 * Runs at most MAX_CONCURRENT probes in parallel.
 * Returns a cleanup function to abort remaining probes.
 */
export function probeDurations(episodes, onDuration) {
  const durations = get('durations') || {};
  const queue = [];
  let aborted = false;
  const activeProbes = new Set();

  // Skip probing entirely when network is weak
  if (state.networkWeak) {
    // Still report cached durations (for episodes without JSON duration)
    episodes.forEach((ep, idx) => {
      if (ep.duration) return; // already in JSON — no need to probe
      const d = durations[ep.url];
      if (d) onDuration(idx, d);
    });
    return () => { };
  }

  // Immediately report cached durations; queue uncached episodes for probing
  episodes.forEach((ep, idx) => {
    if (ep.duration) return; // already in JSON — caller already has this value
    const d = durations[ep.url];
    if (d) {
      onDuration(idx, d);
    } else {
      queue.push(idx);
    }
  });

  // Nothing to probe
  if (!queue.length) return () => { };

  let running = 0;
  let qi = 0;

  function getMaxConcurrent() {
    // On cellular, always limit to 1 probe to save data
    if (getConnType() === 'cellular') return MAX_CONCURRENT_PLAYING;
    // If audio is playing, use lower concurrency to preserve bandwidth
    const audioEl = document.querySelector('#audioEl');
    if (audioEl && !audioEl.paused && audioEl.src) return MAX_CONCURRENT_PLAYING;
    return MAX_CONCURRENT_IDLE;
  }

  function next() {
    if (aborted) return;
    // Re-check network state each iteration
    if (state.networkWeak) return;
    const maxC = getMaxConcurrent();
    while (running < maxC && qi < queue.length) {
      const idx = queue[qi++];
      running++;
      const probe = probeOne(episodes[idx].url);
      activeProbes.add(probe);
      probe.promise.then(d => {
        running--;
        activeProbes.delete(probe);
        if (aborted) return;
        if (d) onDuration(idx, d);
        next();
      });
    }
  }
  next();

  return () => {
    aborted = true;
    activeProbes.forEach(probe => probe.cancel());
    activeProbes.clear();
  };
}
