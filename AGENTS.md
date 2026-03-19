# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

净土法音 (Foyue) — a PWA audio streaming player for Buddhist Pure Land dharma content. Single Vite + Vanilla JS frontend with Cloudflare Pages Functions as backend. See `README.md` for full architecture.

### Development commands

See `package.json` scripts and `README.md` quick-start section. Key commands:

- `npm run dev` — Vite dev server on port 8080 with HMR
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

### Important caveats

- **No lint or test scripts are configured.** The project has no ESLint, Prettier, or test framework set up. Verification is done via `npm run build` (zero build errors) and manual browser testing.
- **API proxy and CORS:** `vite.config.js` proxies `/api` requests to `https://foyue.org`. The production API enforces CORS origin restrictions (`ALLOWED_ORIGINS`), so API data will **not** load from `localhost:8080`. The frontend UI shell loads correctly; only data-dependent content shows "Failed to load". This is expected behavior for local development without Cloudflare backend.
- **Full local backend** requires Wrangler: `npx wrangler pages dev dist --d1=DB` plus applying D1 migration SQL files from `workers/migrations/`. This is optional for frontend-only development.
- **Cloud-only services:** R2 audio storage, Workers AI, and Vectorize are only available on Cloudflare's platform — they cannot be run locally. Audio playback and AI features degrade gracefully without them.
- **No Docker, CI/CD, or Makefile** in this repository. Deployment is fully handled by Cloudflare Pages auto-deploy on push to `main`.
