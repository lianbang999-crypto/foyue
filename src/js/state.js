/* ===== Shared Application State ===== */

export const state = {
  data: null,       // Audio data from JSON
  tab: 'home',      // Current tab
  seriesId: null,   // Currently viewing series
  epIdx: -1,        // Current episode index
  playlist: [],     // Current playlist
  loopMode: 'all',  // Loop mode: all, one, shuffle
  isFirstVisit: false,
  networkWeak: false, // True when network is detected as weak (stall or slow connection)
};
