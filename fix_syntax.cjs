const fs = require('fs');
let s = fs.readFileSync('src/js/main.js', 'utf-8');

const badRegex = /\/\/ Center play button \- open expanded player[\s\S]*?dom\.expPlayer\.classList\.add\('show'\);\n    \}\n  \}\);\n/g;
s = s.replace(badRegex, '');

fs.writeFileSync('src/js/main.js', s);
