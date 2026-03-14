const fs = require('fs');

['src/js/dom.js', 'src/js/player.js', 'src/js/main.js'].forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  // Remove lines containing centerPlayBtn, centerPlayIcon, centerRingFill
  content = content.split('\n').filter(line => !/centerPlayBtn/.test(line) && !/centerPlayIcon/.test(line) && !/centerRingFill/.test(line)).join('\n');
  fs.writeFileSync(file, content);
});
console.log('JS cleaned!');
