const fs = require('fs');
let code = fs.readFileSync('src/js/pages-home.js', 'utf-8');

const target = "<div class=\"home-rec-sub\">${s.speaker || ''} · ${s.totalEpisodes} ${t('episodes')}</div>";
const replacement = "const playCountText = s.playCount ? ` \u00B7 ${s.playCount >= 10000 ? (s.playCount/10000).toFixed(1) + 'w' : s.playCount}${t('play_count_unit') || '\u6B21'}` : '';\n" + 
"        <div class=\"home-rec-sub\">${s.speaker || ''} · ${s.totalEpisodes} ${t('episodes')}${playCountText}</div>";

if (code.includes(target)) {
  // It's inside a template literal.
  // Wait, I can't put `const playCountText...` inside a template literal.
}

code = code.replace(
  "recList.innerHTML = picks.map(s => {",
  "recList.innerHTML = picks.map(s => {\n    const playCountText = s.playCount ? ` \\u00B7 ${s.playCount >= 10000 ? (s.playCount/10000).toFixed(1) + 'W' : s.playCount}${t('play_count_unit') || '\\u6B21'}` : '';"
);

code = code.replace(
  "<div class=\"home-rec-sub\">${s.speaker  "<div class=\"home-rec-sus}  "<div class=\"home-rec,
  "<div class=\"home-rec-sub\">${s.speaker  "<div class=\"htalEpisodes} ${t('episodes')}${playCountText}</div>"
);

fs.writeFileSync('src/js/pages-home.js', code);
console.log('Done');
