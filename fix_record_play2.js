const fs = require('fs');

let player = fs.readFileSync('src/js/player.js', 'utf-8');

if (!player.includes('let _hasRecordedPlay = false;')) {
  player = player.replace('let stallRetries = 0;', 'let stallRetries = 0;\nlet _hasRecordedPlay = false;');
}

const rgx = /\s*\/\/\s*Record play to D1 database[^\n]*\n\s*recordPlay\([^)]+\);\n/g;
player = player.replace(rgx, '\n');

if (!player.includes('_hasRecordedPlay = false;')) {
    player = player.replace('function playCurrent(autoPlay = true) {', 'function playCurrent(autoPlay = true) {\n  _hasRecordedPlay = false;');
}

const timeTarget = "saveState();\n  }";
const timeInject = `saveState();
  }

  if (!_hasRecordedPlay && dom.audio.currentTime > Math.min(10, dom.audio.duration * 0.1 || 10)) {
    _hasRecordedPlay = true;
    if (state.epIdx >= 0 && state.playlist[state.epIdx]) {
      const tr = state.playlist[state.epIdx];
      recordPlay(tr.seriesId, tr.id || state.epIdx + 1);
    }
  }`;

if (player.includes(timeTarget) && !player.includes('_hasRecordedif (player.includes(timeer if (player.includes(timeTarget) && !player.includes('_hasSynif (player.includes(timeTarget) && !player.includes('_hdPlay successfully!');
