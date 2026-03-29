const fs = require('fs');

let js = fs.readFileSync('src/js/history-view.js', 'utf8');
console.log(js.slice(1000, 2000));
