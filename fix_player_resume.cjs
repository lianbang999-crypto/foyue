const fs = require('fs');
let s = fs.readFileSync('src/js/player.js', 'utf-8');

// Fix Blob URL exchange ignoring playback time
s = s.replace(/const pos = dom\.audio\.currentTime;\s*const rate = dom\.audio\.playbackRate;\s*dom\.audio\.src = cachedUrl;\s*dom\.audio\.playbackRate = rate;\s*dom\.audio\.load\(\);/m, 
`const pos = dom.audio.currentTime;
        const rate = dom.audio.playbackRate;
        const wasPlaying = !dom.audio.paused; // Remember if playing
        dom.audio.src = cachedUrl;
        dom.audio.playbackRate = rate;
        // Fix #3/#4: restore time specifically after metadata loads!
        dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = pos; }, { once: true });
        dom.audio.load();
        if (wasPlaying) dom.audio.play().catch(()=>{});`);

// Fix Opus Fallback losing time
s = s.replace(/audioRetries = 0;\s*\/\/ reset retries for the MP3 URL\s*dom\.audio\.src = mp3Url;\s*dom\.audio\.load\(\);/m,
`audioRetries = 0;
      const _pos = dom.audio.currentTime;
      const _wasPlaying = !dom.audio.paused;
      dom.audio.src = mp3Url;
      dom.audio.addEventListener('loadedmetadata', () => { dom.audio.currentTime = _pos; }, { once: true });
      dom.audio.load();`);

// Fix Error Retry losing time
s = s.replace(/setTimeout\(\(\) => \{\s*if \(dom\.audio\.src === src\) \{\s*setBuffering\(true\);\s*dom\.auds = s.replace(/setTimeout\(\(\) => \{\s*if ifs = s.replace(/setTimeout\(\(\) => \{\s*if \(dom\.audio\.src === srt s = s.replace(/setTimeout\(\(\) =  s = s.replace(/setTntListener('loadedmes = s.replace(/setTimeout\(\(\) => \{\s*if \(dom\.audio\.src === src       dom.audio.load();`);

fs.writeFileSync('src/js/player.js', s);
