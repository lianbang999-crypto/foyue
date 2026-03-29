const fs = require('fs');
let css = fs.readFileSync('src/css/wenku-page.css', 'utf-8');

// Using purely block replacement 
const fontBtnStart = css.indexOf('.wk-font-btn {');
if (fontBtnStart > -1) {
    const end = css.indexOf('}', fontBtnStart) + 1;
    css = css.slice(0, fontBtnStart) + `.wk-font-btn {
    flex: 1;
    appearance: none;
    border: none;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.2);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           lign: center;
    transition: all 0.2s cubic-bezier(.22, 1, .36, 1);
    appear    appear    appear    appear   }
    appear    appear    appear    appear   }
 .36, 1);
 ve ve ve ve ve ve ve ve viv ve ve ve ve ve ve ve ve viv ve ve ve ve ve ve ve ve vivAc ve ve ve ve ve ve ve ve viv ve ve ve ve ve ve ve ve wk-font-btn.active {
    box-shadow:     box-shadow5px     box-shadow:     box-shadow5px     box-shadow:     boround: var(--wk-accent-light);
}` + css.slice(end);
}

const modeDotActive = css.indexOf('.wk-mode-dot.active {');
if (modeDotActive > -1) {
    const end = css.indexOf('}', modeDotActive) + 1;
    css = css.slice(0, modeDotActive) + `.wk-mode-dot.active {
    box-shadow: inset 0 0 0 1.5px var(--wk-accent);
    color: var(--wk-accent);
    font-weight: 500;
    transform: translateY(-2px);
}` + css.slice(end);
}

fs.writeFileSync('src/css/wenku-page.css', css);
