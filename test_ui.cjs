const fs = require('fs');
const cssPath = 'src/css/pages.css';
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Header minimalism
css = css.replace(
`.counter-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdrop-filter: blu    -webkit-backdr:     -webkit-backdrop-filter: b      -webkit-backdrop-filter: blu    -web-fo    -webkit-backdrop-filter: blu    -webkit-backs,     -webkit-backdrop-fou    -webkit-backd
                  
                  :                   :    :                   :       background: color-mix(in srgb, var(--accent-glow) 30%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    color: var(--text-secondary);
    font-size: .75rem;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-zh);
    padding: 10px 16px;
    border-radius: 20px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: all .2s cubic-bezier(0.25, 1, 0.5, 1);
}`
);

// 3. Huixiang Primary button (big red/gold button usually)
css = css.replace(
`.counter-huixiang-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
    color: var(--bg);
    border: none;
    box-shadow: 0 8px 24px var(--accent-shadow), 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: transform .15s cubic-b    transition: transform .15s cubic-b    transition: transform .15s cubic-b    transition: transform .15s cubic-b    transition: transfor-c    transition: transform .15s cubic-b    transition: transform .15s cubpx    transition: transform .15s ct(    transition: transgl    transition: tra       transar(--accent);
    border: 1px solid var(--accent);
    box-shadow: 0 4px 20px var(--accent-sha    box-shadow: 0 4px 20px var(nt    box-shadow: 0 4px 20px var(--accentti    box-shadow: 0 4px 20px var(--accent-sha    box-sackdrop-filter: blur(10px);
}`
);

// 4. Update the layout wrapping Ac// 4. Update tts the capsules better
css = css.replace(
`.counter-actions {
    display: fle    display: fle    displayte    display: flx;
    width: 100%;
    margin-bottom: 24px;    margin-bottom: 24px;    margin-bottom: 24px;    margin-bottom: 24px;        margin-bottom: 2;
    margin-bott       margin-bott       margin-bott       margin-bott       margin-bott     s);
console.log('Finished UI swap script');
