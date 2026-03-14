const fs = require('fs');
let s = fs.readFileSync('src/js/main.js', 'utf-8');

s = s.replace(/dom\.centerPlayBtn\.classList\.add\('no-audio'\);/g, '');
s = s.replace(/dom\.centerPlayBtn\.addEventListener\('click'[\s\S]*?\}\);/g, '');
s = s.replace(/dom\.centerPlayBtn\.classList\.add\('buffering'\); /g, '');
s = s.replace(/dom\.centerPlayBtn\.classList\.remove\('buffering'\); /g, '');
fs.writeFileSync('src/js/main.js', s);
