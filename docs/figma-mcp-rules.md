# Figma MCP Integration Rules

This document is the repository-specific implementation guide for turning Figma designs into code in this project.

It is written for AI agents and contributors using Figma MCP tools. Treat it as the source of truth before generating UI code.

## Stack Snapshot

- Frontend runtime: Vanilla JavaScript with ES modules, not React/Vue
- App shape: Multi-entry HTML app built with Vite
- Styling: Global layered CSS files with CSS custom properties
- Backend surface: Cloudflare Pages Functions and Workers
- Primary target: Mobile-first PWA with light/dark theme support

## 1. Design System Structure

### 1.1 Token Definitions

Primary design tokens live in `src/css/tokens.css`.

The project uses plain CSS custom properties under `:root` and `[data-theme="dark"]`, not JSON tokens, not Tailwind config, and not a design-token build pipeline.

Key token categories:

- Color and surfaces: `--bg`, `--bg-secondary`, `--bg-card`, `--accent`, `--text`, `--border`
- Effects: `--shadow-sm`, `--shadow-md`, `--accent-shadow`, `--hero-gradient`
- Shape: `--radius`, `--radius-sm`, `--radius-lg`
- Layout helpers: `--player-h`, `--safe-bottom`
- Typography: `--font-zh`, `--font-en`, `--font-serif`

Example pattern:

```css
:root {
  --bg: #F9F8F6;
  --bg-card: #FFFFFF;
  --accent: #D97757;
  --text: #1E1E1E;
  --radius: 12px;
  --font-zh: 'Noto Sans SC', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

[data-theme="dark"] {
  --bg: #1D1D1D;
  --bg-card: rgba(255, 255, 255, 0.04);
  --accent: #E0876B;
  --text: #E8E0D5;
}
```

Relevant files:

- `src/css/tokens.css`
- `src/js/theme.js`

Theme application is runtime-driven by `data-theme` on `document.documentElement`.

```js
export function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
}
```

#### Token Format and Conventions

- Token names are semantic, not scale-based. Example: `--bg-card-hover`, `--text-secondary`, `--accent-glow`
- Light and dark values are co-located in CSS, not split into separate token files
- Font tokens are also defined in CSS and consumed globally
- Some sub-pages use page-local color constants in JS for `meta[name="theme-color"]`, but visual tokens still come from CSS

#### Token Transformation Systems

There is no token transformation system such as Style Dictionary, Theo, or Tokens Studio export.

Important implications for Figma MCP:

- Do not generate JSON token artifacts unless explicitly requested
- Map Figma variables directly to existing CSS custom properties where possible
- If a new token is needed, add it to `src/css/tokens.css` and support both light and dark themes

### 1.2 Typography

Typography is tokenized in CSS and loaded from HTML via external font CSS.

Current font stack:

- Chinese UI/body: `Noto Sans SC`
- English/supporting UI: `DM Sans`
- Serif/accent text: `Noto Serif SC`

Font loading example from `index.html`:

```html
<link
  href="https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap"
  rel="stylesheet" media="print" onload="this.media='all'">
```

When implementing Figma designs:

- Reuse these font tokens unless a design decision explicitly changes the type system
- Avoid introducing ad hoc font stacks inside component CSS

## 2. Component Library

### 2.1 Where Components Are Defined

There is no React-style component library folder.

UI is assembled from three layers:

1. HTML entry files for page shells
2. JavaScript modules that create DOM nodes or HTML template strings
3. Shared CSS layers for reusable visual patterns

Key JS modules:

- `src/js/main.js`: main site entry
- `src/js/pages-home.js`: home page rendering
- `src/js/pages-category.js`: category and episode views
- `src/js/pages-my.js`: my page
- `src/js/ai-app.js`: AI standalone app
- `src/js/wenku-app.js`: Wenku standalone app
- `src/js/player.js`: shared audio player interactions
- `src/js/dom.js`: cached DOM references

Key CSS layers:

- `src/css/ui.css`: buttons, icon buttons, shared UI primitives
- `src/css/components.css`: loaders, overlays, modal-like patterns
- `src/css/cards.css`: list cards, episode rows, expandable lists
- `src/css/pages.css`: home/my page UI
- `src/css/player.css`: mini player and expanded player
- `src/css/layout.css`: header, tab bar, shell layout

### 2.2 Component Architecture

The architecture is imperative and page-oriented.

Patterns used repeatedly:

- Template-string markup returned from JS modules
- DOM creation with `document.createElement`
- Event delegation or direct listeners after render
- Shared class-based styling with semantic prefixes

Example from `src/js/pages-home.js`:

```js
page.innerHTML = `
  <div class="home-quote-callout" id="homeQuoteCallout">
    <div class="home-quote-text">${quoteText}</div>
    <div class="home-quote-author">— ${quote.author}</div>
  </div>

  <div id="homeDynamic">${buildDynamicSectionHtml()}</div>
`;
```

Example from `src/js/pages-category.js`:

```js
const card = document.createElement('div');
card.className = 'card' + (isPlaying ? ' now-playing' : '');
card.innerHTML = `<div class="card-icon">...</div>`;
```

This means Figma-generated output should follow these rules:

- Generate HTML plus JS render functions, not JSX
- Prefer semantic class names over inline styles
- Fit new UI into the existing page module that owns the screen
- If a pattern is reused across pages, implement it in shared CSS rather than duplicating page-specific declarations

### 2.3 Documentation and Storybook

There is no Storybook, `.storybook` directory, or formal component documentation site.

Documentation is distributed across:

- `README.md`
- `AGENTS.md`
- `.impeccable.md`
- `.github/instructions/ui-ux.instructions.md`
- code comments in CSS/JS

Implication for Figma MCP:

- The codebase itself is the component reference
- Existing class patterns are more authoritative than inventing a new component taxonomy

## 3. Frameworks and Libraries

### 3.1 UI Frameworks

This codebase does not use React, Vue, Svelte, Solid, or any client-side component framework.

It uses:

- HTML entry files at repo root
- Vanilla JavaScript ES modules in `src/js`
- Global CSS in `src/css`

### 3.2 Styling Libraries

There is no Tailwind, Styled Components, CSS Modules, Sass, Less, or Emotion.

Styling is plain CSS, imported into JS entry modules.

Example from `src/js/main.js`:

```js
import '../css/tokens.css';
import '../css/reset.css';
import '../css/ui.css';
import '../css/layout.css';
import '../css/player.css';
import '../css/cards.css';
import '../css/pages.css';
import '../css/components.css';
```

Standalone pages import their own page CSS:

```js
import '../css/ai-page.css';
import '../css/wenku-page.css';
```

### 3.3 Build System and Bundler

Build tooling is Vite.

Relevant file:

- `vite.config.js`

Important characteristics:

- Multi-entry build for `index.html`, `admin.html`, `ai.html`, `wenku.html`, `nianfo.html`, `gongxiu.html`
- Manual chunking for common modules, player modules, and page modules
- `public/` is copied through as static assets
- `cssCodeSplit: true`

Example:

```js
build: {
  outDir: 'dist',
  minify: 'esbuild',
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      ai: resolve(__dirname, 'ai.html'),
      wenku: resolve(__dirname, 'wenku.html')
    }
  }
}
```

Dependencies are intentionally minimal. Current notable packages from `package.json`:

- `vite`
- `wrangler`
- `lucide-static`
- `qrcode`

## 4. Asset Management

### 4.1 Where Assets Live

Static assets are mainly stored in:

- `public/icons/`: app icons, logos, player imagery, Lucide SVG set
- `public/images/`: general images such as `guanyin.jpg`
- `public/screenshots/`: promotional/app screenshots
- `public/audio/`: static audio such as `muyu.mp3`
- root `icons/`: additional brand assets used directly by HTML

Example directories:

- `public/icons/icon-192.png`
- `public/icons/loading-logo.webp`
- `public/images/guanyin.jpg`
- `public/screenshots/home.png`
- `public/audio/muyu.mp3`

### 4.2 How Assets Are Referenced

The dominant pattern is absolute root-relative URLs, not JS asset imports.

Examples from HTML:

```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<source srcset="/icons/loading-logo.webp" type="image/webp">
<img src="/icons/loading-logo.png" alt="净土法音">
```

Guidance for Figma MCP:

- Prefer placing exported assets under `public/icons/` or `public/images/`
- Reference them via root-relative paths like `/icons/foo.webp`
- Do not introduce a framework-specific asset pipeline unless necessary

### 4.3 Asset Optimization Techniques

Current optimization patterns are mostly manual and CDN/cache-driven:

- WebP/PNG pairs for important raster assets
- Lazy-ish font loading using `media="print" onload`
- PWA service worker pre-caching for shell assets
- Long-lived cache headers for static assets
- Preconnect to audio domain

Service worker examples from `public/sw.js`:

```js
const APP_SHELL = [
  '/',
  '/wenku',
  '/nianfo',
  '/gongxiu',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
```

Header examples from `public/_headers`:

```txt
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/icons/*
  Cache-Control: public, max-age=2592000
```

### 4.4 CDN and Delivery Configuration

Audio delivery is offloaded to `audio.foyue.org`, backed by Cloudflare R2/custom domain infrastructure.

Observed patterns:

- HTML injects preconnect for `https://audio.foyue.org`
- `_headers` adds cache policy hints for static assets and audio paths
- README documents Cloudflare Pages, Functions, D1, R2, and Workers

Rules for Figma assets:

- UI images belong on the main app domain through `public/`
- Audio/media delivery rules are separate and should not be mixed with normal design asset handling

## 5. Icon System

### 5.1 Where Icons Are Stored

There are two icon layers:

1. Runtime SVG constants in `src/js/icons.js`
2. Static SVG/icon files in `public/icons/lucide/` and `public/icons/`

`public/icons/lucide/README.md` documents the Lucide icon set shipped with the project.

### 5.2 How Icons Are Used

Icons are usually embedded as inline SVG strings and injected into markup.

Examples:

```js
export const ICON_PLAY = '<svg viewBox="0 0 24 24"><polygon ... /></svg>';

export const CATEGORY_ICONS = {
  tingjingtai: '<svg viewBox="0 0 24 24"><path ... /></svg>',
  fohao: '<svg viewBox="0 0 24 24"><path ... /></svg>',
};
```

Some entry HTML files also hardcode inline SVG for navigation and buttons.

### 5.3 Naming Conventions

The naming pattern is semantic and uppercase for JS constants:

- `ICON_PLAY`, `ICON_PAUSE`
- `CATEGORY_ICONS`
- `HOME_CATEGORY_ICONS`
- `ICON_APPRECIATE`

Static file naming is lowercase kebab-like or descriptive PNG naming:

- `icon-192.png`
- `apple-touch-icon.png`
- `loading-logo.webp`
- `nav-logo-new.png`

Rules for Figma MCP:

- If the design uses an existing control icon, prefer adding or reusing it in `src/js/icons.js`
- If the icon is branding or a raster app asset, place it under `public/icons/`
- Match the current 24x24 Lucide-like stroke style for line icons unless the design intentionally introduces a branded exception

## 6. Styling Approach

### 6.1 CSS Methodology

This project uses global CSS files organized by concern, not CSS Modules.

Practical methodology:

- Foundation tokens in `tokens.css`
- Global reset in `reset.css`
- Shared UI primitives in `ui.css`
- App shell in `layout.css`
- Shared card/list patterns in `cards.css`
- Shared overlays/status blocks in `components.css`
- Page-specific styles in `pages.css`, `ai-page.css`, `wenku-page.css`, etc.

Class naming is semantic with page or pattern prefixes:

- `home-*`
- `card-*`
- `ep-*`
- `my-*`
- `btn-*`

Example:

```css
.home-rec-card { ... }
.home-continue-card { ... }
.card.now-playing { ... }
.btn-primary { ... }
```

### 6.2 Global Styles

Global styles are extensive and intentional.

Examples:

- `reset.css` defines base body typography, smoothing, background, reduced motion behavior
- `layout.css` defines sticky header, tab bar, shell spacing
- `ui.css` defines reusable button/icon styles

Example from `reset.css`:

```css
body {
  font-family: var(--font-zh);
  background-color: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
```

### 6.3 Responsive Design

The project is mobile-first and uses plain CSS media queries plus a few fluid sizing helpers such as `min()`, `max()`, and `clamp()`.

Observed responsive patterns:

- `@media (min-width: 500px)`
- `@media (min-width: 768px)`
- `@media (max-width: 640px)`
- `@media (max-width: 480px)`
- `@media (orientation: landscape) and (max-height: 500px)`
- `@media (prefers-reduced-motion: reduce)`
- `@media (prefers-color-scheme: dark)` on standalone pages

Important UI constraints from the existing system:

- Touch targets are generally kept at 44px minimum for actionable controls
- The app assumes narrow mobile widths first, then relaxes at tablet/desktop breakpoints
- Motion is present but restrained

Example button rule from `src/css/ui.css`:

```css
.btn {
  min-height: 44px;
  touch-action: manipulation;
}

.btn-icon {
  width: 44px;
  height: 44px;
}
```

Rules for Figma MCP:

- Do not hand over desktop-first layouts unless the target page is known to be desktop-oriented
- Keep 44px tap targets for primary interactive elements
- Extend existing breakpoints before inventing a new breakpoint map

## 7. Project Structure

### 7.1 Overall Organization

The repo is organized by runtime surface rather than by component library.

Top-level structure:

```text
index.html / ai.html / wenku.html / nianfo.html / gongxiu.html / admin.html
src/
  css/
  js/
  locales/
public/
functions/
workers/
docs/
```

Meaning of each area:

- Root HTML files: entry points for each app surface
- `src/js`: behavior and rendering modules
- `src/css`: layered style system
- `src/locales`: i18n strings
- `public`: static assets and service worker
- `functions`: Cloudflare Pages Functions backend
- `workers`: separate worker scripts and migrations

### 7.2 Feature Organization Patterns

Patterns are mostly page-feature based:

- `pages-home.js`, `pages-category.js`, `pages-my.js` for main-site screens
- `ai-app.js`, `wenku-app.js`, `nianfo-app.js`, `gongxiu-app.js` for standalone surfaces
- `player.js`, `history.js`, `search.js`, `theme.js`, `store.js` for shared cross-page behavior

There is also a shell/shared-module split:

- shell and navigation in `index.html`, `layout.css`, `dom.js`, `main.js`
- feature modules mounted into `contentArea`

Example DOM caching pattern:

```js
export function initDOM() {
  refs = {
    contentArea: $('contentArea'),
    loader: $('loader'),
    playerBar: $('playerBar'),
    expPlayer: $('expPlayer')
  };
}
```

## Figma MCP Implementation Rules

Use these rules when converting a Figma screen into production code for this repo.

### Do

- Start from the correct entry surface: main site, AI page, Wenku page, Nianfo page, Gongxiu page, or admin page
- Reuse `src/css/tokens.css` variables before adding new colors, radii, shadows, or fonts
- Implement screens with HTML + vanilla JS rendering functions
- Place shared primitives in `ui.css`, `components.css`, or `cards.css`
- Place page-specific styling in the page CSS file that owns that surface
- Update `src/locales/*.json` when adding user-facing copy
- Maintain both light and dark compatibility when editing shared UI
- Use root-relative static asset paths for files under `public/`

### Do Not

- Do not generate React components, JSX, Tailwind classes, or CSS-in-JS
- Do not invent a token pipeline or component system that does not exist in the repo
- Do not scatter inline styles across JS templates unless it is a one-off dynamic measurement
- Do not introduce framework assumptions like props/state/hooks
- Do not store normal image assets under audio delivery paths

### Mapping Guide for New UI

Use this mapping when deciding where code should go:

| If the design change is... | Put structure in... | Put style in... |
|---|---|---|
| Main homepage or my page | `src/js/pages-home.js`, `src/js/pages-my.js` | `src/css/pages.css` |
| Category or episode list | `src/js/pages-category.js` | `src/css/cards.css` |
| Shared shell/header/tab bar | `index.html`, `src/js/main.js`, `src/js/dom.js` | `src/css/layout.css` |
| Shared button, chip, icon button | relevant page JS | `src/css/ui.css` |
| Overlay, modal, loader, empty/error state | relevant page JS | `src/css/components.css` |
| Player UI | `src/js/player.js` and related templates | `src/css/player.css` |
| AI standalone page | `src/js/ai-app.js` | `src/css/ai-page.css` |
| Wenku standalone page | `src/js/wenku-app.js` | `src/css/wenku-page.css` |

### Checklist Before Merging Figma-Derived UI

- Does it fit the existing vanilla JS architecture?
- Does it use existing tokens where possible?
- Does it keep touch targets large enough?
- Does it work in both light and dark themes if it belongs to shared UI?
- Does it place assets under `public/` and reference them with stable root-relative paths?
- Does it keep mobile-first spacing and hierarchy?
- Does it avoid introducing a fake component library abstraction?

## Primary References

- `README.md`
- `vite.config.js`
- `src/css/tokens.css`
- `src/css/ui.css`
- `src/css/layout.css`
- `src/css/cards.css`
- `src/css/components.css`
- `src/css/pages.css`
- `src/js/main.js`
- `src/js/pages-home.js`
- `src/js/pages-category.js`
- `src/js/icons.js`
- `src/js/theme.js`
- `public/_headers`
- `public/sw.js`
- `.impeccable.md`
