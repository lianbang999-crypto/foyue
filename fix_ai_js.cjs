const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'src/js/ai-chat.js');
let content = fs.readFileSync(targetFile, 'utf-8');

// Also update the typing indicator in standard overlay to match
content = content.replace(/<span class="ai-msg-dot"><\/span>/g, '');
content = content.replace(/<div class="ai-msg-typing">[\s\S]*?<\/div>/, '<div class="ai-msg-typing" style="display: flex; align-items: center; gap: 8px;"><div class="ai-breathing" style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); opacity: 0.6; box-shadow: 0 0 8px var(--accent-shadow);"></div><span style="font-size: 13px; color: var(--text-muted);">参悟中...</span></div>');

// Remove border backgrounds on welcome banner in ai.css
// Also make input wrapper a capsule

fs.writeFileSync(targetFile, content);
console.log('Fixed ai-chat.js typing UI');
