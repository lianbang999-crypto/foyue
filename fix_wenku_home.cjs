const fs = require('fs');

// 1. Update CSS
let css = fs.readFileSync('src/css/wenku-page.css', 'utf-8');

// Replace wk-continue styling
css = css.replace(/\.wk-continue \{[\s\S]*?\.wk-continue-progress-fill \{[\s\S]*?\}/, `.wk-continue {
    position: relative;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 24px;
    background: var(--wk-bg-card);
    border-radius: 20px;
    border: none;
    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadow:    box-shadowns    box-shadow:    box-shadow:zie    box-shadow:, 1);
}

@media (prefers-color-scheme: dark) {
    .wk-continue::before {
                                ix-blend-mode: luminosity;
    }
}

.wk-continue:hover {
    transform: translateY(-2px) scale(0.99);
    box-shadow: inset 0 0 0 1px var(--wk-bord    box-shadow: inset 0,0    box-shado.w   ontinue:hover::b    box-shadow: inset 0 0 0 1p.05);
}

.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:active {.wk-continue:actsc.wk-continue:alor;
.wk-continue:active {.wk-continue:acne.wk-continue:active {.wkine.wk-continue:active {.wk-continue:acne.wk-continue:activewidth: 0;
}}}}}}}}}}}}}}}}}}tle {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--wk-text);
}

.wk-continue-sub {
    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size:{
    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    font-size: 13p    ay: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding:    padding: ckground: var(--wk-bg-card);
    border-radius: 20px;
    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /us    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v    /* Claude style soft border v roke: c    /* Claude style soft bdt    /* Claude style soft bo{
    /* Claude      /* Claude      /* Claude      /* Claude      /* 5p    /* Claude      /* C;
    /* Claude      /* Claude      /* Claude      /* Claude      /* 5p    /* Claude      /* C;
    font-size: 12px;
    color: var(--wk-text-secondary);
    line-height: 1.5;
}

.wk-series-arrow {
    display: none;
}`);

// Add header glassmorphism
css = css.replace(/\.wk-header \{[\s\S]*?z-index: 100;\n\}/, `.wk-header {
    position: sticky;
    top: 0;
    background: var(--wk-bg-header);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 100;
    border-bottom: 1px solid var(--wk-border);
    transition: background 0.3s, border-color 0.3s;
}`);

fs.writeFileSync('src/css/wenku-page.css', css);

// 2. Update JS template slightly if needed
let js = fs.readFileSync('src/js/wenku-app.js', 'utf-8');
// remove the right arrow svg from the template as it's not needed in bento grid
js = js.replace(/<svg class="wk-series-arrow"[\s\S]*?<\/svg>/g, '');
fs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.writeFfs.write
node fix_wenku_home.cjs
