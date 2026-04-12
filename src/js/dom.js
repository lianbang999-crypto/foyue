/* ===== DOM References ===== */
const $ = (id) => document.getElementById(id);

// Lazy-initialized references
let refs = null;

export function initDOM() {
  refs = {
    audio: $('audioEl'),
    header: document.querySelector('.header') || document.querySelector('header'),
    contentArea: $('contentArea'),
    loader: $('loader'),
    playerBar: $('playerBar'),
    expPlayer: $('expPlayer'),
    miniProgressFill: $('miniProgressFill'),
    miniProgress: $('miniProgress'),
    playerTrack: $('playerTrack'),
    playerSub: $('playerSub'),
    btnPlay: $('btnPlay'),
    playerInfo: $('playerInfo'),
    expTitle: $('expTitle'),
    expProgressFill: $('expProgressFill'),
    expProgressThumb: $('expProgressThumb'),
    expBufferFill: $('expBufferFill'),
    expProgressBar: $('expProgressBar'),
    expTimeCurr: $('expTimeCurr'),
    expTimeTotal: $('expTimeTotal'),
    expPlay: $('expPlay'),
    expCollapse: $('expCollapse'),
    expQueue: $('expQueue'),
    expDownload: $('expDownload'),
    expPlayerContent: $('expPlayerContent'),
    playlistPanel: $('playlistPanel'),
    plItems: $('plItems'),
    plCount: $('plCount'),
    centerPlayBtn: $('centerPlayBtn'),
    centerPlayIcon: $('centerPlayIcon'),
    centerRingFill: $('centerRingFill'),
    navAudioIndicator: $('navAudioIndicator'),
    expSeriesInfo: $('expSeriesInfo'),
    expSeriesName: $('expSeriesName'),
    expSeriesSpeaker: $('expSeriesSpeaker'),
    expSeriesEpCount: $('expSeriesEpCount'),
  };
  return refs;
}

export function getDOM() {
  return refs;
}

export const RING_CIRCUMFERENCE = 2 * Math.PI * 25; // r=25, circumference ≈ 157
