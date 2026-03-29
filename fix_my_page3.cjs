const fs = require('fs');

let js = fs.readFileSync('src/js/pages-my.js', 'utf8');

// Let's replace the my page icon layout with the glass panels too
js = js.replace(/<div class="my-pnl-entry"[^>]*>/g, '<div class="my-pnl-entry glass-panel">');

// improve my page user panel
js = js.replace(/<div class="my-user-card"[^>]*>/g, '<div class="my-user-card glass-panel" style="padding: 24px; display: flex; align-items: center; gap: 20px; border-radius: 24px; margin: 20px 0;">');

// replace custom target input display
js = js.replace(/<div class="my-user-info"[^>]*>/, '<div class="my-user-info" style="flex: 1; display: flex; flex-direction: column; gap: 6px;">');
js = js.replace(/<div class="my-user-name"[^>]*>/, '<div class="my-user-name" style="font-size: 20px; font-weight: 600; color: var(--text-primary);">');


fs.writeFileSync('src/js/pages-my.js', js);
