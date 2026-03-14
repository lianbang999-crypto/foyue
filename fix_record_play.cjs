const fs = require('fs');

let player = fs.readFileSync('src/js/player.js', 'utf-8');

// add _hasRecordedPlay near variables
if (!player.includes('let _hasRecordedPlay = false;')) {
  player = player.replace('let stallRetries = 0;', 'let stallRetries = 0;\nlet _hasRecordedPlay = false; // Add for accurate play tracking');
}

// Remove immediate recordPlay
player = player.replace(/\s*\/\/\s*Record play to D1 database.*\n\s*recordPlay\(tr\.seriesId.*?;\n/g, '');

// In playCurrent, reset _hasRecordedPlay
if (!player.includes('_hasRecordedPlay = false;')) {
    player = player.replace('function playCurrent(autoPlay = true) {', 'function playCurrent(autoPlay = true) {\n  _hasRecordedPlay = false;');
    player = player.replace('function playCurrent(autoPlay = false) {', 'function playCurrent(autoPlay = false) {\n  _hasRecordedPlay = false;');
}

// Inject in onTimeUpdate
const timeUpdateTarget = 'saveState();\n  }';
const trackingLogic = `saveState();
  }

  // Exact Playback Calculation (Task 2): Only increment  // Exact Playback Calcens past 10 seconds or 10% of track
  if (!_hasRecordedPlay &&   if (!_hasRecordedPlay &&   if (!_h do  if (!_hasRecordedPlay &&   if (!_hasRecordedPlay &&   true;
    if (state.epIdx >= 0 && state.playlist[state.epIdx]) {
      const tr = state.playlist[state.epIdx];
      recordPlay(tr.seriesId, tr.id || state.epIdx + 1);
    }
  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }  }
  player = player.replace(timeUpdateTarget, trackingLogic);
}

fs.writeFileSync('src/js/player.js', player);
console.log('Fixed recordPlay logic for accurate calculation');
