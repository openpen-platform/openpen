# scripts/

Build, dev-server, and helper scripts that back OpenPen's `npm run *` commands.

## Files

| File | npm script | What it does |
|---|---|---|
| `build-runtime.mjs` | `build:runtime` (chained into `build`) | Bundles `vue`, `@openpen/module-api`, and `@openpen/module-api/uikit` into `dist/openpen-runtime/` so plugin importmaps can pin a single shared copy of each. Output is part of the production build. |
| `launch-electron.mjs` | `dev` (via `concurrently` after vite) | Launches Electron once the vite dev server is reachable on port 5173. Sets `ELECTRON_OZONE_PLATFORM_HINT=wayland` on Linux so Chromium picks Ozone Wayland before any window is created. |
| `serve-catalog.mjs` | `catalog:serve` | Tiny dev-only HTTP server (port 3001) that serves `examples/catalog/plugins.json` with CORS open. Used when iterating on the in-app plugin marketplace UI without depending on the real GitHub catalog. |

## Adding a script

1. Add the file here as an `.mjs` (ESM).
2. Wire it via a `package.json` script if it's part of a regular dev workflow.
3. Add a row to the table above.

Scripts that aren't general contributor workflow (e.g. maintainer-only VM bootstrap) belong elsewhere — keep this folder focused on commands every contributor might run.
