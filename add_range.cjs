const fs = require('fs');

try {
  let html = fs.readFileSync('index.html', 'utf-8');
  html = html.replace(/<div class="exp-progress-thumb" id="expProgressThumb"><\/div>\s*<\/div>/g, 
    '<div class="exp-progress-thumb" id="expProgressThumb"></div>\n          <input type="range" min="0" max="100" step="0.1" value="0" class="native-range" id="expNativeRange">\n        </div>');
  fs.writeFileSync('index.html', html);

  let domStr = fs.readFileSync('src/js/dom.js', 'utf-8');
  domStr = domStr.replace(/expProgressBar:\s*\$\('expProgressBar'\),/g, "expProgressBar: $('expProgressBar'),\n    expNativeRange: $('expNativeRange'),");
  fs.writeFileSync('src/js/dom.js', domStr);

  let css = fs.readFileSync('src/css/player.css', 'utf-8');
  css += `\n/* Native accessible range transparent overlay */\n.native-range{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;z-index:10;-webkit-appearance:none}\n`;
  fs.writeFileSync('src/css/player.css', css);

  let mainStr = fs.readFileSync('src/js/main.js', 'utf-8');
                                                \{[\s\S                                                \{[\s\S                                          ti                                                \{[\s\S                                                \{[\s\S                                          ti                                         xp                                      ;
                                                                                                                                                                                                                    ra                                           yle                                                          ion = '';
      dragPct = parseFloat(e.target.value) / 100;
      seekCommit(dragPct, dom.audio);
      setDragging(false);
    };
    dom.expNativeRange.addEventListener('change', releaseHandler);
    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas nd    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas nd    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas nd    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas    dom.e    dom.e    dom.e    dom.e    dom.e    dom.eeas nd    dom.e    dom.e    dom.e    dom.e  riteFileSync('src/js/player.js', playerStr);

} catch (e) {
  console.log(e);
}
