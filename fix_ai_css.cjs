const fs = require('fs');

let css = fs.readFileSync('src/css/ai-page.css', 'utf-8');

// 1. Remove border-top from .ai-input-area and change background
css = css.replace(/\.ai-input-area \{([\s\S]*?)\}/, `.ai-input-area {
    flex-shrink: 0;
    padding: 12px 16px;
    padding-bottom: calc(12px + var(--ai-safe-bottom));
    background: transparent;
    position: relative;
    z-index: 10;
}`);

// 2. Add glassmorphism to .ai-input-wrap, giving it the pill shape with blur
css = css.replace(/\.ai-input-wrap \{([\s\S]*?)\}/, `.ai-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--ai-bg-header); /* slightly transparent bg */
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: none;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(128, 128, 128, 0.15);
    border-radius: 24px;
    padding: 8px 8px 8px 16px;
    transition: box-shadow 0.2s, transform 0.2s;
}`);

// 3. Optional: make focus state softer
css = css.replace(/\.ai-input-wrap:focus-within \{([\s\S]*?)\}/, `.ai-input-wrap:focus-within {
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), inset 0 0 0 1px var(--ai-accent);
    transform: translateY(-1px);
}`);

// 4. Update the loading to a breathing state instead of jumping dots
// We will replace .ai-typing and its keyframes entirely
css = css.replace(/\.ai-typing \{([\s\S]*?)\}\s*\.ai-typing-dot([\s\S]*?)@keyframes ai-dot-bounce \{([\s\S]*?)\}/g, `.ai-typing {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 13px;
    color: var(--ai-accent);
}

.ai-typing-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ai-accent);
    animation: ai-breathing 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes ai-breathing {
    0%, 100% {
        opacity: 0.2;
        transform: scale(0.8);
        box-shadow: 0 0 0 0 rgba(212, 165, 74, 0);
    }
    50% {
        opacity: 0.8;
        transform: scale(1);
        box-shadow: 0 0 12px 2px rgba(212, 165, 74, 0.4);
    }
}`);

fs.writeFileSync('src/css/ai-page.css', css);
