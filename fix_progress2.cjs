const fs = require('fs');
let s = fs.readFileSync('src/js/player.js', 'utf-8');

s = s.replace(/dom\.miniProgressFill\.style\.width = p \+ '%';/g, "dom.miniProgressFill.style.transform = `scaleX(${p / 100})`;");
s = s.replace(/dom\.expProgressFill\.style\.width = p \+ '%';/g, "dom.expProgressFill.style.transform = `scaleX(${p / 100})`;");
s = s.replace(/dom\.expProgressThumb\.style\.left = p \+ '%';/g, "dom.expProgressThumb.style.left = p + '%';");

// also fix the ones scattered elsewhere
s = s.replace(/dom\.miniProgressFill\.style\.width = '0%';/g, "dom.miniProgressFill.style.transform = 'scaleX(0)';");
s = s.replace(/dom\.expProgressFill\.style\.width = '0%';/g, "dom.expProgressFill.style.transform = 'scaleX(0)';");
s = s.replace(/dom\.expBufferFill\.style\.width = '0%';/g, "dom.expBufferFill.style.transform = 'scaleX(0)';");

s = s.replace(/dom\.expBufferFill\.style\.width = Math\.min\(100, \(bufEnd \/ dur\) \* 100\) \+ '%';/g, "dom.expBufferFill.style.transform = `scaleXs = s.replace(/dom\.expBuur)})`;")s = s.replace(/dom\.expB/js = s.replace(/dom\.expBufferFill\.style\.width = M/js/s = s.replace(/dom\.expBufferFill\.style\.width = Math\.min\(100, \(bufEnd \/ dur\) \* 100\) \+ '%';/g, "dom.expBufferFill.style.scaleX(${p})`;");
fs.writeFileSync('src/js/utils.js', utils);

