const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'src/css/ai.css');
let content = fs.readFileSync(targetFile, 'utf-8');

// replace .ai-fs-input container to be a capsule
let match = content.match(/\.ai-fs-input \{[\s\S]*?\}/);
if (match) {
    content = content.replace(match[0], `.ai-fs-input {
  display: flex;
  align-items: flex-end;
  background: var(--bg-card);
  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  paddin  in  paddin  paddin  paddin  paddhing')) {
content += `

@keyframes ai-breathing {
  0%, 100% { opacity: 0.4; transform: scale(1); box-shadow: 0 0 4px var(--accent-shadow); }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 12px var(--accent-shadow); }
}
.ai-breathing {
  animation: ai-breathing 2s ease-in-out infinite;
}
`;
}

fs.writeFileSync(targetFile, content);
console.log('Fixed ai.css layoutconsole.log(OF
