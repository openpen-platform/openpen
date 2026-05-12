/**
 * IPC channel constants — single source of truth.
 * Naming convention: {domain}:{action}.
 *
 * Channels are organised by main-process subsystem. Module-side
 * features (toolbar buttons, history, drawing-mode toggle) live
 * inside individual modules and use the renderer-side
 * contribution-store, not IPC.
 */

/** Window management. */
export const WINDOW = {
  OPEN_SETTINGS: 'window:open-settings',
  CLOSE_SETTINGS: 'window:close-settings',
  CONTENT_READY: 'window:content-ready',
  SET_POSITION: 'window:set-position',
  GET_DISPLAY_INFO: 'window:get-display-info',
  /** renderer → main: query current window position (mouseup precise coords). */
  GET_POSITION: 'window:get-position',
  /** renderer → main: toggle main-window mouse passthrough. */
  SET_IGNORE_MOUSE_EVENTS: 'window:set-ignore-mouse-events',
  /** renderer → main (invoke): get current screen cursor position. */
  GET_CURSOR_POSITION: 'window:get-cursor-position',
}

/** Drawing overlay. */
export const OVERLAY = {
  SET_DRAWING_MODE: 'overlay:set-drawing-mode',
  DRAWING_MODE_CHANGED: 'overlay:drawing-mode-changed',
}

/** Control bar — cross-window broadcast for tool / style / clear actions. */
export const CONTROL_BAR = {
  TOOL_CHANGED: 'control-bar:tool-changed',
  TOOL_CONFIG_CHANGED: 'control-bar:tool-config-changed',
  STROKE_STYLE: 'control-bar:stroke-style',
  STROKE_STYLE_CHANGED: 'control-bar:stroke-style-changed',
  CLEAR_CANVAS: 'control-bar:clear-canvas',
  CLEAR_CANVAS_TRIGGERED: 'control-bar:clear-canvas-triggered',
}

/** Undo / Redo history. */
export const HISTORY = {
  UNDO: 'history:undo',
  REDO: 'history:redo',
  TRIGGER_UNDO: 'history:trigger-undo',
  TRIGGER_REDO: 'history:trigger-redo',
  STATE_CHANGED: 'history:state-changed',
}

/** User preferences. */
export const SETTINGS = {
  GET: 'settings:get',
  GET_LOCALE: 'settings:get-locale',
  SET: 'settings:set',
  /** Live preview (in-memory only, for settings panel). */
  PREVIEW: 'settings:preview',
  /** Revert (re-read config.json, used when cancelling settings panel). */
  REVERT: 'settings:revert',
  UPDATED: 'settings:updated',
  LOCALE_CHANGED: 'settings:locale-changed',
}

/** System tray. */
export const TRAY = {
  SHOW_MAIN: 'tray:show-main',
  HIDE_MAIN: 'tray:hide-main',
  OPEN_SETTINGS: 'tray:open-settings',
}

/** Developer-side global app config. */
export const APP_CONFIG = {
  GET: 'app-config:get',
}

/** Host (app) metadata. */
export const APP = {
  /** renderer → main: read package.json version (= app.getVersion()). */
  GET_VERSION: 'app:get-version',
  /** renderer → main (one-way): relaunch the app (used after plugin install / module toggle). */
  RELAUNCH: 'app:relaunch',
}

/** Control bar layout. */
export const LAYOUT = {
  /** renderer → main (invoke): get current control bar layout. */
  GET: 'layout:get',
  /** renderer → main (invoke): persist a new layout. */
  SET: 'layout:set',
  /** renderer → main (invoke): run L3b repairs with known item ids. */
  REPAIR: 'layout:repair',
  /** main → renderer (broadcast): layout changed. */
  UPDATED: 'layout:updated',
}

/** User-configurable keyboard shortcuts. */
export const SHORTCUTS = {
  /** renderer → main (invoke): get current shortcut map. */
  GET: 'shortcuts:get',
  /** renderer → main (invoke): update one shortcut { id, accelerator }. */
  SET: 'shortcuts:set',
  /** renderer → main (invoke): reset one shortcut to default { id }. */
  RESET: 'shortcuts:reset',
  /** main → renderer (broadcast): shortcut map changed. */
  UPDATED: 'shortcuts:updated',
  /** renderer → main (invoke): get module shortcut overrides { namespacedId → accelerator }. */
  GET_MODULE: 'shortcuts:get-module',
  /** main → renderer (broadcast): module shortcut overrides changed. */
  MODULE_UPDATED: 'shortcuts:module-updated',
  /** renderer → main (one-way): pause or resume all shortcut handlers during key capture. */
  SET_SUSPENDED: 'shortcuts:set-suspended',
  /** renderer → main (invoke): get list of namespacedIds that failed to register due to conflicts. */
  GET_CONFLICTS: 'shortcuts:get-conflicts',
  /** main → renderer (broadcast): conflict list changed. */
  CONFLICT_UPDATED: 'shortcuts:conflict-updated',
}

/** Plugin network audit log (read-only). */
export const AUDIT = {
  /** renderer → main (invoke): fetch ring-buffer entries with optional filters. */
  GET_ENTRIES: 'audit:get-entries',
  /** renderer → main (invoke): clear the in-memory ring buffer. */
  CLEAR: 'audit:clear',
}

/** Crash / error reporting from renderer to main-process logger. */
export const LOG = {
  /** renderer → main (one-way): forward a renderer-side error to the file log. */
  RECORD_ERROR: 'log:record-error',
}

/** Corruption diagnostics (sidecar diagnostics.json). */
export const DIAGNOSTICS = {
  /** renderer → main (invoke): get current diagnostics state snapshot. */
  GET_STATE: 'diagnostics:get-state',
  /** renderer → main (invoke): mark an event as acknowledged by id. */
  ACKNOWLEDGE: 'diagnostics:acknowledge',
  /** renderer → main (invoke): reveal a backup file in the system file manager. */
  OPEN_BACKUP_DIR: 'diagnostics:open-backup-dir',
  /** main → renderer (broadcast): diagnostics state changed. */
  STATE_CHANGED: 'diagnostics:state-changed',
}

/** Positioning engine — ball/bar position state machine. */
export const POSITIONING = {
  /** renderer → main (invoke): send a positioning intent (drag-start, drag-move, etc.) */
  INTENT: 'positioning:intent',
  /** main → renderer (active display only): full state snapshot after intent processed. */
  STATE_CHANGED: 'positioning:state-changed',
  /** renderer → main (invoke): pull the current positioning state snapshot. */
  GET_STATE: 'positioning:get-state',
}

/** Windows transparent-rendering probe result notification. */
export const SYSTEM = {
  /** main → renderer (send): notify of transparent-rendering failure on Windows. */
  TRANSPARENT_RENDERING_BROKEN: 'system:transparent-rendering-broken',
}

/** Plugin install metadata sidecar (installedAt timestamps). */
export const PLUGIN_META = {
  /** renderer → main (invoke): pull all plugin meta entries. */
  GET_ALL: 'plugin-meta:get-all',
}

/** Plugin marketplace (GUI install / remove / catalog). */
export const PLUGIN = {
  /** renderer → main (invoke): fetch plugins.json from the catalog. */
  FETCH_CATALOG: 'plugin:fetch-catalog',
  /** renderer → main (invoke): install @scope/name from catalog. */
  INSTALL: 'plugin:install',
  /** main → renderer (send): install progress stage + percentage. */
  INSTALL_PROGRESS: 'plugin:install-progress',
  /** renderer → main (invoke): remove an installed plugin by id. */
  REMOVE: 'plugin:remove',
  /** renderer → main (invoke): install from a local folder path. */
  ADD_FROM_LOCAL: 'plugin:add-from-local',
  /** renderer → main (invoke): install from a GitHub repo URL. */
  ADD_FROM_GITHUB_REPO: 'plugin:add-from-github-repo',
  /** renderer → main (invoke): open system folder picker, returns path or null. */
  PICK_FOLDER: 'plugin:pick-folder',
  /** renderer → main (invoke): read plugin.json from a local path, no file copy. */
  INSPECT_LOCAL: 'plugin:inspect-local',
}

/** Module / plugin system. */
export const MODULE = {
  /** main → renderer: list of plugin module manifests discovered on disk. */
  MANIFESTS: 'module:manifests',
  /** renderer → main (invoke): pull current manifests synchronously. */
  GET_MANIFESTS: 'module:get-manifests',
  /** renderer → main: invoke a plugin module's main-side handler. */
  CALL_HANDLER: 'module:call-handler',
  /** renderer → main: register a global shortcut for a module. */
  REGISTER_SHORTCUT: 'module:register-shortcut',
  /** renderer → main: remove a previously-registered shortcut. */
  UNREGISTER_SHORTCUT: 'module:unregister-shortcut',
  /** main → renderer (broadcast): a registered accelerator was pressed. */
  SHORTCUT_TRIGGERED: 'module:shortcut-triggered',
  /** main → renderer (broadcast): app lifecycle event (suspend / quit). */
  LIFECYCLE_EVENT: 'module:lifecycle-event',
  /** renderer → main (invoke): read a module's persisted settings blob. */
  SETTINGS_GET: 'module:settings-get',
  /** renderer → main (invoke): persist a module's settings blob. */
  SETTINGS_SET: 'module:settings-set',
  /** main → renderer (broadcast): a module's settings were updated. */
  SETTINGS_CHANGED: 'module:settings-changed',
  /** renderer → main (invoke): get the boot-time snapshot of disabled module ids. */
  GET_INITIAL_DISABLED: 'module:get-initial-disabled',
  /**
   * renderer → main (invoke): persist plugin id collision resolutions chosen by the user.
   * Payload: Record<string, string> mapping conflicting plugin id → chosen manifest.dir.
   * The main process persists to settings then calls app.relaunch() + app.exit(0).
   */
  SET_PLUGIN_CONFLICT_RESOLUTIONS: 'module:set-plugin-conflict-resolutions',
}
