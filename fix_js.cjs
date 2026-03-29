const fs = require('fs');

const jsPath = 'src/js/counter.js';
let js = fs.readFileSync(jsPath, 'utf8');

js = js.replace(
`    const doCount = (cx, cy) => {
      spawnRipple(cx, cy);
      doCountCore();
    };`,
`    const doCount = (cx, cy) => {
      if (navigator.vibrate) {
        // 轻微触觉反馈
        navigator.vibrate([15]);
      }
      spawnRipple(cx, cy);
      doCountCore();
    };`
);

fs.writeFileSync(jsPath, js);
console.log('JS modified');
