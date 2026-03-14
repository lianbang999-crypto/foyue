const fs = require('fs');
let s = fs.readFileSync('src/js/utils.js', 'utf-8');

s = s.replace(/dom\.expProgressFill\.style\.width = pct;/g, "dom.expProgressFill.style.transform = `scaleX(${p})`;");
fs.writeFileSync('src/js/utils.js', s);

s = fs.readFileSync('src/js/player.js', 'utf-8');

s = s.replace(/dom\.miniProgressFill\.style\.width = p \+ '%';/g, "dom.miniProgressFill.style.transform = `scaleX(${p / 100})`;");
s = s.replace(/dom\.expProgressFill\.style\.width = p \+ '%';/g, "dom.expProgressFill.style.transform = `scaleX(${p / 100})`;");
s = s.replace(/dom\.expBufferFill\.style\.width = Math\.min\(100, \(bufEnd \/ dur\) \* 100\) \+ '%';/g, "dom.expBufferFill.style.transform = `scaleX(${Math.min(1, bufEnd / dur)})`;");

fs.writeFileSync('src/js/player.js', s);

let css = fs.readFileSync('src/css/player.css', 'utf-8');
css = css.replace(/\.exp-progress-fill\{height:100%;background:var\(--accent\);border-radius:2px;width:0%;transition:width \.1s linear;/g, 
  ".exp-progress-fill{height:100%;background:var(--accent);border-radius:2p  ".exp-progress-fill{height:100%;background:var(rm:sc  ".exp-progress-fill{height:100%;background:var(--accent);border-radius:2p  ".exp-progress-fill{height:100%;backgro00  ".exp-progress-fill{height:100%;b-radiu  ".exp-progress-fill{height:100%;background:var ".mini-progress-fill{height:100%;background:var(--accent);border-radius:1px;width:100%;transform-origin:left center;transform:scaleX(0);will-change:transform;transition:transform 0.1s linear");
css = css.replace(/\.exp-progress-buffer\{height:100%;background:var\(--border-highlight\);border-radius:2px;width:0%;position:absolute;top:0;left:0;transition:width \.2s ease/g,
  ".exp-progress-buffer{height:100%;background:var(--border-highlight);border-radius:2px;width:100%;position:absolute;top:0;left:0;transform-origin:left center;transform:scaleX(0);will-change:transform;transition:transform 0.2s ease");
fs.writeFileSync('src/css/player.css', css);
