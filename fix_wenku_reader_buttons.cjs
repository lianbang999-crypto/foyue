const fs = require('fs');
let css = fs.readFileSync('src/css/wenku-page.css', 'utf-8');

// Replace .wk-font-btn
css = css.replace(/\.wk-font-btn \{[^}]+\}/g, `.wk-font-btn {
    flex: 1;
    appearance: none;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.2);
    background: transparent;
    color: inherit;
    padding: 10px;
    font-size: .85rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(.22, 1, .36, 1);
    border-radius: 12px;
}`);

// Replace .wk-mode-dot
css = css.replace(/\.wk-mode-dot \{[^}]+\}/g, `.wk-mode-dot {
    flex: 1;
    padding: 12px 8px;
    border-radius: 12px;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.15);
    font-size: .8rem;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s cubic-bezier(.22, 1, .36, 1);
    appearance: none;
}`);

// Replace .wk-mode-dot.active
css = css.replace(/\.wk-mode-dot\.active \{[^}]+\}/g, `.wk-mode-dot.active {
    box-shadow: inset 0 0 0 1.5px var(--wk-accent);
    color: var(--wk-accent);
    font-weight: 500;
    transform: translateY(-2px);
}`);

// Replace .wk-font-btn.active
css = css.replace(/\.wk-font-btn\.active \{[^}]+\}/g, `.wk-font-btn.active {
    box-shadow: inset 0 0 0 1.5px var(--wk-accent);
    color: var(--wk-accent);
    background: var(--wk-accent-light);
}`);

fs.writeFileSync('src/css/wenku-page.css', css);