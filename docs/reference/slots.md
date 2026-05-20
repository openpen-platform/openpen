# OpenPen Contribution Slot Catalog

## Status legend

- ✅ **available** — wired through to a runtime adapter; usable today.
- ⏳ **reserved** — registrations accepted by the validator, adapter not yet implemented. Modules can ship against reserved slots and they will start working when the adapter lands, with no module-side changes required.

## Contribution key vs. slot id

Modules use ergonomic camelCase keys on `contributes` (`historyCommands`, `themeTokens`); the validator maps them to dotted slot ids (`canvas.history.commands`, `ui.theme.tokens`). The mapping lives in `CONTRIBUTION_KEY_TO_SLOT_ID`.

---

## Canvas (8 slots)

### `canvas.tools` — ✅ available
- **Contribution key**: `tools`
- **Type**: `ToolContribution[]`
- **Purpose**: Drawing tools driven by pointer events (`onPointerDown` / `onPointerMove` / `onPointerUp`).

#### Contribution shape

```ts
interface ToolContribution extends Tool {
  /** Tool id. Cursor contributions reference this via `CursorContribution.id`. */
  id: string
  /** Human-readable label for tooltips / a11y. */
  label?: string | LocaleMap
  /**
   * Inline SVG markup for the tool's control-bar button icon. Host
   * renders via `v-html`. Plugins providing a custom Vue button
   * component (via `ui.control-bar`) can omit this.
   */
  icon?: string
  /**
   * Custom redraw renderer. Called on history replay (undo / redo,
   * canvas restoration) with each Stroke this tool produced. Omit
   * for polyline-style tools — the canvas engine falls back to a
   * default polyline render through `stroke.points`.
   */
  renderStroke?: (canvasCtx: CanvasRenderingContext2D, stroke: Stroke) => void
}

interface Tool {
  /**
   * Pointer pressed. Tools that draw incrementally (most do) record
   * the first point here. `canvasCtx` is the live canvas — tools MAY
   * draw immediately (e.g. a dot at the press point) but must NOT
   * return the Stroke yet.
   */
  onPointerDown(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    style: StrokeStyle,
  ): void
  /**
   * Pointer moved with the button held. Most tools draw the next
   * segment of the stroke here using the live `canvasCtx`. Return
   * `true` to request a full canvas redraw (e.g. a stroke-eraser
   * just deleted an existing stroke and the canvas state changed).
   */
  onPointerMove(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers,
  ): void | boolean
  /**
   * Pointer released. Return the completed Stroke for the host to
   * push into the history store, or `null` to discard it (e.g. an
   * eraser tool that does not accumulate persistent state).
   */
  onPointerUp(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers,
  ): Stroke | null
  /**
   * When `true`, the canvas engine clears + redraws all previous
   * strokes on every `onPointerMove` before the tool draws this
   * frame's segment. Use for tools that show a live preview that
   * mutates with pointer position (e.g. a rectangle tool dragging
   * the opposite corner). Default `false` — most tools draw
   * incrementally and don't need this.
   */
  needsPreviewRedraw?: boolean
  /**
   * Optional companion to `needsPreviewRedraw`. Called every
   * pointermove AFTER the canvas has been cleared + redrawn with
   * historical strokes, just before `onPointerMove`. Use to draw
   * an in-progress preview that does not persist into history.
   */
  renderPreview?(canvasCtx: CanvasRenderingContext2D): void
}

interface Stroke {
  /** Globally unique id. `crypto.randomUUID()` is the conventional source. */
  id: string
  /** MUST match the `ToolContribution.id` that produced this stroke. */
  tool: string
  points: Point[]
  style: StrokeStyle
  /**
   * Tool-specific state. Tools MAY store arbitrary keys during the
   * pointer handlers; those keys survive into `renderStroke`.
   * TypeScript cannot infer the shape — cast at the read site.
   */
  [extraKey: string]: unknown
}

interface Point { x: number; y: number }

type StrokeColor =
  | string
  | { type: 'linear'; from: string; to: string }

interface StrokeStyle {
  /**
   * Solid color or linear gradient. Tools that render the stroke
   * themselves MUST handle both branches — pick `color.from` for
   * the gradient start when CanvasRenderingContext2D needs a single
   * colour string.
   */
  color: StrokeColor
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

interface PointerModifiers {
  shiftKey?: boolean
}
```

All of these types are re-exported from `@openpen/module-api` for direct import:

```ts
import type { Tool, Stroke, Point, StrokeStyle, StrokeColor, PointerModifiers } from '@openpen/module-api'
```

See `packages/plugin-starter/src/demo-tool.ts` for a complete, type-checked reference implementation. Use `resolveStrokeColor(color)` from `@openpen/module-api` to fold a `StrokeColor` into a single CSS string when assigning to `ctx.strokeStyle`.

### `canvas.shapes` — ✅ available
- **Contribution key**: `shapes`
- **Type**: `ShapeContribution[]`
- **Purpose**: Shape primitives (`circle`, `square`, `rect`, `roundrect`, plus plugin-provided shapes like `hexagon`, `flowchart-decision`).

### `canvas.stroke.style` — ✅ available
- **Contribution key**: `strokeStyle`
- **Type**: `StrokeStyleContribution`
- **Purpose**: Modules declare which keys of the shared stroke style store they write to (e.g. `['lineWidth']`, `['color']`). Conflict detection at validator time.

### `canvas.history.commands` — ⏳ reserved
- **Contribution key**: `historyCommands`
- **Type**: `HistoryCommandContribution[]`
- **Purpose**: Custom undo/redo command types beyond the built-in `ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL`.
- **Why reserved**: Canvas history adapter not yet implemented; undo/redo uses built-in command types only.

### `canvas.layers.background` — ✅ available
- **Contribution key**: `backgroundLayers`
- **Type**: `CanvasLayerContribution[]`
- **Purpose**: Render below strokes (grids, watermarks, background images). Each contribution gets a render callback with the canvas context.

### `canvas.layers.overlay` — ✅ available
- **Contribution key**: `overlayLayers`
- **Type**: `CanvasLayerContribution[]`
- **Purpose**: Render above strokes (rulers, snap guides, selection boxes).

### `canvas.html.overlay` — ✅ available
- **Contribution key**: `htmlOverlays`
- **Type**: `HtmlOverlayContribution[]`
- **Purpose**: Mount HTML / Vue components above the canvas (text annotations, image stickers, radial QuickMenu). This slot is stable (not reserved) because without it, future text-annotation plugins would force a canvas redesign. Architectural slots must land early.

### `canvas.stroke.transformers` — ⏳ reserved
- **Contribution key**: `strokeTransformers`
- **Type**: `StrokeTransformerContribution[]`
- **Purpose**: Post-process strokes after creation (smoothing, point simplification, glow effects). Receives a stroke, returns a transformed stroke.
- **Why reserved**: Performance and ordering semantics need real plugins to validate before committing.

---

## UI (9 slots)

### `ui.control-bar` — ✅ available
- **Contribution key**: `controlBar`
- **Type**: `ControlBarContribution[]`
- **Purpose**: Buttons / sliders / popup triggers in the control bar. Groups and item order are user-configurable via the `controlBarLayout` key in `config.json`. See [Control Bar Layout](./control-bar-layout.md) for the full schema.
- **Ordering**: Not declared by the module. Items are placed in the `'default'` group until the user configures them; new groups can be suggested via `defaultGroup` + `groupHint` (see below).

#### `ControlBarContribution` type

```ts
interface ControlBarContribution {
  id: string            // MUST be globally unique across all modules.
  component: Component  // Vue component rendered as the bar item.
  defaultGroup?: string // Preferred group on first install. Omit → 'default'.
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    // 'auto'   — host decides based on neighbouring groups (default).
    // 'always' — force a visual divider before this item's group.
    // 'never'  — suppress any auto-divider (use for tightly coupled items).
    label?: string | LocaleMap  // Display name for the auto-created group.
  }
}
```

`defaultGroup` and `groupHint` are **hints only** — the user's saved layout
always takes precedence over them after first install.

### `ui.settings.panels` — ✅ available
- **Contribution key**: `settingsPanels`
- **Type**: `SettingsPanelContribution[]`
- **Purpose**: Sections inside the **Features** tab of the settings window, grouped by module. The recommended starting point for module preferences — panels appear and disappear automatically as modules are enabled or disabled.

#### `SettingsPanelContribution` type

```ts
interface SettingsPanelContribution {
  id: string                      // unique within this module
  label: string | LocaleMap       // section heading shown above the component
  component: Component            // Vue component rendered as the section body
}
```

> **Choosing between `settingsPanels` and `settingsTabs`**: use `settingsPanels` for one or two preference rows; use a dedicated tab only when the module needs rich multi-section layout. See [guides/module-settings.md](../guides/module-settings.md) for the full decision table.

### `ui.settings.tabs` — ✅ available
- **Contribution key**: `settingsTabs`
- **Type**: `SettingsTabContribution[]`
- **Purpose**: A dedicated top-level tab in the settings window. Each contribution is a full-width Vue component plus an i18n label. Prefer `settingsPanels` unless the module needs rich layout control (multiple sub-sections, preview areas, etc.).

### `ui.cursors` — ✅ available
- **Contribution key**: `cursors`
- **Type**: `CursorContribution[]`
- **Purpose**: Per-tool DOM cursors rendered while drawing mode is active. The host hides the OS cursor (`cursor: none`) and mounts the matching cursor SVG / PNG as a follow-the-mouse DOM element — the OS compositor is bypassed entirely, so cursors render reliably on macOS transparent overlays.

#### Contribution shape

```ts
interface CursorContribution {
  /** MUST match the `id` of the `ToolContribution` this cursor activates for. */
  id: string
  cursor: CursorSpec
}

type CursorSpec = string | SvgCursorSpec | PngCursorSpec

interface SvgCursorSpec {
  svg: string                  // inline `<svg>...</svg>` OR plugin-relative path
  hotspot?: { x: number; y: number }   // default `{x:0, y:0}`
  fallback?: string            // CSS keyword fallback, default `'crosshair'`
}

interface PngCursorSpec {
  png: string                  // plugin-relative path; no inline form
  hotspot?: { x: number; y: number }
  fallback?: string
}
```

**Linkage rule (load-bearing).** The `id` field on `CursorContribution` MUST equal the `id` of the `ToolContribution` (in `canvas.tools`) you want this cursor to activate for. The host resolves cursor → tool by exact id match on every tool change. An `id` that does not match any registered tool is harmless but inert (the host falls back to its default cursor for that tool).

#### DX patterns

1. **CSS keyword (legacy)** — `{ id, cursor: 'crosshair' }`. Accepted only for the 32 W3C cursor keywords; the host renders the default DOM cursor in this case (the keyword itself is never routed to CSS).
2. **Inline SVG** — `{ id, cursor: { svg: '<svg>…</svg>', hotspot: { x, y } } }`. The host runs the markup through DOMPurify inside `compileCursor()` before mounting via `v-html`.
3. **Vite `?raw` import** — `import laserSvg from './laser.svg?raw'` then `{ svg: laserSvg, hotspot: … }`. Same as inline; build-time inlines the file content.
4. **Relative path** — `{ svg: 'assets/laser.svg' }` or `{ png: 'assets/stamp.png' }`. The host resolves to `openpen-plugin://<hostname>/<path>` and fetches inside `compileCursor()` at mount time. SVG paths go through DOMPurify; PNG paths are wrapped in an `<img>` (raster is inert in DOM context).

URL forms (`http://`, `https://`, `data:`, `file://`, `openpen-plugin://`), absolute paths, and `..` traversal are rejected at registration.

#### Theming with the current stroke color

The host exposes the active stroke color as a CSS custom property on `document.documentElement`:

```
--openpen-cursor-accent
```

Cursor SVGs can reference it in fill / stroke attributes to follow the user's color pick:

```html
<circle fill="var(--openpen-cursor-accent, #818cf8)" ... />
<line stroke="var(--openpen-cursor-accent, #818cf8)" ... />
```

When the user picks a gradient, the variable resolves to the gradient's `from` endpoint (cursors only have one accent slot). The fallback (second `var()` argument) covers the brief window before the first stroke-style event fires — pick a sensible default that matches your design.

This is opt-in: cursors that hardcode a fill color stay independent of the user's pick. The built-in `freehand`, `line`, and `shape` cursors use this convention; `eraser` (dust is neutral grey) and `stroke-eraser` (red+indigo combo signals "delete whole stroke") intentionally do not.

#### Safety contract (what plugin authors should know)

- Embedded `<script>`, `onload=`, `onclick=`, `<foreignObject>`, and external `<image href>` / `<use href>` are stripped by DOMPurify before any markup reaches `v-html`. Sanitisation runs inside `compileCursor()` at the moment the cursor is mounted (when the active tool changes) — not at registration. Plugins authored against the public API never need to call DOMPurify themselves.
- At registration the host normalises every cursor contribution to a strict allowlist (only `id`, `cursor.svg | cursor.png`, `cursor.hotspot`, `cursor.fallback` pass through) and stores an **immutable frozen snapshot** on its side. Mutating `myModule.contributes.cursors[0].cursor` from `setup()` succeeds on the plugin's own copy but has no effect on what the host renders — the host reads from its own snapshot. The only way to change the rendered cursor is to ship a new module version.
- The legacy `cursor: string` form rejects any value containing `url(`, `image-set(`, `-webkit-image-set(`, `javascript:`, or `expression(`.

### `ui.status` — ✅ available
- **Contribution key**: `status`
- **Type**: `StatusContribution[]`
- **Purpose**: Ephemeral status badges on the control bar (recording indicator, sync state).

### `ui.modals` — ✅ available
- **Contribution key**: `modals`
- **Type**: `ModalContribution[]`
- **Purpose**: Registered modals managed by the global modal stack. Provides focus trap, ESC-to-close, and overlap prevention so plugins don't have to re-implement basics.

### `ui.tray.menu` — ⏳ reserved
- **Contribution key**: `trayMenu`
- **Type**: `TrayMenuContribution[]`
- **Purpose**: System tray menu items (alongside the built-in show / hide / quit).
- **Why reserved**: Tray manager does not yet consume plugin contributions.

### `ui.context.menu` — ⏳ reserved
- **Contribution key**: `contextMenu`
- **Type**: `ContextMenuContribution[]`
- **Purpose**: Right-click context menu items on canvas, toolbar, or tray.
- **Why reserved**: No UI design for context menus has been finalized; ship in a follow-up.

### `ui.theme.tokens` — ⏳ reserved
- **Contribution key**: `themeTokens`
- **Type**: `ThemeTokenContribution`
- **Purpose**: Module-provided CSS custom properties (colour swatches, spacing tokens, gradient presets).
- **Why reserved**: Expected first user is a colour-palette plugin; build the slot when that plugin appears.

---

## System (8 slots)

### `system.shortcuts` — ✅ available
- **Contribution key**: `shortcuts`
- **Type**: `ShortcutContribution[]`
- **Purpose**: Global (`scope: 'global'`) and drawing-mode (`scope: 'drawing'`) keyboard shortcuts. Wraps Electron `globalShortcut` for `'global'` and the renderer key handler for `'drawing'`.

#### `ShortcutContribution` type

```ts
interface ShortcutContribution {
  id: string                       // unique within this module
  keys: string                     // Electron accelerator string, e.g. 'CommandOrControl+Shift+D'
  scope: 'global' | 'drawing'
  handler(): void
  label?: string | LocaleMap       // human-readable name shown in Settings → Shortcuts
  userCustomizable?: boolean       // default false; set true to let users rebind the key
}
```

- Shortcuts with `userCustomizable: true` and a `label` appear under the module's group in **Settings → Shortcuts**, where users can rebind them. User-chosen keys are stored under `config.json → customShortcuts[moduleId/shortcutId]`.
- `label` is shown regardless of `userCustomizable`; omitting it hides the shortcut from the Shortcuts tab entirely.

### `system.window.behaviors` — ⏳ reserved
- **Contribution key**: `windowBehaviors`
- **Type**: `WindowBehaviorContribution[]`
- **Purpose**: Modifiers for main window behaviour (pin, auto-collapse, summon-to-cursor teleport).
- **Why reserved**: No runtime adapter implemented in the renderer or main process.

### `system.locales` — ✅ available
- **Contribution key**: `locales`
- **Type**: `LocaleContribution`
- **Purpose**: i18n dictionary contributions per BCP-47 tag. Resolution layers default → exact → language prefix → en → first declared.

### `system.main.handlers` — ✅ available
- **Contribution key**: `mainHandlers`
- **Type**: `MainHandlerContribution`
- **Purpose**: Node-side IPC handlers for main process capabilities (file IO, native APIs). Routed from the renderer via ctx.callMain(action, payload) (internally calls window.openPenApi.moduleCall(moduleId, action, payload)). Main-process handlers come from the file referenced by plugin.json's main field.

### `system.events` — ✅ available
- **Contribution key**: `events`
- **Type**: `EventSubscriptionContribution[]`
- **Purpose**: Subscribe to domain events (`stroke-added`, `tool-changed`, `theme-changed`, …). Pairs with the reactive stroke style store: store for state snapshots, events for actions.

### `system.lifecycle` — ✅ available
- **Contribution key**: `lifecycle`
- **Type**: `LifecycleContribution`
- **Purpose**: App lifecycle hooks (`onReady`, `onSuspend`, `onQuit`). Required by autosave / cloud-sync style plugins.

### `system.storage` — ⏳ reserved
- **Contribution key**: `storage`
- **Type**: `StorageContribution`
- **Purpose**: Marker that this module wants an isolated data directory at `~/.openpen/plugins/<id>/data/`. Capacity / quota policy defined by the host runtime.
- **Why reserved**: Adapter not yet active; first real consumer will drive the storage backend design (deferred until a built-in or plugin module needs blob storage).

### `system.file.drop` — ⏳ reserved
- **Contribution key**: `fileDrop`
- **Type**: `FileDropContribution[]`
- **Purpose**: Handlers for files dropped onto the canvas (image stamps, SVG imports).
- **Why reserved**: First real consumer is the image-stamp plugin; defer until then.

---

## Total

- **17 active** slots (Canvas: 6, UI: 6, System: 5)
- **8 reserved** slots (Canvas: 2, UI: 3, System: 3)
- **25 total**
