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
- **Purpose**: Drawing-mode cursor styles (CSS cursor strings or data URLs). The active tool selects which cursor to apply.

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
