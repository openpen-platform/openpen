# Changelog

## [1.2.0](https://github.com/openpen-platform/openpen/compare/v1.1.1...v1.2.0) (2026-05-24)


### Features

* **module-api:** add resolveStrokeColor helper for StrokeColor union ([75e9a9c](https://github.com/openpen-platform/openpen/commit/75e9a9c74d002393134931f9bc933b918c9d0391))
* **module-api:** ship dist + host services via registry injection ([ccae34f](https://github.com/openpen-platform/openpen/commit/ccae34f3030d9d5973336eb4882d4969d5f1b343))
* **openpen-cli:** add security prompt before plugin install ([d9342ae](https://github.com/openpen-platform/openpen/commit/d9342ae12810859c42a8378aaa54686355c05db6))
* **uikit:** add AppButtonDropdown and migrate built-in modules onto SDK button components ([5aeb7d3](https://github.com/openpen-platform/openpen/commit/5aeb7d34f58d5291546cfeca15cf7f3ee8c9b4ba))


### Bug Fixes

* **boot:** gate App.vue content-ready signal for settings window ([3be53aa](https://github.com/openpen-platform/openpen/commit/3be53aa2341170ec56bb8db02a572a81dfe08687))
* **boot:** signal renderer content ready before module bootstrap ([0551f2a](https://github.com/openpen-platform/openpen/commit/0551f2a5124039c867fbdef06e0213920862f987))
* **cli:** substitute package.json name in scaffold ([b28742f](https://github.com/openpen-platform/openpen/commit/b28742f73d796f872aa95e167701c73c78f257db))
* **dev:** prevent overlay lockout from Vite port collision and renderer hang ([753057f](https://github.com/openpen-platform/openpen/commit/753057fb8d8420e771f4f65c17519956fd673786))
* **e2e:** restore green baseline across all scopes ([7576694](https://github.com/openpen-platform/openpen/commit/757669456db6554798409e5c4d572b7f0c251ea1))
* **main:** wrap whenReady init chain in single try-catch ([53a9b0b](https://github.com/openpen-platform/openpen/commit/53a9b0b62734671c04d0cb86d1929a9b78b35cef))
* **plugin-meta:** align MODULE_ID_RE with scoped format ([ad78aa7](https://github.com/openpen-platform/openpen/commit/ad78aa75ea3cc303aa93705dd022df0670e3807a))

## [1.1.1](https://github.com/openpen-platform/openpen/compare/v1.1.0...v1.1.1) (2026-05-19)


### Bug Fixes

* **release-please:** correct per-package CHANGELOG path nesting ([d151e9d](https://github.com/openpen-platform/openpen/commit/d151e9def2fa82234b1c24a1d7f83f06988c0e36))
* **runtime:** substitute import.meta.env.* in plugin runtime shims ([6c50e01](https://github.com/openpen-platform/openpen/commit/6c50e01cbcd3016ee62e2146f4fb572c3afab4b0))

## [1.1.0](https://github.com/openpen-platform/openpen/compare/v1.0.2...v1.1.0) (2026-05-19)

Cursor presentation overhaul and a richer plugin install flow, plus a batch of control-bar and canvas reliability fixes.

### Features

- **cursors**: New DOM-overlay cursor system. The drawing cursor is rendered by the renderer process as a positioned DOM element rather than the OS cursor, so per-tool visuals (colour, size, shape, hover-on-interactive feedback) stay in sync with the active drawing tool and brush size, even when the OS cursor would otherwise be hidden by passthrough or full-screen apps. The plugin SDK reference also gained the missing `ui.cursors` slot documentation and several previously undocumented UIKit primitives. ([2f77192](https://github.com/openpen-platform/openpen/commit/2f771927fb94586b0ceef58e07fcb5220ed40c02))
- **plugin-install**: The Add Custom dialog can now accept `.zip` archive sources in addition to the previous catalog / direct-url entries. The dialog UX itself was reworked — clearer source-type selection, validation feedback, and inline progress while the catalog or archive is being fetched. ([1098fd9](https://github.com/openpen-platform/openpen/commit/1098fd97ab74eafcb6692144c1b9c6aa949c3508))

### Bug Fixes

- **canvas**: Stroke style (brush colour / width / opacity) is now seeded from the active module's defaults at boot instead of starting at an uninitialised state. Previously the first stroke after launch could render with stale or zero-value parameters until the user touched the stroke-style picker once. ([1a8f6b0](https://github.com/openpen-platform/openpen/commit/1a8f6b0f3cc36a42be4ecabe307065dcd7189d52))
- **control-bar**: The Settings button is now disabled while drawing mode is active. Opening Settings during a live drawing session previously tore down the overlay window's mouse-passthrough wiring, leaving the cursor stuck in a half-state once the dialog closed. ([2d60f7f](https://github.com/openpen-platform/openpen/commit/2d60f7fb3d3284efb03ac3a0ab8cd6466be4bbce))
- **control-bar**: The auto-collapse timer is paused while any dialog (Settings, plugin install, Add Custom) is open. The bar previously could collapse out from under an open dialog and orphan it. ([#1](https://github.com/openpen-platform/openpen/issues/1)) ([add84ff](https://github.com/openpen-platform/openpen/commit/add84ff89f1ad5135c7371fd7d4bfd64b1ef2395))
- **drawing-mode** (macOS): Repaired sporadic drawing-mode entry when the global shortcut fired while the pointer was off the overlay (over the dock / menu bar / a secondary display). The same-state re-entry path no longer races the cursor wake-up burst, and a stale `pointerleave` no longer leaves the overlay cursor invisible after entry. ([564046d](https://github.com/openpen-platform/openpen/commit/564046d27e2b066411f6df3dde6f3c0bcad48a23))

### For plugin authors and downstream packagers

- **TypeScript 6.0 compatibility**: The repo and all published packages compile cleanly under both TypeScript 5.9 and 6.0. `@openpen/plugin-manager` declares `@types/node` directly (previously inherited transitively via vitest) and its `tsconfig.build.json` pins `rootDir` and `types: ["node"]` explicitly, so the build no longer depends on TypeScript's auto type-acquisition heuristics. The Dependabot TS 6.0.3 bump rides in this release. ([#22](https://github.com/openpen-platform/openpen/pull/22))
- **Dependency hygiene**: A grouped Dependabot batch landed — jsdom 27 → 29, eslint 9 → 10, wait-on 8 → 9, and a production-minor-patch group covering three runtime packages. No behaviour changes expected; flagged here so reproducible-build setups have an accurate manifest. ([#18](https://github.com/openpen-platform/openpen/pull/18) – [#23](https://github.com/openpen-platform/openpen/pull/23))

## [1.0.2](https://github.com/openpen-platform/openpen/compare/v1.0.1...v1.0.2) (2026-05-14)


### Bug Fixes

* **docs:** scrub `npx openpen` typosquat from package READMEs ([6e05267](https://github.com/openpen-platform/openpen/commit/6e05267909b5168cad7a61d38639fca2aa11e96e))
* **plugin-manager:** add README so npm package page is not blank ([080f2c5](https://github.com/openpen-platform/openpen/commit/080f2c5656e031bd70da852545194c34ca8e702f))

## [1.0.1](https://github.com/openpen-platform/openpen/compare/v1.0.0...v1.0.1) (2026-05-14)

Hotfix release. Unblocks third-party plugin author onboarding that was broken in v1.0.0, and ships `@openpen/plugin-manager` to npm for the first time alongside its sibling SDK packages.

### Bug Fixes

- **docs**: `npx openpen <verb>` invocations throughout the docs resolved to an unrelated package on npm (the bare `openpen` name is occupied by a fuzzing tool by another author). All commands now read `npx openpen-cli <verb>`.
- **docs**: The `plugin-starter` scaffold command in the README pointed at a non-existent GitHub repo. Updated to use the in-repo starter via degit subpath syntax: `npx degit openpen-platform/openpen/packages/plugin-starter`.
- **ci**: The npm publish step was guarded by a single-package existence check; if any one workspace was already on npm, the whole publish job short-circuited and silently skipped the rest. This is why `@openpen/plugin-manager` never reached the registry alongside the other v1.0.0 packages. Replaced with a per-workspace publish loop that inspects each `packages/*` independently, skips private packages and already-published versions, and never aborts the others on a single failure.

### Packages on npm

`@openpen/plugin-manager@1.0.0` ships to npm for the first time in this release, making `npm install openpen-cli` work for external developers. The other workspaces (`@openpen/module-api`, `@openpen/build`, `openpen-cli`) remain at their v1.0.0 versions on npm (no code changes to those packages in v1.0.1).

### Note

If you tried to develop an OpenPen plugin while v1.0.0 was the latest release and hit `npx openpen` invocation errors or `npm install openpen-cli` 404s, please retry now — the v1.0.1 hotfix removes both blockers.

## [1.0.0](https://github.com/openpen-platform/openpen/compare/v0.9.0...v1.0.0) (2026-05-13)

First public release. Establishes the OpenPen module / plugin architecture, the initial UIKit wrapper set, and the end-to-end plugin lifecycle.

### Platforms

| Platform | Artifacts | Status |
|---|---|---|
| macOS | `.dmg` (arm64 + x64) | ✅ Supported |
| Windows | `.exe` (x64) | ✅ Supported |
| Linux | — | ⚠️ Not in v1.0.0 — overlay layering issue, will ship in a follow-up release |

### Added

#### Versioning
- All four OpenPen packages — the host app, `@openpen/module-api`, `@openpen/build`, and `openpen-cli` — release at `1.0.0` and ship in lockstep.
- `OpenPenModule` accepts an optional `minAppVersion` field; the plugin loader skips any plugin whose declared minimum exceeds the running host version and surfaces a warning in the log.

See [docs/concepts/plugin-compatibility.md](docs/concepts/plugin-compatibility.md) for the compatibility model, version matrix, and next major policy.

#### Diagnostics
- File-based crash and error logger (`electron-log`) writes to OS-standard log paths so users can attach `main.log` to bug reports. Captures Vue errors, renderer crashes, uncaught exceptions, and unhandled promise rejections.

#### Core app
- Cross-platform Electron + Vue 3 transparent overlay for on-screen drawing during screen sharing.
- Per-display snap geometry with edge-aware vertical bar (`snap-left`, `snap-right`).
- Idle ball-fade + auto-collapse with popover-aware suspension so open modules never get dropped from under the cursor.
- User-customisable built-in shortcuts: a Settings → Shortcuts tab lets the user rebind `toggleDrawingMode`, `undo`, and `redo` at runtime. Bindings persist to `config.json#userShortcuts`, broadcast via `SHORTCUTS.UPDATED`, and re-register through a try-new-first path so a failed registration leaves the existing binding intact.

#### Module / plugin architecture
- Four-layer plugin-host architecture: core / host chrome / UIKit / built-in modules + plugins. Built-in modules and third-party plugins share the same `OpenPenModule` contract.
- Contribution slot registry (`canvas.tools`, `ui.control-bar`, `ui.modals`, `ui.cursors`, `system.shortcuts`, `system.locales`).
- `@openpen/module-api` SDK with `defineModule()`, contribution types, and Zod-backed runtime validation at module boundaries.
- `ctx.notify()` and host notification service: modules call `ctx.notify(payload)` in `setup()` or shortcut handlers to show ephemeral toast feedback in the overlay window. `NotifyPayload` supports i18n `LocaleMap`, `variant` (default / success / warning / danger), and `duration` (ms, 0 = sticky). Returns `NotifyHandle` with `dismiss()` for early dismissal. Position controlled by the user's `notificationPosition` setting (9 tokens).
- `@openpen/module-api/uikit` wrappers (8 components): `AppPopover`, `AppDialog`, `AppSlider`, `AppToggle`, `AppSegmented`, `AppSelect`, `AppTooltip`, `AppTabs`. Each ships with a contract test pinning props / events / slots so the underlying headless library (Reka UI ~2.9.6) can be swapped without breaking plugin code.
- Per-group `inset` config on the control-bar layout. Enabling inset guarantees zero increase to bar height (inner items shrink to 30 px).
- One-shot layout migration: legacy configs with `eraser` inside the `tools` group are auto-repaired to the design-canonical shape on boot.

#### Plugin SDK + tooling
- `@openpen/build` CLI: zero-config Vite preset for plugin authors. Inlines plugin scoped CSS into `dist/renderer.js` via `vite-plugin-css-injected-by-js@~4.0.1` so single-file shipment "just works".
- `openpen-cli` (`npx openpen`): `plugin add` (local path / npm / GitHub source with auto-build), `plugin list`, `plugin remove`. Installs only `plugin.json + dist/` — never `src/`, `node_modules/`, or `.git/`. Removal is a clean `fs.rmSync` — host L3b repair sweeps any leftover layout entries on next boot.
- ESM importmap-based runtime sharing: host emits stable `dist/openpen-runtime/{vue,module-api,module-api-uikit}.js` shims and `index.html` declares an importmap, so plugins import bare `vue` / `@openpen/module-api` and resolve to the **same** Vue instance the host uses (single reactive graph, no duplication, no version drift).
- Vite dev middleware (`/openpen-runtime/*`) using virtual modules + `transformRequest` so plugin loading works under `npm run dev` without importmap cycles or default-export mismatches.
- `packages/plugin-starter`: minimal `degit`-able template demonstrating `defineModule` + `AppPopover` + `AppSlider`, complete with Vue type-shim so `npm run check` is green out of the box.

#### Documentation
- `docs/reference/uikit.md` covers the eight UIKit wrappers; `docs/reference/primitives.md` documents the low-level primitives + tokens.css + escape hatch.
- `docs/concepts/module-architecture.md` describes the three-layer model and module contract.
- `docs/reference/slots.md` lists every contribution slot with the `ControlBarContribution` interface inlined.
- `CONTRIBUTING.md` (root) covers contribution workflow + DCO sign-off policy.

### Security

OpenPen follows a **user-installed trust model**: plugins run in the same renderer as the host with full access to the shared Vue instance and `window.openPenApi`. Users MUST evaluate plugin sources before installing.

### Known limitations
- **Linux artifact not shipped**: AppImage build is gated on an upstream overlay layering issue. Will ship in a follow-up release.
- **Plugin-contributed shortcut customisation** is on the roadmap; v1.0.0 only customises built-in shortcuts.
- Plugin development under `npm run dev` is supported but lightly tested.

### Note

The first GitHub Release pipeline run for v1.0.0 had a misconfiguration on our side. **If you downloaded v1.0.0 before 2026-05-14 13:00 UTC+8 (05:00 UTC), please re-download** — the artifacts attached to this release have since been rebuilt and republished.

Apologies for the inconvenience. This was OpenPen's first end-to-end release through automated CI, and we're learning as we go. Discussion, bug reports, and suggestions on how to improve the release process are all very welcome. Thank you.
