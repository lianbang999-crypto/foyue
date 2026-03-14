const fs = require('fs');
let s = fs.readFileSync('src/js/player.js', 'utf-8');

const regex = /  dom\.expPlay\.innerHTML = icon;\n    '<rect[\s\S]*?8,20"\/>';/g;
s = s.replace(regex, '  dom.expPlay.innerHTML = icon;');

fs.writeFileSync('src/js/player.js', s);
