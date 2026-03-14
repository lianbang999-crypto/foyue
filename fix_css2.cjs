const fs = require('fs');
let pillCss = fs.readFileSync('src/css/pill.css', 'utf-8');

let playerCss = fs.readFileSync('src/css/player.css', 'utf-8');
playerCss = playerCss.replace(/\.player\s*\{[^\}]*\}/g, pillCss);
fs.writeFileSync('src/css/player.css', playerCss);

// Clean layout
let layoutCss = fs.readFileSync('src/css/layout.css', 'utf-8');
layoutCss = layoutCss.replace(/\.tab-center\s*\{[^}]*\}/g, '');
layoutCss = layoutCss.replace(/\.center-play-btn[^}]*\}/g, '');
layoutCss = layoutCss.replace(/\.center-play-btn\.[\w-]+[^}]*\}/g, '');
layoutCss = layoutCss.replace(/\.center-play-btn:\w+[^}]*\}/g, '');
layoutCss = layoutCss.replace(/\.center-play-btn[^{]*\{[^}]*\}/g, '');
fs.writeFileSync('src/css/layout.css', layoutCss);
