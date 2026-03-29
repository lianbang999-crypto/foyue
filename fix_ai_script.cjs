const fs = require('fs');

/* 1. Update HTML */
let html = fs.readFileSync('ai.html', 'utf-8');
const logoSVG = `<svg class="ai-brand-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;">
    <circle cx="12" cy="12" r="9" stroke-dasharray="2 4"/>
    <path d="M12 21C12 21 7 16 7 12C7 8 12 4 12 4C12 4 17 8 17 12C17 16 12 21 12 21Z"/>
</svg>`;
html = html.replace(/<svg class="ai-brand-icon"[^>]+>[\s\S]*?<\/svg>/, logoSVG);
fs.writeFileSync('ai.html', html);

/* 2. Update ai-app.js */
let js = fs.readFileSync('src/js/ai-app.js', 'utf-8');
js = js.replace(/function buildWelcomeHTML\(\) \{[\s\S]*?<\/div>\n\s*`/m, `function buildWelcomeHTML() {
    return \`
    <div class="ai-welcome">
      <svg class="ai-welcome-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" stroke-dasharray="      pacity="0.5"/>
        <path d="M12 21C12 21 7 16 7 12C7 8 12 4 12 4C12 4 17 8 17 12C17 16 12 21 12 21Z"/>
      </svg>
      <h1>阿弥陀佛，请提问</h1>
      <p>与法相应，解您心中疑<br>基于大安法师讲经开示</p>
    </div>
    \``);
fs.writeFileSync('src/js/ai-app.js', js);
