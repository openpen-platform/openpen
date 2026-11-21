# scripts/

Build, dev-server, and helper scripts that back OpenPen's `npm run *` commands.

## Files

| File | npm script | What it does |
|---|---|---|
| `build-runtime.mjs` | `build:runtime` (chained into `build`) | Bundles `vue`, `@openpen/module-api`, and `@openpen/module-api/uikit` into `dist/openpen-runtime/` so plugin importmaps can pin a single shared copy of each. Output is part of the production build. |
| `check-internal-refs.mjs` | `lint` (chained after ESLint and `check-syntax.mjs`) | Fails when code, test or locale files (`.js/.mjs/.cjs/.jsx/.ts/.mts/.cts/.tsx/.vue/.css/.html/.json/.yml/.yaml`) or Markdown under `docs/` mention an internal tracker id, so the public repo does not leak internal ticket numbers. Prints `file:line:column` only, never the matched text. Other Markdown, CHANGELOG files and lockfiles are not scanned. `--root <dir>` scans another git checkout. |
| `dev.mjs` | `dev` | Starts Vite via its programmatic API, waits for it to bind a port, then spawns Electron with `VITE_DEV_SERVER_URL` pointing at the resolved URL. Electron always loads the URL Vite actually chose, even if another project on the machine forced Vite off port 5173. Sets `ELECTRON_OZONE_PLATFORM_HINT=wayland` on Linux so Chromium picks Ozone Wayland before any window is created. |
| `serve-catalog.mjs` | `catalog:serve` | Tiny dev-only HTTP server (port 3001) that serves `examples/catalog/plugins.json` with CORS open. Used when iterating on the in-app plugin marketplace UI without depending on the real GitHub catalog. |

## Adding a script

1. Add the file here as an `.mjs` (ESM).
2. Wire it via a `package.json` script if it's part of a regular dev workflow.
3. Add a row to the table above.

Scripts that aren't general contributor workflow (e.g. maintainer-only VM bootstrap) belong elsewhere — keep this folder focused on commands every contributor might run.
