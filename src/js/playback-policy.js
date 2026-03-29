/* ===== Playback Policy ===== */

const SMALL_AUDIO_BYTES = 25 * 1024 * 1024;
const LARGE_AUDIO_BYTES = 120 * 1024 * 1024;
const SMALL_AUDIO_DURATION_S = 20 * 60;
const LARGE_AUDIO_DURATION_S = 90 * 60;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function getTrackMediaProfile(track) {
  const bytes = toFiniteNumber(
    track?.bytes
    ?? track?.size
    ?? track?.fileSize
    ?? track?.contentLength
  );
  const duration = toFiniteNumber(track?.duration);

  let mediaClass = 'medium';
  if ((bytes && bytes >= LARGE_AUDIO_BYTES) || (duration && duration >= LARGE_AUDIO_DURATION_S)) {
    mediaClass = 'large';
  } else if ((bytes && bytes <= SMALL_AUDIO_BYTES) || (duration && duration <= SMALL_AUDIO_DURATION_S)) {
    mediaClass = 'small';
  }

  if (!bytes && !duration) mediaClass = 'unknown';

  return {
    bytes,
    duration,
    mediaClass,
    hasExplicitBytes: bytes > 0,
    hasExplicitDuration: duration > 0,
  };
}

export function getPlaybackPolicy(input) {
  const {
    track,
    isApple,
    isInApp,
    online,
    connectionType,
    effectiveType,
    saveData,
    networkWeak,
  } = input;

  const profile = getTrackMediaProfile(track);
  const is2g = typeof effectiveType === 'string' && /(^|-)2g$/.test(effectiveType);
  const isWifi = connectionType === 'wifi';
  const canWarm = !saveData && !is2g;
  const isLargeOrUnknown = profile.mediaClass === 'large' || profile.mediaClass === 'unknown';
  const canBackgroundLoadWhenResolved = !isApple && !isInApp && isWifi && !saveData && effectiveType === '4g' && !networkWeak;

  return {
    profile,
    preferDirectPlayback: online !== false && (isApple || profile.mediaClass === 'large'),
    allowBlobCachePlayback: !isApple || online === false,
    allowNextTrackWarmup: canWarm && !networkWeak,
    allowAudioElementPreload: !isApple && !networkWeak && isWifi && !saveData && !is2g && profile.mediaClass === 'small',
    allowBackgroundFullLoadWhenResolved: canBackgroundLoadWhenResolved,
    allowBackgroundFullLoad: canBackgroundLoadWhenResolved && !isLargeOrUnknown,
    switchTimeoutMs: 8000,
    preloadedSwitchTimeoutMs: profile.mediaClass === 'small' ? 1200 : 1500,
  };
}
