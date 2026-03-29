const fs = require('fs');

let cssFile = fs.readFileSync('src/css/pages.css', 'utf8');

// remove legacy history item classes
cssFile = cssFile.replace(/\.my-history-item \{[\s\S]*?\}/g, '');
cssFile = cssFile.replace(/\.my-history-icon \{[\s\S]*?\}/g, '');

fs.writeFileSync('src/css/pages.css', cssFile);
