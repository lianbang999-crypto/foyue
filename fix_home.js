const fs = require('fs');
let code = fs.readFileSync('src/js/pages-home.js', 'utf-8');

// The fallback cards around line 185
if (!code.includes('s.playCount ?')) {
  code = code.replace(
    /return `\s*<div class="home-rec-card"/g,
    `const playCountText = s.playCount ? \` \u00B7 \${s.playCount >= 10000 ? (s.playCount/10000).toFixed(1) + 'w' : s.playCount}\${t('play_count_unit') || '\u6B21'}\` : '';
    return \`
    <div class="home-rec-card"`
  );

  code = code.replace(
    /\$\{s\.totalEpisodes\} \$\{t\('episodes'\)\}<\/div>/g,
    `\${s.totalEpisodes} \${t('episodes')}\${playCountText}</div>`
  );
}

fs.writeFileSync('src/js/pages-home.js', code);
console.log('Fixed pages-home.js');
