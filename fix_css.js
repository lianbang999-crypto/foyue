const fs = require('fs');

// 1. Remove center play button from layout.css
let layoutCss = fs.readFileSync('src/css/layout.css', 'utf-8');
layoutCss = layoutCss.replace(/\/\*.*?center-play-btn.*?\*\//g, '');
layoutCss = layoutCss.replace(/\.tab-center\s*{[^}]*}/g, '');
layoutCss = layoutCss.replace(/\.center-play-btn[\s\S]*?(?=\n\n\/\*|\n\n\.|\n\n\[)/g, '');
layoutCss = layoutCss.replace(/\n\s*\.center-play-btn[^{]*{[^}]*}/g, '');
fs.writeFileSync('src/css/layout.css', layoutCss);

// 2. Rewrite .player in player.css
let playerCss = fs.readFileSync('src/css/player.css', 'utf-8');
playerCss = playerCss.replace(/\.player\s*{\s*display:\s*none\s*}/, `/* === FLOATING PILL PLAYER (Phase 10) === */
.player {
  position: fixed;
  bottom: calc(72px + var(--safe-bottom));
  left: 16px;
  right: 16px;
  height: 56px;
  background: var(--bg-player);
  border-radius: 28px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  z-in  z-in  z-in  z-in  z-iidde  z-in  z-in  z-in  z-ineY(0) scale(1);
  transition: transform 0.4s cubic-bezier(0.2, 0, 0, 1), opacity 0.3s;
  cursor: pointer;
}

[data-theme="dark"] .player {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4),   box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4),   box-shadow: 0fo  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4),   box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4),    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4),   box-shadow: 0 4px 24px rg  width: 100%;
  height: 100%;
  padding: 0 6px 0 20px;
  position: relative;
  z-index: 1;
}

.player-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.player-track {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-  padding-  pa

.player-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: e  text-overflowayer-ctrls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.player-ctrls .ctrl {
  width: 44px;
  height: 44px;
}

.player-progress {
  position: absolute;
  bottom: 0  bottom: 0  bottom: 0  botteight: 3px;
  background: transparent;
  z-index: 2;
}

.player-progress-bg {
  width: 100%;
  height: 100%;
  background: rgba(131, 106, 50, 0.1);
}

.player-progress-fill {
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform-origin: left center;
  transform: scaleX  transform: sion: transform 0.1s linear;  transform: scaleXync  transform:ayer.  transform:Css);
console.log('CSS updated');
