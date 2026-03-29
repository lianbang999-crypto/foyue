const fs = require('fs');

// 1. Update HTML
let html = fs.readFileSync('ai.html', 'utf-8');

// Replace the brand icon
html = html.replace(/<svg class="ai-brand-icon"[^>]+>[\s\S]*?<\/svg>/, `<svg class="ai-brand-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;">
    <\!-- Minimalist Lotus Seed/Petal & Enso Idea -->
    <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke-dasharray="1 3"/>
    <path d="M12 21C12 21 7 16 7 12C7 8 12 4 12 4C12 4 17 8 17 12C17 16 12 21 12 21Z"/>
</svg>`);

fs.writeFileSync('ai.html', html);

// 2. Update ai-app.js Welcome HTML
let js = fs.readFileSync('src/js/ai-app.js', 'utf-8');
// It probably injects welcome HTML or ai.html has it?
// Let's check...
