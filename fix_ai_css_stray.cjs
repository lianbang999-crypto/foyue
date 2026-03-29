const fs = require('fs');
let css = fs.readFileSync('src/css/ai-page.css', 'utf-8');
css = css.replace(/    30% \{\n        transform: translateY\(-6px\);\n        opacity: 1;\n    \}\n\}\n/, '');
fs.writeFileSync('src/css/ai-page.css', css);
