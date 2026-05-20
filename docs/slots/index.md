---
title: Slot catalog
description: All 25 contribution slots OpenPen exposes — 17 stable today, 8 reserved for v1.1+.
---

# Slot catalog

OpenPen exposes 25 contribution slots organized by domain. Stable slots take effect at runtime today; reserved slots pass validation but have no active adapter yet (forward-compatible — modules can ship against them now).

## Status

- ✅ **available** — wired to runtime adapter
- ⏳ **reserved** — no adapter yet, ships in v1.1+

## Contribution key vs. slot id

Modules use ergonomic camelCase keys on `contributes` (`historyCommands`, `themeTokens`); the validator maps them to dotted slot ids (`canvas.history.commands`, `ui.theme.tokens`). The mapping lives in `CONTRIBUTION_KEY_TO_SLOT_ID`.

## All slots

| Slot id | Domain | Status | Brief |
|---|---|---|---|
| [`canvas.tools`](./canvas#canvas-tools) | Canvas | ✅ | Drawing tools driven by pointer events |
| [`canvas.shapes`](./canvas#canvas-shapes) | Canvas | ✅ | Shape primitives (circle, rect, polygon, custom) |
| [`canvas.stroke.style`](./canvas#canvas-stroke-style) | Canvas | ✅ | Declare ownership of stroke style keys for conflict detection |
| [`canvas.history.commands`](./canvas#canvas-history-commands) | Canvas | ⏳ | Custom undo/redo command types beyond built-ins |
| [`canvas.layers.background`](./canvas#canvas-layers-background) | Canvas | ✅ | Render below strokes (grids, watermarks, background images) |
| [`canvas.layers.overlay`](./canvas#canvas-layers-overlay) | Canvas | ✅ | Render above strokes (rulers, snap guides, selection boxes) |
| [`canvas.html.overlay`](./canvas#canvas-html-overlay) | Canvas | ✅ | Mount HTML / Vue components above the canvas |
| [`canvas.stroke.transformers`](./canvas#canvas-stroke-transformers) | Canvas | ⏳ | Post-process strokes after creation (smoothing, glow effects) |
| [`ui.control-bar`](./ui#ui-control-bar) | UI | ✅ | Buttons / sliders / popup triggers in the control bar |
| [`ui.settings.panels`](./ui#ui-settings-panels) | UI | ✅ | Sections inside the Features tab of the settings window |
| [`ui.settings.tabs`](./ui#ui-settings-tabs) | UI | ✅ | Dedicated top-level tabs in the settings window |
| [`ui.cursors`](./ui#ui-cursors) | UI | ✅ | Per-tool DOM cursors rendered while drawing mode is active |
| [`ui.status`](./ui#ui-status) | UI | ✅ | Ephemeral status badges on the control bar |
| [`ui.modals`](./ui#ui-modals) | UI | ✅ | Registered modals managed by the global modal stack |
| [`ui.tray.menu`](./ui#ui-tray-menu) | UI | ⏳ | System tray menu items alongside built-in show / hide / quit |
| [`ui.context.menu`](./ui#ui-context-menu) | UI | ⏳ | Right-click context menu items on canvas, toolbar, or tray |
| [`ui.theme.tokens`](./ui#ui-theme-tokens) | UI | ⏳ | Module-provided CSS custom properties (colour swatches, tokens) |
| [`system.shortcuts`](./system#system-shortcuts) | System | ✅ | Global and drawing-mode keyboard shortcuts |
| [`system.window.behaviors`](./system#system-window-behaviors) | System | ⏳ | Modifiers for main window behaviour (pin, auto-collapse) |
| [`system.locales`](./system#system-locales) | System | ✅ | i18n dictionary contributions per BCP-47 tag |
| [`system.main.handlers`](./system#system-main-handlers) | System | ✅ | Node-side IPC handlers for main process capabilities |
| [`system.events`](./system#system-events) | System | ✅ | Subscribe to domain events (stroke-added, tool-changed, …) |
| [`system.lifecycle`](./system#system-lifecycle) | System | ✅ | App lifecycle hooks (onReady, onSuspend, onQuit) |
| [`system.storage`](./system#system-storage) | System | ⏳ | Isolated data directory at `~/.openpen/plugins/<id>/data/` |
| [`system.file.drop`](./system#system-file-drop) | System | ⏳ | Handlers for files dropped onto the canvas |

**Total**: 17 available · 8 reserved · 25 total
(Canvas: 6 available / 2 reserved · UI: 6 available / 3 reserved · System: 5 available / 3 reserved)
