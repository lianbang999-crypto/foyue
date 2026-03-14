const fs = require('fs');
let s = fs.readFileSync('src/css/player.css', 'utf-8');

s = s.replace(/\.exp-progress-fill[\s\S]*?z-index:1\}/, ".exp-progress-fill{height:100%;background:var(--accent);border-radius:2px;width:100%;transform-origin:left center;transform:scaleX(0);will-change:transform;transition:transform .1s linear;position:relative;z-index:1}");
s = s.replace(/\.exp-progress-buffer[\s\S]*?width \.3s linear\}/, ".exp-progress-buffer{position:absolute;height:100%;background:var(--accent);opacity:.15;border-radius:2px;width:100%;transform-origin:left center;transform:scaleX(0);will-change:transform;transition:transform .3s linear}");

fs.writeFileSync('src/css/player.css', s);
