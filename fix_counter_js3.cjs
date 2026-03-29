const fs = require('fs');
let js = fs.readFileSync('src/js/counter.js', 'utf8');

// Also clear out duplicate dimmerBtn
js = js.replace(/const dimmerBtn = view\.querySelector\('#counterDimmerToggle'\);\s+if\(dimmerBtn\)[^;]+;/g, '');

js = js.replace(/function updateUI\([^)]*\)\s*\{/, `function updateUI(data, view) {
    const dimmerBtn = view.querySelector('#counterDimmerToggle');
    if(dimmerBtn) isDimmerEnabled() ? dimmerBtn.classList.add('is-active') : dimmerBtn.classList.remove('is-active');
`);

fs.writeFileSync('src/js/counter.js', js);
