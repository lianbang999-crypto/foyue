const fs = require('fs');
let js = fs.readFileSync('src/js/counter.js', 'utf8');

// The replacement was duplicated due to previous issues or the previous replace was malformed.
// We will manually clear out the duplicate declaration block.
js = js.replace(/const muyuBtn = view\.querySelector\('#counterMuyuToggle'\);\s+if\(muyuBtn\)[^;]+;/g, '');

js = js.replace(/function updateUI\([^)]*\)\s*\{/, `function updateUI(data, view) {
    const muyuBtn = view.querySelector('#counterMuyuToggle');
    if(muyuBtn) isMuyuEnabled() ? muyuBtn.classList.add('is-active') : muyuBtn.classList.remove('is-active');
`);

fs.writeFileSync('src/js/counter.js', js);
