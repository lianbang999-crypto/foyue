/* ===== Shared Application State ===== */

export const state = {
  data: null,       // Audio data from JSON
  isDataFull: false,
  fullDataPromise: null,
  ensureFullData: null,
  ensureCategoryData: null,
  ensureSeriesDetail: null,
  contentRequestId: 0,
  tab: 'home',      // Current tab
  seriesId: null,   // Currently viewing series
  epIdx: -1,        // Current episode index
  playlist: [],     // Current playlist
  loopMode: 'all',  // Loop mode: all, one, shuffle
  isFirstVisit: false,
  networkWeak: false, // True when network is detected as weak (stall or slow connection)
};

export function beginContentRequest() {
  state.contentRequestId += 1;
  return state.contentRequestId;
}

export function isContentRequestCurrent(requestId) {
  return requestId === state.contentRequestId;
}

/** 获取当前正在播放的曲目，无有效播放时返回 null */
export function getCurrentTrack() {
  return state.epIdx >= 0 && state.playlist[state.epIdx] ? state.playlist[state.epIdx] : null;
}
