---
title: UI slots
description: 9 contribution slots for control bar items, settings panels, cursors, status badges, modals, and system tray/context menus.
---

# UI slots

UI slots cover everything rendered in the host's chrome: control bar items,
settings panels and tabs, per-tool cursors, status badges, managed modals, system
tray menu entries, context menus, and theme token overrides.

## `ui.control-bar` — ✅ available {#ui-control-bar}

- **Contribution key**: `controlBar`
- **Type**: `ControlBarContribution[]`
- **Purpose**: Buttons / sliders / popup triggers in the control bar. Groups and item order are user-configurable via the `controlBarLayout` key in `config.json`. See [Control Bar Layout](../reference/control-bar-layout.md) for the full schema.
- **Ordering**: Not declared by the module. Items are placed in the `'default'` group until the user configures them; new groups can be suggested via `defaultGroup` + `groupHint` (see below).

### `ControlBarContribution` type

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

## `ui.settings.panels` — ✅ available {#ui-settings-panels}

- **Contribution key**: `settingsPanels`
- **Type**: `SettingsPanelContribution[]`
- **Purpose**: Sections inside the **Features** tab of the settings window, grouped by module. The recommended starting point for module preferences — panels appear and disappear automatically as modules are enabled or disabled.

### `SettingsPanelContribution` type

```ts
interface SettingsPanelContribution {
  id: string                      // unique within this module
  label: string | LocaleMap       // section heading shown above the component
  component: Component            // Vue component rendered as the section body
}
```

> **Choosing between `settingsPanels` and `settingsTabs`**: use `settingsPanels` for one or two preference rows; use a dedicated tab only when the module needs rich multi-section layout. See [guides/module-settings.md](../guides/module-settings.md) for the full decision table.

## `ui.settings.tabs` — ✅ available {#ui-settings-tabs}

- **Contribution key**: `settingsTabs`
- **Type**: `SettingsTabContribution[]`
- **Purpose**: A dedicated top-level tab in the settings window. Each contribution is a full-width Vue component plus an i18n label. Prefer `settingsPanels` unless the module needs rich layout control (multiple sub-sections, preview areas, etc.).

## `ui.cursors` — ✅ available {#ui-cursors}

- **Contribution key**: `cursors`
- **Type**: `CursorContribution[]`
- **Purpose**: Per-tool DOM cursors rendered while drawing mode is active. The host hides the OS cursor (`cursor: none`) and mounts the matching cursor SVG / PNG as a follow-the-mouse DOM element — the OS compositor is bypassed entirely, so cursors render reliably on macOS transparent overlays.

### Contribution shape

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

### DX patterns

1. **CSS keyword (legacy)** — `{ id, cursor: 'crosshair' }`. Accepted only for the 32 W3C cursor keywords; the host renders the default DOM cursor in this case (the keyword itself is never routed to CSS).
2. **Inline SVG** — `{ id, cursor: { svg: '<svg>…</svg>', hotspot: { x, y } } }`. The host runs the markup through DOMPurify inside `compileCursor()` before mounting via `v-html`.
3. **Vite `?raw` import** — `import laserSvg from './laser.svg?raw'` then `{ svg: laserSvg, hotspot: … }`. Same as inline; build-time inlines the file content.
4. **Relative path** — `{ svg: 'assets/laser.svg' }` or `{ png: 'assets/stamp.png' }`. The host resolves to `openpen-plugin://<hostname>/<path>` and fetches inside `compileCursor()` at mount time. SVG paths go through DOMPurify; PNG paths are wrapped in an `<img>` (raster is inert in DOM context).

URL forms (`http://`, `https://`, `data:`, `file://`, `openpen-plugin://`), absolute paths, and `..` traversal are rejected at registration.

### Theming with the current stroke color

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

### Safety contract (what plugin authors should know)

- Embedded `<script>`, `onload=`, `onclick=`, `<foreignObject>`, and external `<image href>` / `<use href>` are stripped by DOMPurify before any markup reaches `v-html`. Sanitisation runs inside `compileCursor()` at the moment the cursor is mounted (when the active tool changes) — not at registration. Plugins authored against the public API never need to call DOMPurify themselves.
- At registration the host normalises every cursor contribution to a strict allowlist (only `id`, `cursor.svg | cursor.png`, `cursor.hotspot`, `cursor.fallback` pass through) and stores an **immutable frozen snapshot** on its side. Mutating `myModule.contributes.cursors[0].cursor` from `setup()` succeeds on the plugin's own copy but has no effect on what the host renders — the host reads from its own snapshot. The only way to change the rendered cursor is to ship a new module version.
- The legacy `cursor: string` form rejects any value containing `url(`, `image-set(`, `-webkit-image-set(`, `javascript:`, or `expression(`.

## `ui.status` — ✅ available {#ui-status}

- **Contribution key**: `status`
- **Type**: `StatusContribution[]`
- **Purpose**: Ephemeral status badges on the control bar (recording indicator, sync state).

## `ui.modals` — ✅ available {#ui-modals}

- **Contribution key**: `modals`
- **Type**: `ModalContribution[]`
- **Purpose**: Registered modals managed by the global modal stack. Provides focus trap, ESC-to-close, and overlap prevention so plugins don't have to re-implement basics.

## `ui.tray.menu` — ⏳ reserved {#ui-tray-menu}

- **Contribution key**: `trayMenu`
- **Type**: `TrayMenuContribution[]`
- **Purpose**: System tray menu items (alongside the built-in show / hide / quit).
- **Why reserved**: Tray manager does not yet consume plugin contributions.

## `ui.context.menu` — ⏳ reserved {#ui-context-menu}

- **Contribution key**: `contextMenu`
- **Type**: `ContextMenuContribution[]`
- **Purpose**: Right-click context menu items on canvas, toolbar, or tray.
- **Why reserved**: No UI design for context menus has been finalized; ship in a follow-up.

## `ui.theme.tokens` — ⏳ reserved {#ui-theme-tokens}

- **Contribution key**: `themeTokens`
- **Type**: `ThemeTokenContribution`
- **Purpose**: Module-provided CSS custom properties (colour swatches, spacing tokens, gradient presets).
- **Why reserved**: Expected first user is a colour-palette plugin; build the slot when that plugin appears.
