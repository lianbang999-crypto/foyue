/* ===== D1 API Service ===== */

const API_BASE = '/api';

/**
 * Record a play event for a series/episode
 * Called when a new episode starts playing
 */
export async function recordPlay(seriesId, episodeNum) {
  try {
    const r = await fetch(`${API_BASE}/play-count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesId, episodeNum }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null; // Silently fail - don't interrupt playback
  }
}

/**
 * Get play counts for a series and its episodes
 */
export async function getPlayCount(seriesId) {
  try {
    const r = await fetch(`${API_BASE}/play-count/${encodeURIComponent(seriesId)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Send appreciation for a series (1 per day per user)
 */
export async function appreciate(seriesId) {
  try {
    const r = await fetch(`${API_BASE}/appreciate/${encodeURIComponent(seriesId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Get global stats
 */
export async function getStats() {
  try {
    const r = await fetch(`${API_BASE}/stats`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
