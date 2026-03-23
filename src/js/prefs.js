import { get as storeGet, patch as storePatch } from './store.js';

const HIDE_PUBLIC_PLAY_COUNT_CLASS = 'hide-public-play-count';

function syncClass(hidden) {
  document.documentElement.classList.toggle(HIDE_PUBLIC_PLAY_COUNT_CLASS, !!hidden);
}

export function getHidePublicPlayCount() {
  return !!(storeGet('preferences') || {}).hidePublicPlayCount;
}

export function setHidePublicPlayCount(hidden) {
  const value = !!hidden;
  storePatch('preferences', { hidePublicPlayCount: value });
  syncClass(value);
}

syncClass(getHidePublicPlayCount());
