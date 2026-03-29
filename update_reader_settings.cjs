const fs = require('fs');
let css = fs.readFileSync('src/css/wenku-page.css', 'utf-8');

css = css.replace(/\.wk-reader-settings \{[^}]+\}/g, `.wk-reader-settings {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 28;
    padding: 24px 20px;
    padding-bottom: calc(24px + var(--wk-safe-bottom));
    background: var(--wk-bg-card);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    border-radius: 20px 20px 0 0;
    transform: translateY(100%);
    transition: transform .3s cubic-bezier(.22, 1, .36, 1), visibility 0s linear .3s;
    visibility: hidden;
    pointer-events: none;
}`);

fs.writeFileSync('src/css/wenku-page.css', css);
