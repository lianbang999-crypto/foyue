const fs = require('fs');

try {
  let s = fs.readFileSync('src/js/player.js', 'utf-8');
  s = s.replace(/dom\.miniProgressFill\.style\.width = '0%';/g, "dom.miniProgressFill.style.transform = 'scaleX(0)';");
  s = s.replace(/dom\.expProgressFill\.style\.width = '0%';/g, "dom.expProgressFill.style.transform = 'scaleX(0)';");
  s = s.replace(/dom\.expBufferFill\.style\.width = '0%';/g, "dom.expBufferFill.style.transform = 'scaleX(0)';");
  fs.writeFileSync('src/js/player.js', s);
} catch (e) {
  console.log(e);
}
