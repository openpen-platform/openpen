---
title: System slots
description: 8 contribution slots for keyboard shortcuts, window behavior, i18n, IPC handlers, events, lifecycle hooks, storage, and file drop.
---

# System slots

System slots cover cross-cutting infrastructure: keyboard shortcuts, window
behaviour modifiers, i18n dictionaries, main-process IPC handlers, domain event
subscriptions, app lifecycle hooks, isolated storage, and file-drop handlers.

## `system.shortcuts` — ✅ available {#system-shortcuts}

- **Contribution key**: `shortcuts`
- **Type**: `ShortcutContribution[]`
- **Purpose**: Global (`scope: 'global'`) and drawing-mode (`scope: 'drawing'`) keyboard shortcuts. Wraps Electron `globalShortcut` for `'global'` and the renderer key handler for `'drawing'`.

### `ShortcutContribution` type

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

## `system.window.behaviors` — ⏳ reserved {#system-window-behaviors}

- **Contribution key**: `windowBehaviors`
- **Type**: `WindowBehaviorContribution[]`
- **Purpose**: Modifiers for main window behaviour (pin, auto-collapse, summon-to-cursor teleport).
- **Why reserved**: No runtime adapter implemented in the renderer or main process.

## `system.locales` — ✅ available {#system-locales}

- **Contribution key**: `locales`
- **Type**: `LocaleContribution`
- **Purpose**: i18n dictionary contributions per BCP-47 tag. Resolution layers default → exact → language prefix → en → first declared.

## `system.main.handlers` — ✅ available {#system-main-handlers}

- **Contribution key**: `mainHandlers`
- **Type**: `MainHandlerContribution`
- **Purpose**: Node-side IPC handlers for main process capabilities (file IO, native APIs). Routed from the renderer via ctx.callMain(action, payload) (internally calls window.openPenApi.moduleCall(moduleId, action, payload)). Main-process handlers come from the file referenced by plugin.json's main field.

## `system.events` — ✅ available {#system-events}

- **Contribution key**: `events`
- **Type**: `EventSubscriptionContribution[]`
- **Purpose**: Subscribe to domain events (`stroke-added`, `tool-changed`, `theme-changed`, …). Pairs with the reactive stroke style store: store for state snapshots, events for actions.

## `system.lifecycle` — ✅ available {#system-lifecycle}

- **Contribution key**: `lifecycle`
- **Type**: `LifecycleContribution`
- **Purpose**: App lifecycle hooks (`onReady`, `onSuspend`, `onQuit`). Required by autosave / cloud-sync style plugins.

## `system.storage` — ⏳ reserved {#system-storage}

- **Contribution key**: `storage`
- **Type**: `StorageContribution`
- **Purpose**: Marker that this module wants an isolated data directory at `~/.openpen/plugins/<id>/data/`. Capacity / quota policy defined by the host runtime.
- **Why reserved**: Adapter not yet active; first real consumer will drive the storage backend design (deferred until a built-in or plugin module needs blob storage).

## `system.file.drop` — ⏳ reserved {#system-file-drop}

- **Contribution key**: `fileDrop`
- **Type**: `FileDropContribution[]`
- **Purpose**: Handlers for files dropped onto the canvas (image stamps, SVG imports).
- **Why reserved**: First real consumer is the image-stamp plugin; defer until then.
