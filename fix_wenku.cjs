const fs = require('fs');

let css = fs.readFileSync('src/css/wenku-page.css', 'utf8');

css += `
/* Glass panel enhancements for Wenku page */
.wenku-item.glass-panel {
  background: rgba(var(--bg-card-rgb), 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 16px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.03);
}

.wenku-item.glass-panel:hover {
  transform: translateY(-2px);
  background: rgba(var(--bg-card-rgb), 0.8);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
}

.wenku-item-cover {
  border-radius: 12px;
  overflow: hidden;
}
`;

if(css.indexOf('.wenku-item.glass-panel') === -1) {
  fs.writeFileSync('src/css/wenku-page.css', css);
}

let js = fs.readFileSync('src/js/wenku-app.js', 'utf8');
js = js.replace(/class="wenku-item"/g, 'class="wenku-item glass-panel"');
fs.writeFileSync('src/js/wenku-app.js', js);
