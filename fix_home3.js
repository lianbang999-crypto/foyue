const fs = require('fs');
let content = fs.readFileSync('src/js/pages-home.js', 'utf8');

content = content.replace(
  'recList.innerHTML = picks.map(s => {',
  'recList.innerHTML = picks.map(s => {\n    const pc = s.playCount ? " · " + (s.playCount>=10000?(s.playCount/10000).toFixed(1)+"w":s.playCount) + (t("play_count_unit")||"次") : "";'
);

content = content.replace(
  '<div class="home-rec-sub">${s.speaker || \'\'} · ${s.totalEpisodes} ${t(\'episodes\')}</div>',
  '<div class="home-rec-sub">${s.speaker || \'\'} · ${s.totalEpisodes} ${t(\'episodes\')}${pc}</div>'
);

fs.writeFileSync('src/js/pages-home.js', content);
