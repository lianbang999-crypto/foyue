const fs = require('fs');

let js = fs.readFileSync('src/js/history-view.js', 'utf8');
js = js.replace(/<div class="my-history-icon"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"\/><\/svg><\/div>/g, 
  '<div class="my-history-item-icon"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></div>');

js = js.replace(/class="my-history-item"/g, 'class="my-history-item glass-panel"');

fs.writeFileSync('src/js/history-view.js', js);
