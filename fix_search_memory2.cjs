const fs = require('fs');
let s = fs.readFileSync('src/js/search.js', 'utf8');
if (!s.includes('getHistory')) s = s.replace("import { playList } from './player.js';", "import { playList } from './player.js';\nimport { getHistory } from './history.js';");
s = s.replace('          playList(r.series.episodes, r.idx, r.series);', '          const hist = getHistory();\n          const hEntry = hist.find(h => h.seriesId === r.series.id && h.epIdx === r.idx);\n          playList(r.series.episodes, r.idx, r.series, hEntry ? hEntry.time : 0);');
s = s.replace('        playList(r.series.episodes, r.idx, r.series);', '        const hist = getHistory();\n        const hEntry = hist.find(h => h.seriesId === r.series.id && h.epIdx === r.idx);\n        playList(r.series.episodes, r.idx, r.series, hEntry ? hEntry.time : 0);');
fs.writeFileSync('src/js/search.js', s);
