const fs = require('fs');
let css = fs.readFileSync('src/css/pages.css', 'utf8');

const sStyles = `
/* ====== PILL ACTIONS ======= */
.counter-pill-actions { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 10px; margin-bottom: -15px; z-index: 10; }
.counter-pill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 99px; background: color-mix(in srgb, var(--bg-card) 50%, .counter-pill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 99px; background: color-mix(in srgb, var(--bg-card) 50%, .counter-pill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 99px; background: color-mix(in srgb, var(--bg-card) 50%, .counter-pill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 99px; background: color-mix(in srgb, var(--bg-card) 50%, .counter-pill-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; bordeor.counter-pill-btn { display: f.85; }
.counter-pill-btn.is-active { color: var(--accent); background: .counter-pill-btw).counter-pill-btn.is-active { cob,.counter-pill-btn.is-active { color: var(--accent); background: .counter-pill-btw).counter-pill-btn.is-active { cob,.counter-pill-btn.is-active { colentColor; flex-shrink: 0; }
`;

css += sStyles;
fs.writeFileSync('src/css/pages.css', css);
