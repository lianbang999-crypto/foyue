/* ===== Playback Policy ===== */

const SHORT_AUDIO_DURATION_S = 15 * 60;

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

  const mediaClass = duration > 0 && duration <= SHORT_AUDIO_DURATION_S ? 'short' : 'long';

  return {
    bytes,
    duration,
    mediaClass,
    hasExplicitBytes: bytes > 0,
    hasExplicitDuration: duration > 0,
  };
}

export function getPlaybackPolicy(input) {
  const { track } = input;
  const profile = getTrackMediaProfile(track);

  return {
    profile,
    shouldFullLoadCurrent: profile.mediaClass === 'short',
    shouldWarmCurrentWindow: profile.mediaClass === 'long',
    shouldWarmNextTrack: profile.mediaClass === 'long',
    switchTimeoutMs: 8000,
    preloadedSwitchTimeoutMs: profile.mediaClass === 'short' ? 1200 : 1500,
  };
}
