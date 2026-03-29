const fs = require('fs');

const jsPath = 'src/js/counter.js';
let js = fs.readFileSync(jsPath, 'utf8');

// The new pills use .is-active instead of .counter-tool-icon--active
js = js.replace(/function updateUI\(([^)]*)\) \{/g, `function updateUI($1) {
    const muyuBtn = view.querySelector('#counterMuyuToggle');
    if(muyuBtn) isMuyuEnabled() ? muyuBtn.classList.add('is-active') : muyuBtn.classList.remove('is-active');

    const dimmerBtn = view.querySelector('#counterDimmerToggle');
    if(dimmerBtn) isDimmerEnabled() ? dimmerBtn.classList.add('is-active') : dimmerBtn.classList.remove('is-active');
`);

js = js.replace(/btn\.classList\.toggle\('counter-tool-icon--active', /g, "btn.classList.toggle('is-active', ");

// Now also clean up the old CSS: remove old counter actions entirely from CSS\!
let css = fs.readFileSync('src/css/pages.css', 'utf8');
const actionCssRegex = /\.counter-actions\s*\{[^}]+\}\s*\.counter-action-btn\s*\{[^}]+\}\s*\.counter-action-btn:hover\s*\{[^}]+\}\s*(\.counter-action-btn svg\s*\{[^}]+\}\s*)*(\.counter-action-btn--[a-z0-9]+\s*\{[^}]+\}\s*)+/g;

fs.writeFileSync(jsPath, js);
