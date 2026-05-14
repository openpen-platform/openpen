# CLAUDE.md — OpenPen

## OVERVIEW & ARCHITECTURE
Cross-platform Electron + Vue 3 desktop overlay app for drawing on-screen during screen sharing. Transparent frameless window sits above all apps (including full-screen).

- **Dual-window, single Vue app**: Both windows load the same Vite build. Routing is handled via `?window=settings` / `?window=overlay` query string checked in `App.vue`.
- **State source of truth = Main Process**: Renderer is a thin client that only presents UI and reports events. Never hold authoritative state in Vue.
- **Slot-driven module architecture**: All features (freehand tool, color picker, eraser, stroke-width, etc.) are modules that contribute to declared slots. Built-in modules under `src/core/modules/` and third-party plugins under `~/.openpen/plugins/<id>/` share the same `OpenPenModule` contract from `@openpen/module-api`.
- **npm workspaces (monorepo)**: Host app at repo root; plugin SDK + CLIs + starter live under `packages/*` and publish to npm independently.

## STRUCTURE & WHERE TO LOOK
| Task / Domain | Location |
|---|---|
| Main process orchestrator | `electron/main.js` |
| Window lifecycle | `electron/window-manager.js` |
| System tray | `electron/tray-manager.js` |
| Global shortcuts | `electron/shortcut-manager.js` |
| User-settings persistence | `electron/settings-store.js` (settings + `controlBarLayout` + shortcuts) |
| Control bar layout schema | `packages/module-api/src/types/control-bar-layout.ts` (`ControlBarLayout`, `LayoutGroup`, `GroupInset`) |
| Plugin module manifest discovery | `electron/module-manifest-loader.js` |
| Plugin network audit log | `electron/audit-log.js` |
| Centralised file logger | `electron/logger.js` |
| Developer app config | `electron/config-loader.js` (loads `app.config.js`) |
| IPC channel constants (single source) | `electron/ipc-channels.js` |
| Renderer ↔ Main bridge | `electron/preload.js` |
| Vue components & composables | `src/components/`, `src/composables/` |
| Slot runtime + module loader (renderer) | `src/core/runtime/` |
| Built-in modules | `src/core/modules/` |
| Renderer config access | `src/services/config-bridge.ts` → `getAppConfig()` |
| Default settings schema | `shared/settings-defaults.{js,d.ts}` (defaults to `'en'`; first launch reads `app.getLocale()` via `resolveSystemLanguage`, falls back to `'en'`) |
| System tray / dock icons | root `assets/` (NOT `src/assets/`) |
| Plugin SDK (public API) | `packages/module-api/` (npm: `@openpen/module-api`) |
| Plugin build CLI | `packages/build-cli/` (npm: `@openpen/build`) |
| Plugin install CLI | `packages/openpen-cli/` (npm: `openpen-cli`) |
| Plugin starter template | `packages/plugin-starter/` |
| Runtime bundles for plugin importmap | `scripts/build-runtime.mjs` → `dist/openpen-runtime/` |

---

## DOMAIN RULES: MAIN PROCESS (ELECTRON)
All files are ESM (`type: "module"`) except `preload.js` (CJS `require`). Reconstruct `__filename`/`__dirname` via `fileURLToPath(import.meta.url)` in every ESM file.

**1. Manager Pattern & Adding a New Manager**
Each domain has one manager file with private functions prefixed with `_` (e.g. `_registerIpcHandlers`). `main.js` is a pure orchestrator and only calls `init*` sequentially.
*SOP for new managers:*
1. Create `{domain}-manager.js` with `export function init{Domain}Manager(...)`.
2. Add constants to `ipc-channels.js`.
3. Register handlers inside `_registerIpcHandlers()` within the manager.
4. Call `init{Domain}Manager` in `main.js` `app.whenReady()`.
5. Expose APIs in `preload.js`.

**2. IPC Rules**
- Format: `{domain}:{action}` (e.g., `window:open-settings`).
- One-way (renderer→main): `ipcMain.on`. Two-way (needs return): `ipcMain.handle` + `ipcRenderer.invoke`.
- Main→renderer broadcast: `webContents.send(channel, payload)`.

**3. Window Management**
- **Settings**: `frame: false`, `transparent: true`, `hasShadow: false`, `alwaysOnTop: true`.
- **Top Level**: `'screen-saver'` — highest level, required for full-screen apps. Do not downgrade.
- **Settings Window**: Guard with `if (settingsWindow && !settingsWindow.isDestroyed())`. Use `show: false` + `ready-to-show` event to prevent flashes. Open → disable main window interaction (`_setMainWindowEnabled(false)`).
- **Mouse Passthrough**: `setIgnoreMouseEvents(true, { forward: true })` on main window when drawing mode is active.

**4. Preload Rules**
- Must use `require()` (CJS).
- All exposed functions live strictly under `window.openPenApi`.
- Event listeners must return an unsubscribe function: `() => ipcRenderer.removeListener(...)`.

**5. Plugin manifest loading**
- `module-manifest-loader.js` discovers plugins under `~/.openpen/plugins/<id>/manifest.json`, validates them, and broadcasts via `MODULE.MANIFESTS`.
- Plugin renderer entries load through the privileged `openpen-plugin://` scheme registered in `main.js` (resolves to the plugin file under `~/.openpen/plugins/`).
- Renderers MUST pull via `MODULE.GET_MANIFESTS` invoke (not rely on the broadcast push) to avoid race conditions where the renderer subscribes after the broadcast fires.

---

## DOMAIN RULES: RENDERER (VUE 3)
Composition API (`<script setup lang="ts">`) only. No Options API (`this`). **TypeScript** for all `src/` files. Electron main process (`electron/`) stays as JSDoc-annotated JavaScript (can't run `.ts` directly).

**TypeScript conventions:**
- `src/types/electron.d.ts` — ambient global: `Window.openPenApi: OpenPenApi` (no `export`)
- `src/types/tool-types.ts` — re-exports stroke / point interfaces from `@openpen/module-api`
- `src/types/settings.ts` — `AppSettings` / `UserShortcuts` types shared with main process
- Use `withDefaults(defineProps<{...}>(), {...})` for props with defaults; `defineProps<{...}>()` for required-only props
- Use TypeScript generics on refs: `ref<HTMLElement | null>(null)`, `ref<'solid' | 'gradient'>('solid')`, etc.
- Keep algorithm explanations and "why" comments; remove redundant `@param`/`@returns`/`@type`/`@typedef` JSDoc that TypeScript now handles
- `Record<string, any>` for `draft` / `getAppConfig()` return type (deeply nested runtime access)

**1. Electron API Bridge**
All Electron calls go through `window.openPenApi`. Always guard calls and unsubscribe on unmount:
```typescript
window.openPenApi?.someMethod();

let unsub: (() => void) | null = null;
onMounted(() => { unsub = window.openPenApi?.onSomeEvent(cb); });
onUnmounted(() => { unsub?.(); });
```

**2. Composables (`use*.ts`)**
- Wrap all reactive exported state with `readonly()`. Components cannot mutate internal state directly.
- Always expose a `cleanup()` function when setting timers/listeners, and call it in `onUnmounted`.

**3. Styling & UI**
- Use scoped styles in SFC. Transparent backgrounds, `backdrop-filter` glass effects.
- Set `pointer-events: none` for passthrough overlay areas.
- Set `-webkit-app-region: no-drag` on interactive elements inside draggable regions.

---

## MODULES & SLOTS

OpenPen is built as a slot-driven module system: built-in features and third-party plugins implement the same `OpenPenModule` contract from `@openpen/module-api`.

**Module contract**:
- A module declares an `id`, `version`, optional metadata, and `contributions` for one or more slots.
- Slots are the only way modules expose UI / behaviour to the host (declarative provides/consumes pattern).
- Modules MAY also register `lifecycle.onReady` / `onQuit` hooks and `system.shortcuts`.

**Slot taxonomy** (source of truth: `packages/module-api/src/slots.ts`):
- Canvas: `canvas.tools`, `canvas.shapes`, `canvas.stroke.style`, `canvas.history.commands`, `canvas.layers.background`, `canvas.layers.overlay`, `canvas.html.overlay`
- UI: `ui.control-bar`, `ui.settings.tabs`, `ui.cursors`, `ui.status`, `ui.modals`, `ui.tray.menu`
- System: `system.shortcuts`, `system.window.behaviors`, `system.locales`, `system.main.handlers`, `system.events`, `system.lifecycle`, `system.storage`

**Adding a built-in module**:
1. Create `src/core/modules/<id>/` with `index.ts` exporting `defineModule({...})` and a `contributions` array.
2. Register in `src/core/runtime/module-registry.ts` (`BUILT_IN_MODULES`).
3. Vue components imported by the module MUST come from `@openpen/module-api/uikit` (host-internal Vue imports are blocked by `tests/unit/moduleImportBoundary.test.ts`).
4. Follow `MODULE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` for the id.

**Renderer runtime** (`src/core/runtime/`):
- `contribution-store.ts` — slot → contributions registry (the spine of the system)
- `slot-runtime.ts` — Vue composables that subscribe to slot entries
- `module-loader.ts` — discovers + validates manifests, wires lifecycle
- `module-validator.ts` — id format + import boundary checks
- `module-registry.ts` — `BUILT_IN_MODULES` list (host-bundled modules)
- `event-bus.ts` — cross-module pub/sub for non-IPC events
- `bootstrap.ts` — boot sequence

**UIKit wrappers** (`packages/module-api/src/uikit/`):
Module-facing wrappers (`AppPopover`, `AppDialog`, `AppSlider`, `AppToggle`, `AppSegmented`, `AppSelect`, `AppTooltip`, `AppTabs`) over Reka UI. Modules MUST consume these wrappers — never `reka-ui` directly.

---

## DEVELOPMENT PRINCIPLES & WORKFLOW

**Core**
- **Functional First**: Ensure components are imported and rendered in `App.vue` before reporting completion.
- **Small steps**: Prefer sequential small tasks over parallel large ones. When uncertain, ask — don't guess.

**Workflow (MANDATORY)**
- **Tests required**: Unit Tests (logic core) + E2E Tests (user flows) for every task.
- **Run tests yourself before reporting done**: after any renderer / Electron / composable change, run `npm run test:unit` AND scope-targeted e2e (`npx playwright test tests/e2e/<scope>/`) — don't ask the user, don't report done on typecheck alone.
- **Full suite is pre-commit gate only**: run `npx playwright test # regression-gate` (bash ignores the comment; the hook uses it to allow the run) only as the final step before `git commit`. Do NOT run the full suite during iteration — it exceeds 100 specs and takes ~20 min.
- **Error recovery**: 3 consecutive test failures → stop retries → root-cause analysis → written report → discuss with human.

**Branch / PR workflow (MANDATORY)**
- **MUST** 所有 code / docs / config 改動走 feature branch + PR + squash merge — **MUST NOT** direct push main（緊急 hotfix / release-please-generated commits 例外，且 MUST user 明確授權）
- **MUST** branch naming: `<type>/<scope-or-description>` — type 對應 Conventional Commits（`feat` / `fix` / `docs` / `chore` / `build` / `ci` / `refactor` / `test` / `style`），例: `feat/laser-pointer-tool`、`fix/settings-dim-click`、`docs/plugin-quickstart-typo`
- **MUST** PR title 用 Conventional Commits 格式（squash merge 用 PR title 做 commit message，release-please 讀這個算版號）
- **MUST NOT** 用 `--no-verify`、force-push main、toggle branch protection 開 force-push — nuclear-reset 級別動作必須 user 明確授權
- **MUST** 跑 `npm run lint` / `type-check` / `test:unit` 在 push branch 前通過，避免 CI 撞紅

**Release pipeline**
- Steady-state by release-please + PAT (`RELEASE_PLEASE_TOKEN`)，merge 任何 release-worthy PR → release-please 自動 update release PR → user merge 後 tag + GitHub Release + npm publish + dmg/exe build 全自動
- 設定參考 / 撞坑 troubleshooting 全在 `.agents/skills/openpen-release/`（本地 only，不進 git history）
- 撞 pipeline 問題第一動作: `grep -r <symptom keyword> .agents/skills/openpen-release/references/troubleshooting.md`

**Commit Messages (MANDATORY)**
- **Language: English.** OpenPen is OSS; release-please copies commit messages verbatim into `CHANGELOG.md`, which is the public-facing release record for plugin authors worldwide. Non-English commits become unreadable CHANGELOG entries.
- **Format: Conventional Commits** — `<type>(scope): description`
  - Types: `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`
  - Scope (optional, lowercase): module / area name (`canvas`, `plugin-loader`, `module-api`, `tray`, `release`, etc.)
- **Breaking change**: `feat!:` prefix or `BREAKING CHANGE:` footer → release-please bumps major.
- **Body**: 2–4 parallel bullets covering goal / change / verification / risks. Wrap at 72 chars.
- **Version bumps and CHANGELOG entries are derived automatically by release-please from commit metadata.** Non-conforming commits silently disappear from release notes.

## TESTING STANDARD — ELECTRON ONLY (SUPREME RULE)

**This is a transparent frameless Electron overlay app. Browser preview (localhost:5173) looks COMPLETELY DIFFERENT from the real app.**

### ✅ Accepted: Playwright + Electron (`_electron` API) for behavior/flow tests
```bash
npx playwright test          # Run all E2E tests (real Electron)
npx playwright test <file>   # Run specific test file
```

Specs launch Electron through the shared helper in `tests/e2e/launch.js`. The helper creates an ephemeral `userData` dir per spec and seeds `config.json` with `{"language":"en"}` so the UI boots in English regardless of the host OS locale — English aria-label / data-tip selectors depend on this.
```javascript
import { test } from '@playwright/test';
import { launchElectronApp } from '../launch.js';

let electronApp;
test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});
test.afterAll(async () => { await electronApp?.close(); });
```
Under the hood the helper passes `OPENPEN_USER_DATA_DIR` in `env`; `electron/main.js` reads it at module load and calls `app.setPath('userData', ...)` before `app.whenReady()`. New specs MUST use the helper — do not call `electron.launch` directly.

`launchElectronAppProd()` is also available for tests that need to exercise the production bundle (`dist/index.html`) under a dev electron binary — used by `tests/e2e/prod-smoke.spec.js` (the `npm run test:prod-smoke` gate).

### ✅ REQUIRED for visual verification: desktop/system-level screenshots
For any visual sign-off (layout, spacing, arrow position, blur, overlay look), use **desktop-level system screenshots only** (OS-level capture while app is actually running on desktop).

### ❌ FORBIDDEN for visual sign-off
- **NEVER** use Playwright screenshots (`win.screenshot`) as final visual evidence.
- **NEVER** use browser/Vite screenshots (`localhost:5173`) for visual validation.
- **NEVER** report "looks correct" without desktop/system-level screenshot evidence.

### Window positioning in tests: use IPC, not BrowserWindow directly
```javascript
// ✅ Correct (uses IPC, same as user interaction)
await win.evaluate(async ({ x, y }) => {
  window.openPenApi.setWindowPosition({ x, y });
  await window.openPenApi.getWindowPosition();
}, { x: targetX, y: targetY });

// ❌ Wrong (bypasses IPC, causes errors in evaluate context)
await electronApp.evaluate(({ BrowserWindow }, p) => {
  BrowserWindow.getAllWindows()[0].setPosition(p.x, p.y);
}, pos);
```

---

## GLOBAL ANTI-PATTERNS
- **NEVER** add platform-specific behavior without a `process.platform` guard.
- **NEVER** hardcode IPC channel strings — import from `ipc-channels.js`.
- **NEVER** expose raw `ipcRenderer` or native objects directly in preload.
- **NEVER** use `nodeIntegration: true`.
- **NEVER** hold authoritative state in renderer/Vue, or use `$emit` for cross-component state, or fetch settings from `localStorage` — always IPC to main.
- **NEVER** import from `electron` directly in the renderer process.
- **NEVER** put tray/Electron assets in `src/assets/` — use root `assets/`.
- **NEVER** create a second Vue app or second `index.html` — use the `?window=settings` / `?window=overlay` pattern.
- **NEVER** use pixel-level hit detection for the eraser — use geometric path intersection.
- **NEVER** import `APP_CONFIG_DEFAULTS` directly — it is a private constant inside `electron/config-loader.js`. Renderer reads app config only via `getAppConfig()` from `src/services/config-bridge.ts`.
- **NEVER** call `electron.launch()` directly in an e2e spec — always go through `tests/e2e/launch.js:launchElectronApp()` so each spec gets an isolated, English-seeded userData dir.
- **NEVER** hardcode a CJK aria-label / data-tip in an e2e selector to chase a failing test. Default locale is `'en'`; failing selectors mean either (a) `src/i18n/en.ts` changed and the selector must follow, or (b) `config.json` seeding broke.
- **NEVER** import `reka-ui` directly from a module — use the wrappers in `@openpen/module-api/uikit`. Direct `reka-ui` imports break the import-boundary test and the host's exit plan if the underlying library changes.
- **NEVER** reach into host internals (`src/components/*`, `src/composables/*`) from a module — modules consume the host only through `@openpen/module-api` and its `uikit` / `host` sub-paths.
- **NEVER** use relative imports inside `packages/module-api/src/uikit/**` for any value whose **identity** matters across the host/uikit boundary — Vue `InjectionKey` Symbols, module-scoped reactive refs (`ref()`, `reactive()`), singleton stores, class instances. The runtime build (`scripts/build-runtime.mjs`) externalises `'@openpen/module-api'` and `'@openpen/module-api/uikit'`, and the importmap routes them to `dist/openpen-runtime/*.js`. Relative imports bypass the externalize → the value is duplicated into the host bundle while the runtime bundle has its own copy → host's `provide()`/writes and uikit's `inject()`/watches miss each other (popover never opens, dialog never opens). Always import from `'@openpen/module-api'` or `'@openpen/module-api/uikit'`. Verify after `npm run build`: `grep "<symbol>" dist/assets/index-*.js` should show only `as <alias>` rename references, never a fresh definition. `npm run test:prod-smoke` is the regression gate.
- **Naming convention**: "settings" = user preferences (`settingsWindow`, `SETTINGS` IPC, `settings-store`). "config" = developer Config as Code (`app.config.js`, `config-loader`, `config-bridge`).

---

## COMMANDS

```bash
npm run dev              # Vite dev server + Electron concurrently
npm run type-check       # vue-tsc on host + module-api
npm run lint             # ESLint on src/
npm run test:unit        # Unit tests (Vitest)
npx playwright test      # E2E tests (Playwright + Electron)
npm run build            # Vite build → dist/ (runs type-check + build:runtime)
npm run build:runtime    # Bundle vue / module-api / module-api-uikit for plugin importmap
npm run test:prod-smoke  # Smoke test against the production bundle
npm run dist:mac         # Build .dmg for macOS (arm64 + x64, see docs/guides/building.md)
npm run dist:win         # Build NSIS installer for Windows
npm run dist:linux       # Build .AppImage for Linux
npm run dist             # Build for current platform (auto-detected)
```
