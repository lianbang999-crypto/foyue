/* ===== Audio Duration Cache ===== */
/* Lazily probes audio URLs for duration via Audio API and caches in unified store */
import { state } from './state.js';
import { getConnType } from './player.js';
import { getStoreDuration, setStoreDuration, saveStoreDurations } from './store.js';

// Reduce concurrency when audio is playing to avoid bandwidth competition
const MAX_CONCURRENT_IDLE = 3;
const MAX_CONCURRENT_PLAYING = 1;

/**
 * Get cached duration for a URL (seconds), or null if not cached.
 */
export function getCachedDuration(url) {
  return getStoreDuration(url);
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
        setStoreDuration(url, Math.round(d));
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
  const queue = [];
  let aborted = false;

  // Skip probing entirely when network is weak
  if (state.networkWeak) {
    // Still report cached durations (for episodes without JSON duration)
    episodes.forEach((ep, idx) => {
      if (ep.duration) return; // already in JSON — no need to probe
      const d = getStoreDuration(ep.url);
      if (d) onDuration(idx, d);
    });
    return () => {};
  }

  // Immediately report cached durations; queue uncached episodes for probing
  episodes.forEach((ep, idx) => {
    if (ep.duration) return; // already in JSON — caller already has this value
    const d = getStoreDuration(ep.url);
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
      probeOne(episodes[idx].url).then(d => {
        running--;
        if (aborted) return;
        if (d) {
          onDuration(idx, d);
        }
        next();
      });
    }
    // All done — final save (debounced saves from setStoreDuration are already scheduled)
    if (qi >= queue.length && running === 0) {
      saveStoreDurations();
    }
  }
  next();

  return () => {
    aborted = true;
    saveStoreDurations();
  };
}
