const fs = require('fs');

let css = fs.readFileSync('src/css/pages.css', 'utf8');

const anchor = '/* ====== 药丸操作区/Pill Actions ======= */';
const idx = css.indexOf(anchor);

if (idx > -1) {
  css = css.substring(0, idx);
}

css += `/* ====== 药丸操作区/Pill Actions ======= */
.counter-pill-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-top: 10px;
    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg    marg   t    marg    marg    marg    mar(0.25, 1, 0.5, 1);
}

.counter-pill-btn:hover {
    background: color-m    background: color-m    background: color-m    background: color-m   an    background: color-m    back 6px 16px rgba(0,0,    background: color-m   btn:acti    background: color-m    background: color-m    backgr}

.counter-pill-btn.is-active {
    color: v    -accent);
    background: var(--accent-glow);
                  c                  c r(--accent) 30%, transparent);
    box-shadow: inset 0 0 8px color-mix(in srgb, var(--accent) 15%, transparent);
}

.counter-pill-btn svg {
    color: currentColor;
    flex-shrink: 0;
}
`;

fs.writeFileSync('src/css/pages.css', css);
console.log('Fixed CSS appending bug');
