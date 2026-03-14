const fs = require('fs');
let s = fs.readFileSync('src/js/player.js', 'utf-8');

s = s.replace(/  dom\.expPlay\.innerHTML = icon;\s+'<rect .*? :.*?'<polygon .*?';/g, '  dom.expPlay.innerHTML = icon;');

fs.writeFileSync('src/js/player.js', s);
