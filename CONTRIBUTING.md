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

```bash
git clone https://github.com/openpen-platform/openpen
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
npm run test:unit       # Vitest unit tests
npx playwright test     # E2E tests (Playwright + real Electron)
npm run build           # Vite build verification
npm run dist:mac        # macOS .dmg
npm run dist:win        # Windows .exe installer
npm run dist:linux      # Linux .AppImage
```

For code signing, cross-platform builds, and CI setup, see [guides/building.md](./guides/building.md).

Unit tests live in `tests/unit/`. E2E tests in `tests/e2e/`.

All PRs must pass unit tests. E2E tests are run manually before releases.

---

## Code Style

- **Composition API only** — no Options API, no `this`
- **TypeScript-first** — keep types explicit and avoid `any` unless justified
- **scoped styles** in Vue SFCs
- Follow the existing naming patterns in each directory

---

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes with tests
3. Run `npm run test:unit` — all tests must pass
4. Open a PR with a clear description of what and why

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

## Building a Plugin Instead?

If you want to add new drawing tools, shapes, or settings tabs **without modifying the core**, see the **[Module Architecture](./docs/concepts/module-architecture.md)** — it's the recommended way to extend OpenPen.

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
