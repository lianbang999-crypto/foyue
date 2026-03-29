const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'src/css/ai.css');
let content = fs.readFileSync(targetFile, 'utf-8');

// Replace bot message background
content = content.replace(/\.ai-msg-bot \.ai-msg-content \{[\s\S]*?\}/, `.ai-msg-bot .ai-msg-content {
  background: transparent;
  color: var(--text);
  border: none;
  border-radius: 4px 18px 18px 18px;
  box-shadow: none;
  position: relative;
  padding: 4px 8px; /* Less padding since it's transparent */
}`);

// Remove ::before border hack if exists for bot content
content = content.replace(/\.ai-msg-bot \.ai-msg-content::before \{[\s\S]*?\}/, '');

// Also fix standard ai-page.css message bot if needed
const pageTargets = ['src/css/ai-page.css', 'src/css/ai.css'];

for (const t of pageTargets) {
   // actually handled above for ai.css, ai-page.css should be handled similarly
}

fs.writeFileSync(targetFile, content);
console.log('Fixed bot bubbles in ai.css');
