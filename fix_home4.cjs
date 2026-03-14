const fs = require('fs');
let code = fs.readFileSync('src/js/pages-home.js', 'utf8');
code = code.split('recList.innerHTML = picks.map(s => {').join('recList.innerHTML = picks.map(s => {\n    const pc = s.playCount ? " · " + (s.playCount>=10000?(s.playCount/10000).toFixed(1)+"w":s.playCount) + (t("play_count_unit")||"次") : "";');
code = code.split('<div class="home-rec-sub">${s.speaker || \'\'} · ${s.totalEpisodes} ${t(\'episodes\')}</div>').join('<div class="home-rec-sub">${s.speaker || \'\'} · ${s.totalEpisodes} ${t(\'episodes\')}${pc}</div>');
fs.writeFileSync('src/js/pages-home.js', code);
