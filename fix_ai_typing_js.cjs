const fs = require('fs');

let js = fs.readFileSync('src/js/ai-app.js', 'utf-8');
js = js.replace(/<div class="ai-typing"><span class="ai-typing-dot"><\/span><span class="ai-typing-dot"><\/span><span class="ai-typing-dot"><\/span><\/div>/, `<div class="ai-typing"><span class="ai-typing-dot"></span><span>参悟中...</span></div>`);
fs.writeFileSync('src/js/ai-app.js', js);
