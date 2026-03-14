const fs = require('fs');

try {
  let s = fs.readFileSync('src/js/player.js', 'utf-8');
  s = s.replace(/dom\.miniProgressFill\.style\.width = p \+ '%';/g, "dom.miniProgressFill.style.transform = `scaleX(${p / 100})`;");
  s = s.replace(/dom\.expProgressFill\.style\.width = p \+ '%';/g, "dom.expProgressFill.style.transform = `scaleX(${p / 100})`;");
  s = s.replace(/dom\.expBufferFill\.style\.width = Math\.min\(100, \(bufEnd \/ dur\) \* 100\) \+ '%';/g, "dom.expBufferFill.style.transform = `scaleX(${Math.min(1, bufEnd / dur)})`;");
  fs.writeFileSync('src/js/player.js', s);

  let utils = fs.readFileSync('src/js/utils.js', 'utf-8');
  utils = utils.replace(/dom\.expProgressFill\.style\.width = pct;/g, "dom.expProgressFill.style.transform = `scaleX(${p})`;");
  fs.writeFileSync('src/js/utils.js', utils);
} catch (e) {
  console.log(e);
}
