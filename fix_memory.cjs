const fs = require('fs');

// 1. Fix player.js InvalidStateError
let player = fs.readFileSync('src/js/player.js', 'utf-8');
const oldSeekLogic = `  if (dom.audio.readyState >= 2) {
    tryPlay();
  } else {
    if (seekTime > 0) dom.audio.currentTime = seekTime;
    dom.audio.play().then(() => {`;
const newSeekLogic = `  if (dom.audio.readyState >= 2) {
    tryPlay();
  } else {
    if (seekTime > 0) {
      dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = seekTime; }, { once: true });
    }
    dom.audio.play().then(() => {`;
if (player.includes(oldSeekLogic)) {
    player = player.replace(oldSeekLogic, newSeekLogic);
    fs.writeFileSync('src/js/player.js', player);
}

// 2. Fix pages-category.js to inject time
let cat = fs.readFileSync('src/js/pages-category.js', 'utf-8');
const oldTapLogic = `    li.addEventListener('click', () => {
      if (isCurrentTrack(series.id, idx)) { togglePlay(); return; }
      playList(series.episodes, idx, series);
                                                         lick', () => {
      if (isCurrentTrack(series.id, idx)) { togglePlay(); return; }
      const hist = getHistory();
      const hEntry = hist.find(h => h.seriesId === series.id && h.epIdx === idx);
      const playTime = hEntry ? hEntry.ti      const playTime = hEntry ? hEod      const playTime = hEntry ? hEntry.ti      const plol      const p
          ca          ca           newTapLogic);
    fs.writeFileSync('src/js/pages-category.js', cat);
}

console.log('Fixed memory resuming');
