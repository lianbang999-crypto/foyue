const fs = require('fs');

let css = fs.readFileSync('src/css/ai-page.css', 'utf8');

css += `
/* Glass panel enhancements for AI page */
.ai-conv-card.glass-panel {
  background: rgba(var(--bg-card-rgb), 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 16px;
  transition: all 0.3s ease;
  margin-bottom: 12px;
}

.ai-conv-card.glass-panel:active {
  transform: scale(0.99);
  background: rgba(var(--bg-card-rgb), 0.8);
}
`;

if(css.indexOf('.ai-conv-card.glass-panel') === -1) {
  fs.writeFileSync('src/css/ai-page.css', css);
}

let js = fs.readFileSync('src/js/ai-app.js', 'utf8');
js = js.replace(/class="ai-conv-card"/g, 'class="ai-conv-card glass-panel"');
fs.writeFileSync('src/js/ai-app.js', js);
