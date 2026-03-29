const fs = require('fs');
let css = fs.readFileSync('src/css/pages.css', 'utf8');

// clean up old toggle buttons
css = css.replace(/\.counter-actions[\s\S]*?\}\s*\.counter-action-btn:hover[\s\S]*?\}/, '');

css += `\n
.counter-pill-actions { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 10px; margin-bottom: -15px; z-index: 10; }
.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.counter-pill-btn { display: flex; align-items: center; gap: 6px; pad.countesl.counter-pill-btn { display: f16px rgba(0,0,0,0.06); }
.counter-pill-btn:active { transform: translat.counter-pill-btn:active { trun.counter-pill-btn:active { transform: translat.counter-pill-btn:active { trun.counter-pill-btn:acr-mix(in srgb, var(--accent) 30%, transparent); box-shadow: inset 0 0 8px color-mix(in srgb, var(--accent) 15%, transparent); }
.counter-pill-btn svg { color: currentColor; flex-shrink: 0; }
`;
fs.writeFileSync('src/css/pages.css', css);
