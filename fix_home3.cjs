const fs = require('fs');

// We now need to check the records page. Let's see what components make up the records page.
let js = fs.readFileSync('src/js/pages-my.js', 'utf8');
console.log(js.slice(0, 1000));
