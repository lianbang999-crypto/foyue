const fs = require('fs');
let s = fs.readFileSync('src/js/main.js', 'utf-8');

const str = `
  // Pill player - open expanded player
  dom.playerBar.addEventListener('click', (e) => {
    // ignore if clicking inner buttons
    if (e.target.closest('button')) return;
    haptic();
    if (!dom.audio.src && !state.playlist.length) return;
    if (dom.audio.src) {
      if (!dom.expPlayer.classList.contains('show')) {
        dom.expPlayer.classList.add('show');
      }
    } else {
      playPlaylistAudio(0);
    }
  });
`;

s = s.replace(/\/\/ Controls/g, str + '\n  // Controls');
fs.writeFileSync('src/js/main.js', s);
