# Contributing to OpenPen

Thank you for your interest in contributing to OpenPen.

## Ways to Contribute

- **Bug reports** — Open an issue with steps to reproduce
- **Feature requests** — Open an issue describing the use case
- **Plugin development** — Build and share plugins (see [Module Architecture](./docs/concepts/module-architecture.md))
- **Code contributions** — Fix bugs, implement features, improve docs

---

## Development Setup

**Requirements:** Node.js 20+, npm 9+. Works on macOS, Windows, and Linux

The repo uses npm workspaces — install with npm, **not** pnpm or yarn.

```bash
# Fork the repo, then clone your fork
git clone https://github.com/<your-username>/openpen
cd openpen
npm install

# Start dev server (Vite + Electron)
npm run dev

# Run unit tests
npm run test:unit

# Run E2E tests (requires desktop environment)
npx playwright test
```

---

## Architecture Overview

OpenPen is an Electron + Vue 3 desktop overlay app, built around a **slot-driven module architecture** — every feature (drawing tools, UI panels, shortcuts, settings) is a module that plugs into declared slots. Built-in modules and third-party plugins implement the same `OpenPenModule` contract, so anything shippable as a plugin could equally land as a built-in (and vice versa).

```
electron/           Main process (Node.js)
  main.js           App entry point — initializes managers
  *-manager.js      Domain-specific managers (window, tray, shortcut, plugin...)
  ipc-channels.js   All IPC channel constants (single source of truth)
  preload.js        contextBridge API exposed to renderer

src/                Renderer process (Vue 3)
  App.vue           Root component — handles window routing (?window=settings)
  views/            Window-level views (OverlayView, SettingsView)
  components/       UI components
  composables/      Reactive logic (useDragSnap, useCanvas, ...)
  services/         Pure logic services (canvas-engine, stroke-store, registries)
  tools/            Drawing tool implementations

docs/               Documentation
packages/           Standalone packages
  openpen-cli/      npx openpen plugin manager
scripts/            Build / dev helpers wired to `npm run *` (see scripts/README.md)
tools/              Dev-only utilities and templates not part of the runtime (see tools/README.md)
```

**Key rules:**
- State source of truth = **main process**. Renderer is a thin client.
- All IPC channels are defined in `electron/ipc-channels.js`. Never hardcode strings.
- Composables always expose `cleanup()` and call it in `onUnmounted`.
- TypeScript-first implementation; JSDoc only where needed for JS interoperability.

---

## Adding a Built-in Drawing Tool

1. Create `src/tools/my-tool.ts` implementing the `Tool` interface:
   ```ts
   // Tool interface: onPointerDown / onPointerMove / onPointerUp
   export function createMyTool() {
     return {
       onPointerDown(ctx, point, style) { /* ... */ },
       onPointerMove(ctx, point) { /* ... */ },
       onPointerUp(ctx, point) { return stroke_or_null; },
     };
   }
   ```
2. Add the tool case to `src/composables/useCanvas.ts` `createToolFromConfig` switch.
3. Add a toolbar button in `ControlBar.vue`.
4. Add unit tests in `tests/unit/myTool.test.js`.

For **plugin tools** (without modifying the core codebase), see [Module Architecture](./docs/concepts/module-architecture.md).

---

## Adding a Built-in Shape

1. Add the draw logic as a case in `src/tools/shape-tool.ts` `drawShape`.
2. Register the shape in `src/tools/shape-tool.ts`:
   ```js
   registerShape({ id: 'my-shape', label: 'My Shape', isBuiltIn: true, draw: () => {} });
   ```
3. The shape will automatically appear in `ShapeSubPanel`.

---

## Testing

```bash
npm run lint
npm run type-check
npm run test:unit                         # Vitest unit tests
npx playwright test tests/e2e/<scope>/    # E2E specs for the area you changed (Playwright + real Electron)
npm run build                             # Vite build verification
```

Unit tests live in `tests/unit/`. E2E tests in `tests/e2e/`.

Run `npm run lint`, `npm run type-check` and `npm run test:unit` before every push. Run E2E specs when your change touches behaviour they cover (see the Definition of Done), and only the specs for that area; the full `npx playwright test` suite takes about 20 minutes, so keep it for changes that cut across many specs. CI runs lint, type-check, unit tests and an E2E smoke test against the production build on every PR.

Browser previews at `localhost:5173` look nothing like the real app (transparent window, drawing overlay, system-tray behaviour), so visual checks must happen in the running Electron app — see the Definition of Done below.

---

## Packaging & Distribution

Maintainers ship official releases through CI; the commands below are for
local testing and ad-hoc builds.

### Build commands

| Command | Output |
|---------|--------|
| `npm run dist:mac` | macOS `.dmg` (arm64 + x64) |
| `npm run dist:win` | Windows NSIS installer `.exe` (x64 + arm64) |
| `npm run dist:linux` | Linux `.AppImage` (x64 + arm64) |
| `npm run dist` | Current platform (auto-detected) |

Each `dist*` command runs three stages in order:

1. **`npm run build`** — TypeScript type-check (`vue-tsc`) + `vite build`.
2. **`npm run test:prod-smoke`** — Playwright smoke test against the production
   bundle (`tests/e2e/prod-smoke.spec.js`); catches dev/prod parity regressions
   before they ship.
3. **`electron-builder`** — packages the production bundle for the target.

Output files land in `release/`. If the prod-smoke stage fails,
`electron-builder` is not invoked.

### macOS

**Artifact naming** — `.dmg` files carry an explicit `-arm64` or `-x64` suffix
(via `mac.artifactName` in `package.json`); the default would drop the suffix
on x64 and route Apple Silicon users to the Intel build by accident.

**First launch (ad-hoc signed build)** — macOS Gatekeeper blocks the app on
first run. Right-click the `.app` → **Open**, then confirm. Or clear quarantine
from Terminal:

```bash
xattr -cr /Applications/OpenPen.app
```

**Code signing (Developer ID release)** — set these before `npm run dist:mac`:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

> **Hardened Runtime + entitlements** — `hardenedRuntime: true` is required for
> Apple notarization. Without a real Developer ID, ad-hoc-signed sub-bundles
> (Electron Framework, Helper apps) end up with mismatched team IDs and macOS's
> cross-team library validation refuses to launch the app ("cannot be opened
> because a problem occurred"). `build/entitlements.mac.plist` sets
> `com.apple.security.cs.disable-library-validation` so ad-hoc local builds
> still launch. Real Developer ID releases share a consistent team ID across
> sub-bundles and don't depend on this entitlement, but leaving it in is harmless.

### Windows

Must run on a Windows machine (or via CI). Windows SmartScreen warns on
unsigned `.exe` files; to sign with an EV certificate:

```cmd
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your_password
npm run dist:win
```

### Linux

Produces a portable `.AppImage` that runs on most x86_64 and arm64 distros
without installation. Mark it executable and run directly:

```bash
chmod +x release/OpenPen-*.AppImage
./release/OpenPen-*.AppImage
```

Linux runtime support is conditional: the full floating-ball experience needs an
X11/Xorg session, while native Wayland (GNOME) gets a reduced, fixed-bar
experience. See [docs/troubleshooting/linux-wayland.md](docs/troubleshooting/linux-wayland.md)
for the feature matrix and the reasons.

### Cross-platform builds from a macOS host

| Target | From macOS | Notes |
|--------|-----------|-------|
| macOS `.dmg` | ✅ Native | |
| Linux `.AppImage` | ✅ Works | Requires Docker or local build tools |
| Windows `.exe` | ⚠️ Partial | Signing requires Windows or a certificate service |

For reliable multi-platform releases, use CI jobs on all three OSes.

---

## Code Style

- **Composition API only** — no Options API, no `this`
- **TypeScript-first** — keep types explicit and avoid `any` unless justified
- **scoped styles** in Vue SFCs
- Follow the existing naming patterns in each directory

---

## Submitting a Pull Request

1. Fork the repo and create a branch from `main` (see [Branch names](#branch-names))
2. Make your changes with tests
3. Open a PR against `main` with a Conventional Commits title (see [PR title](#pr-title)) and a clear description of what and why
4. Work through the Definition of Done below; the PR template repeats it as a checklist

### Branch names

`<type>/<scope-or-description>` — examples:

- `feat/laser-pointer-tool`
- `fix/settings-dim-click`
- `docs/plugin-quickstart-typo`
- `chore/bump-electron`

Allowed types: `feat`, `fix`, `docs`, `chore`, `build`, `ci`, `refactor`, `test`, `style`, `perf`, `revert`.

### PR title

OpenPen uses [Conventional Commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated versioning. The PR title matters most: it becomes the squash commit message, and release-please reads it to decide the next version.

```
fix(settings-window): prevent dimmed main from stealing clicks
feat(canvas): add laser pointer module
docs(plugin-quickstart): correct degit subpath
```

Effect on the next release:

| PR title prefix | Next version bump |
|---|---|
| `feat:` | minor (1.x.0) |
| `fix:` | patch (1.0.x) |
| `docs:` `chore:` `ci:` `build:` `style:` `test:` `refactor:` | no bump |
| `feat!:` or footer `BREAKING CHANGE:` | major (2.0.0) — use sparingly, only when there is a true contract break |

### Merge strategy

All PRs are **squash-merged**. `main` stays linear and each commit on `main` corresponds to exactly one merged PR. Commit freely on your feature branch — its commit history is discarded after the squash.

`main` is configured to require:
- All CI checks green (lint / type-check / unit tests / E2E prod smoke)
- A pull request (no direct pushes to `main`)
- Linear history (no merge commits)

### Definition of Done

A PR is ready for review when every item holds. Items marked *if* apply only when their condition is met; otherwise tick them and add "n/a".

- [ ] **Checks pass** — `npm run lint`, `npm run type-check` and `npm run test:unit` pass locally, and new behaviour is covered by a test. If the change touches behaviour covered by E2E specs, `npx playwright test tests/e2e/<scope>/` passes as well.
- [ ] **No regressions** — no existing test was broken, skipped or deleted to make the change pass.
- [ ] **Scope matches the description** — every changed file is explained by the PR description; unrelated fixes go in a separate PR.
- [ ] **No leftovers** — no commented-out code, debug output or temporary workarounds.
- [ ] **Follows existing conventions** — naming, formatting and error handling match the surrounding code (see [Code Style](#code-style)).
- [ ] **Docs updated** *(if user-visible or plugin-facing behaviour changes)* — the affected pages under `docs/` and `packages/*/README.md` are updated in the same PR.
- [ ] **Verified in the real app** *(if the change is visual)* — the PR includes a screenshot of the running Electron app taken with the OS screenshot tool; browser previews and Playwright screenshots do not show the transparent overlay.
- [ ] **Plugin author flow still works** *(if the change touches `packages/`)* — [Build your first plugin](./docs/tutorials/build-your-first-plugin.md) still runs end to end.
- [ ] **Signed off** — every commit carries a `Signed-off-by` line (see [Sign your commits](#sign-your-commits-dco)).

---

## Sign your commits (DCO)

OpenPen uses the Developer Certificate of Origin to certify that
contributors have the right to submit their code under the project's
GPL-3.0-or-later license. All commits MUST include a `Signed-off-by` line:

```bash
git commit -s -m "your message"
```

This appends a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

Make sure your local `git config user.name` and `user.email` match
your GitHub identity. PRs without sign-off will be flagged for amendment.

---

## License

OpenPen is licensed under the GNU General Public License v3.0 or later, with the OpenPen Plugin Linking Exception (see [LICENSE](./LICENSE)). By contributing, you agree that your contributions are licensed under the same terms.

---

## Security

For vulnerabilities and trust-model concerns, follow [SECURITY.md](./SECURITY.md). Do **not** open a public issue for security reports.

---

## Building a Plugin Instead?

If you want to add new drawing tools, shapes, or settings tabs **without modifying the core**, see the **[Module Architecture](./docs/concepts/module-architecture.md)** — it's the recommended way to extend OpenPen. To get started, follow [Build your first plugin](./docs/tutorials/build-your-first-plugin.md).

---

## Releasing

OpenPen uses release-please for automated multi-platform releases. Release operations are handled by maintainers; contributors do not need to perform any release steps.

---

## Plugin naming guidelines

If you publish an OpenPen plugin to npm, GitHub, or any distribution
channel, please follow these naming conventions to avoid user confusion
and trademark misuse:

- **Do NOT include** `Official`, `Verified`, or any term that implies
  endorsement by the OpenPen project unless explicitly authorized.
- **Indicate the plugin relationship clearly**, e.g. `*-for-openpen`,
  `openpen-plugin-*`, or `<your-name>'s OpenPen plugin`.
- **Do NOT use** the exact name `OpenPen` as the primary identifier of
  your plugin (e.g. `openpen-tools` is misleading).
- **Avoid imitating official branding** — don't reuse the OpenPen logo
  or wordmark in a way that implies your plugin is shipped by us.

These are guidelines, not legal restrictions; we will reach out to
clarify if a plugin name appears likely to confuse users.
