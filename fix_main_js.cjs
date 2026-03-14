const fs = require('fs');
let text = fs.readFileSync('src/js/main.js', 'utf-8');

text = text.replace("dom.centerPlayBtn.classList.add('no-audio');", "// removed");
text = text.replace("dom.centerPlayBtn.addEventListener('click', () => {", "/* dom.centerPlayBtn listener removed\ndom.centerPlayBtn.addEventListener('click', () => {");
text = text.replace("dom.centerPlayBtn.classList.add('buffering');", "");
text = text.replace("dom.centerPlayBtn.classList.remove('buffering');", "");

text = text.replace(/\/\/ Tap-to-retry on center play button.*?\}\);/s, "");

fs.writeFileSync('src/js/main.js', text);
