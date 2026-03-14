const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf-8');

// 1. Rename the expPrev/Play/Next SVGs
html = html.replace(/<button class="ctrl" id="expPrev"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl" id="expPrev" aria-label="Previous">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M19 20L9 12l10-8v16zM5 4v16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>`);

html = html.replace(/<button class="ctrl ctrl-play" id="expPlay"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl ctrl-play" id="expPlay" aria-label="Play">
            <svg width="24" height="24" viewBox="0 0 24 24" id="expPlayIcon">
              <path d="M7 4v16l13-8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>`);

html = html.replace(/<button class="ctrl" id="expNext"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl" id="expNext" aria-label="Next">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M5 4v16l10-8L5 4zM19 4v16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>`);

html = html.replace(/<button class="ctrl" id="btnPrev"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl" id="btnPrev" aria-label="Previous">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M19 20L9 12l10-8v16zM5 4v16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>`);

html = html.replace(/<button class="ctrl ctrl-play" id="btnPlay"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl ctrl-play" id="btnPlay" aria-label="Play">
            <svg width="20" height="20" viewBox="0 0 24 24" id="playIcon">
              <path d="M7 4v16l13-8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>`);

html = html.replace(/<button class="ctrl" id="btnNext"[^>]*>[\s\S]*?<\/svg>\n\s*<\/button>/, `<button class="ctrl" id="btnNext" aria-label="Next">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M5 4v16l10-8L5 4zM19 4v16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>`);

// 2. Remove Tab Center
// We can just add display:none inline or remove it. Let's remove it completely.
html = html.replace(/<div class="tab-center" id="tabCenter">[\s\S]*?<\/div>\n\s*<button class="tab"/, `<button class="tab"`);

fs.writeFileSync('index.html', html);
console.log('index.html updated');
