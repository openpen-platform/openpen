---
title: System slots
description: 9 contribution slots for keyboard shortcuts, window behavior, i18n, IPC handlers, events, lifecycle hooks, MCP tools, storage, and file drop.
---

# System slots

System slots cover cross-cutting infrastructure: keyboard shortcuts, window
behaviour modifiers, i18n dictionaries, main-process IPC handlers, domain event
subscriptions, app lifecycle hooks, MCP tools for AI agents, isolated storage, and file-drop handlers.

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

- Shortcuts with `userCustomizable: true` and a `label` appear under the module's group in **Settings → Shortcuts**, where users can rebind them. User-chosen keys are stored under `config.json → moduleShortcuts["<moduleId>/<shortcutId>"]`.
- `label` is shown regardless of `userCustomizable`; omitting it hides the shortcut from the Shortcuts tab entirely.
- To switch the active tool from a shortcut handler, call [`activateTool`](canvas.md#activate-tool) from `@openpen/module-api` so the control bar button follows.

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

## `system.mcp.tools` — 🧪 experimental {#system-mcp-tools}

- **Contribution key**: `mcpTools`
- **Type**: `McpToolDefinition[]` (build each one with `defineMcpTool`)
- **Purpose**: Tools that AI agents can call through OpenPen's local MCP server. An enabled plugin's tools are listed as `<plugin prefix>__<tool name>`, for example `openpen.arrow__draw`.
- **Status**: Experimental. Breaking changes are announced first in the docs and the `@openpen/module-api` CHANGELOG, with a transition period. Requires `@openpen/module-api` 1.6.0+ and OpenPen 1.7.0+ (`minAppVersion` in `plugin.json`).
- **Related field**: `mcpGuide?: string` on the module — a longer usage guide for the model, returned only when an agent asks for it through `get_guide`.

### `McpToolDefinition` type

```ts
interface McpToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string                    // without the plugin prefix; A-Za-z0-9_-.
  title?: string                  // for people; a key in this module's system.locales, else shown as written
  description: string             // for the model; English, at most 2048 characters
  inputSchema: S                  // zod 4 object; .describe() becomes the parameter description
  outputSchema?: z.ZodObject
  annotations?: {
    readOnly?: boolean            // default false
    destructive?: boolean         // default true
    idempotent?: boolean          // default false
    openWorld?: boolean           // default true
  }
  handler(args: z.infer<S>, ctx: McpToolContext): McpToolReturn | Promise<McpToolReturn>
}

interface McpToolContext {
  displayId: number               // display the call targets
  signal: AbortSignal             // aborted when the AI app cancels the call
  reportProgress(progress: number, total?: number, message?: string): void
  log(level: 'info' | 'warn' | 'error', message: string): void
}
```

- Arguments are validated against `inputSchema` before the handler runs; a mismatch returns an `invalid_params` error and the handler is not called.
- Throw `InvalidParamsError`, `NotFoundError`, `UserActionRequiredError` or `UnavailableError` (each takes a message and a required next step) to give the agent a classified error. Any other exception is returned as a generic error and written to the log.
- Annotations left out are assumed to be the worst case (changes state, destructive, not idempotent, open world). In read-only mode only tools with `readOnly: true` are exposed.
- A tool whose full name has invalid characters, exceeds 128 characters, or duplicates an exposed name is not exposed; the reason is shown on the plugin's row in **Settings → MCP**.
- Full walkthrough: [Plugin MCP tools](../guides/mcp-tools.md).

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
