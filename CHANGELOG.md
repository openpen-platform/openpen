# Changelog

## [1.0.0](https://github.com/openpen-platform/openpen/compare/v0.9.0...v1.0.0) (2026-05-13)

First public release. Establishes the OpenPen module / plugin architecture,
the initial UIKit wrapper set, and the end-to-end plugin lifecycle.

### Platforms

| Platform | Artifacts | Status |
|---|---|---|
| macOS | `.dmg` (arm64 + x64) | ✅ Supported |
| Windows | `.exe` (x64) | ✅ Supported |
| Linux | — | ⚠️ Not in v1.0.0 — overlay layering issue, will ship in a follow-up release |

### Added

#### Versioning
- All four OpenPen packages — the host app, `@openpen/module-api`,
  `@openpen/build`, and `openpen-cli` — release at `1.0.0` and ship
  in lockstep.
- `OpenPenModule` accepts an optional `minAppVersion` field; the plugin
  loader skips any plugin whose declared minimum exceeds the running
  host version and surfaces a warning in the log.

See [docs/concepts/plugin-compatibility.md](docs/concepts/plugin-compatibility.md)
for the compatibility model, version matrix, and next major policy.

#### Diagnostics
- File-based crash and error logger (`electron-log`) writes to OS-standard
  log paths so users can attach `main.log` to bug reports. Captures Vue
  errors, renderer crashes, uncaught exceptions, and unhandled promise
  rejections.

#### Core app
- Cross-platform Electron + Vue 3 transparent overlay for on-screen drawing
  during screen sharing.
- Per-display snap geometry with edge-aware vertical bar (`snap-left`,
  `snap-right`).
- Idle ball-fade + auto-collapse with popover-aware suspension so open
  modules never get dropped from under the cursor.
- User-customisable built-in shortcuts: a Settings → Shortcuts tab lets
  the user rebind `toggleDrawingMode`, `undo`, and `redo` at runtime.
  Bindings persist to `config.json#userShortcuts`, broadcast via
  `SHORTCUTS.UPDATED`, and re-register through a try-new-first path so
  a failed registration leaves the existing binding intact.

#### Module / plugin architecture
- Four-layer plugin-host architecture: core / host chrome / UIKit /
  built-in modules + plugins. Built-in modules and third-party plugins
  share the same `OpenPenModule` contract.
- Contribution slot registry (`canvas.tools`, `ui.control-bar`, `ui.modals`,
  `ui.cursors`, `system.shortcuts`, `system.locales`).
- `@openpen/module-api` SDK with `defineModule()`, contribution types,
  and Zod-backed runtime validation at module boundaries.
- `ctx.notify()` and host notification service: modules call
  `ctx.notify(payload)` in `setup()` or shortcut handlers to show
  ephemeral toast feedback in the overlay window. `NotifyPayload`
  supports i18n `LocaleMap`, `variant` (default / success / warning /
  danger), and `duration` (ms, 0 = sticky). Returns `NotifyHandle` with
  `dismiss()` for early dismissal. Position controlled by the user's
  `notificationPosition` setting (9 tokens).
- `@openpen/module-api/uikit` wrappers (8 components):
  `AppPopover`, `AppDialog`, `AppSlider`, `AppToggle`, `AppSegmented`,
  `AppSelect`, `AppTooltip`, `AppTabs`. Each ships with a contract test
  pinning props / events / slots so the underlying headless library
  (Reka UI ~2.9.6) can be swapped without breaking plugin code.
- Per-group `inset` config on the control-bar layout. Enabling inset
  guarantees zero increase to bar height (inner items shrink to 30 px).
- One-shot layout migration: legacy configs with `eraser` inside the
  `tools` group are auto-repaired to the design-canonical shape on boot.

#### Plugin SDK + tooling
- `@openpen/build` CLI: zero-config Vite preset for plugin authors. Inlines
  plugin scoped CSS into `dist/renderer.js` via
  `vite-plugin-css-injected-by-js@~4.0.1` so single-file shipment "just
  works".
- `openpen-cli` (`npx openpen`): `plugin add` (local path / npm / GitHub
  source with auto-build), `plugin list`, `plugin remove`. Installs only
  `plugin.json + dist/` — never `src/`, `node_modules/`, or `.git/`.
  Removal is a clean `fs.rmSync` — host L3b repair sweeps any leftover
  layout entries on next boot.
- ESM importmap-based runtime sharing: host emits stable
  `dist/openpen-runtime/{vue,module-api,module-api-uikit}.js` shims and
  `index.html` declares an importmap, so plugins import bare `vue` /
  `@openpen/module-api` and resolve to the **same** Vue instance the host
  uses (single reactive graph, no duplication, no version drift).
- Vite dev middleware (`/openpen-runtime/*`) using virtual modules +
  `transformRequest` so plugin loading works under `npm run dev` without
  importmap cycles or default-export mismatches.
- `packages/plugin-starter`: minimal `degit`-able template demonstrating
  `defineModule` + `AppPopover` + `AppSlider`, complete with Vue
  type-shim so `npm run check` is green out of the box.

#### Documentation
- `docs/reference/uikit.md` covers the eight UIKit wrappers;
  `docs/reference/primitives.md` documents the low-level primitives +
  tokens.css + escape hatch.
- `docs/concepts/module-architecture.md` describes the three-layer model
  and module contract.
- `docs/reference/slots.md` lists every contribution slot with the
  `ControlBarContribution` interface inlined.
- `CONTRIBUTING.md` (root) covers contribution workflow + DCO sign-off
  policy.

### Security

OpenPen follows a **user-installed trust model**: plugins run in the
same renderer as the host with full access to the shared Vue instance
and `window.openPenApi`. Users MUST evaluate plugin sources before
installing.

### Known limitations
- **Linux artifact not shipped**: AppImage build is gated on an upstream
  overlay layering issue. Will ship in a follow-up release.
- **Plugin-contributed shortcut customisation** is on the roadmap;
  v1.0.0 only customises built-in shortcuts.
- Plugin development under `npm run dev` is supported but lightly tested.

### Note

The first GitHub Release pipeline run for v1.0.0 had a misconfiguration
on our side. **If you downloaded v1.0.0 before 2026-05-14 13:00 UTC+8
(05:00 UTC), please re-download** — the artifacts attached to this
release have since been rebuilt and republished.

Apologies for the inconvenience. This was OpenPen's first end-to-end
release through automated CI, and we're learning as we go. Discussion,
bug reports, and suggestions on how to improve the release process are
all very welcome. Thank you.
