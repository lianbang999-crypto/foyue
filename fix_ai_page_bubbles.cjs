const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'src/css/ai-page.css');
let content = fs.readFileSync(targetFile, 'utf-8');

// Replace bot message background
content = content.replace(/\.ai-message--bot \.ai-message-content \{[\s\S]*?\}/, `.ai-message--bot .ai-message-content {
  background: transparent;
  color: var(--text);
  border: none;
  box-shadow: none;
  padding: 4px 8px; /* Lean pad */
}`);

// Remove ::after border if any
content = content.replace(/\.ai-message--bot \.ai-message-content::after \{[\s\S]*?\}/, '');

fs.writeFileSync(targetFile, content);
console.log('Fixed bot bubbles in ai-page.css');
