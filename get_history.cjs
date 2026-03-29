const fs = require('fs');

let js = fs.readFileSync('src/js/history-view.js', 'utf8');
console.log(js.slice(0, 1000));
