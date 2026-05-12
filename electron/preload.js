/**
 * Preload script.
 *
 * Exposes a narrow whitelist of host APIs to renderer code via
 * contextBridge. The surface is intentionally minimal:
 *
 *   - window management (position, passthrough, settings window)
 *   - drawing-mode toggle on the overlay
 *   - settings store (get / preview / save / revert)
 *   - app config (developer-side, read-only)
 *   - module manifests + main-handler IPC bridge
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openPenApi', {
  // ── Window management ───────────────────────────────────────────────
  openSettingsWindow: () => ipcRenderer.send('window:open-settings'),
  closeSettingsWindow: () => ipcRenderer.send('window:close-settings'),
  setWindowPosition: (pos) => ipcRenderer.send('window:set-position', pos),
  getDisplayInfo: () => ipcRenderer.invoke('window:get-display-info'),
  getWindowPosition: () => ipcRenderer.invoke('window:get-position'),
  getCursorPosition: () => ipcRenderer.invoke('window:get-cursor-position'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('window:set-ignore-mouse-events', ignore),
  signalContentReady: () => ipcRenderer.send('window:content-ready'),

  // ── Drawing overlay ─────────────────────────────────────────────────
  setDrawingMode: (enabled) => ipcRenderer.send('overlay:set-drawing-mode', enabled),
  onDrawingModeChanged: (callback) => {
    const handler = (_, enabled) => callback(enabled);
    ipcRenderer.on('overlay:drawing-mode-changed', handler);
    return () => ipcRenderer.removeListener('overlay:drawing-mode-changed', handler);
  },

  // ── Settings ────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getLocale: () => ipcRenderer.invoke('settings:get-locale'),
  previewSettings: (patch) => ipcRenderer.send('settings:preview', patch),
  revertSettings: () => ipcRenderer.invoke('settings:revert'),
  onSettingsUpdated: (callback) => {
    const handler = (_, settings) => callback(settings);
    ipcRenderer.on('settings:updated', handler);
    return () => ipcRenderer.removeListener('settings:updated', handler);
  },
  onLocaleChange: (callback) => {
    const handler = (_, locale) => callback(locale);
    ipcRenderer.on('settings:locale-changed', handler);
    return () => ipcRenderer.removeListener('settings:locale-changed', handler);
  },

  // ── Shortcuts ───────────────────────────────────────────────────────
  setShortcutsSuspended: (suspended) => ipcRenderer.send('shortcuts:set-suspended', suspended),
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcut: (id, accelerator) => ipcRenderer.invoke('shortcuts:set', { id, accelerator }),
  resetShortcut: (id) => ipcRenderer.invoke('shortcuts:reset', { id }),
  onShortcutsUpdated: (callback) => {
    const handler = (_, shortcuts) => callback(shortcuts);
    ipcRenderer.on('shortcuts:updated', handler);
    return () => ipcRenderer.removeListener('shortcuts:updated', handler);
  },
  getModuleShortcuts: () => ipcRenderer.invoke('shortcuts:get-module'),
  onModuleShortcutsUpdated: (callback) => {
    const handler = (_, overrides) => callback(overrides);
    ipcRenderer.on('shortcuts:module-updated', handler);
    return () => ipcRenderer.removeListener('shortcuts:module-updated', handler);
  },
  getShortcutConflicts: () => ipcRenderer.invoke('shortcuts:get-conflicts'),
  onShortcutConflictsUpdated: (callback) => {
    const handler = (_, conflicts) => callback(conflicts);
    ipcRenderer.on('shortcuts:conflict-updated', handler);
    return () => ipcRenderer.removeListener('shortcuts:conflict-updated', handler);
  },

  // ── App config (developer-side, read-only) ──────────────────────────
  getAppConfig: () => ipcRenderer.invoke('app-config:get'),
  /** Read the host app version (package.json `version`). */
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  /** Restart the host process (used after plugin install / module toggle). */
  relaunchApp: () => ipcRenderer.send('app:relaunch'),

  // ── Control bar cross-window broadcast ─────────────────────────────────
  setActiveTool: (config) => ipcRenderer.send('control-bar:tool-changed', config),
  onToolConfigChanged: (callback) => {
    const handler = (_, config) => callback(config);
    ipcRenderer.on('control-bar:tool-config-changed', handler);
    return () => ipcRenderer.removeListener('control-bar:tool-config-changed', handler);
  },
  setStrokeStyle: (style) => ipcRenderer.send('control-bar:stroke-style', style),
  onStrokeStyleChanged: (callback) => {
    const handler = (_, style) => callback(style);
    ipcRenderer.on('control-bar:stroke-style-changed', handler);
    return () => ipcRenderer.removeListener('control-bar:stroke-style-changed', handler);
  },
  clearCanvas: () => ipcRenderer.send('control-bar:clear-canvas'),
  onClearCanvasRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('control-bar:clear-canvas-triggered', handler);
    return () => ipcRenderer.removeListener('control-bar:clear-canvas-triggered', handler);
  },

  // ── History cross-window broadcast ─────────────────────────────────────
  triggerUndo: () => ipcRenderer.send('history:trigger-undo'),
  triggerRedo: () => ipcRenderer.send('history:trigger-redo'),
  onUndo: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('history:undo', handler);
    return () => ipcRenderer.removeListener('history:undo', handler);
  },
  onRedo: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('history:redo', handler);
    return () => ipcRenderer.removeListener('history:redo', handler);
  },
  reportHistoryState: (state) => ipcRenderer.send('history:state-changed', state),
  onHistoryStateChanged: (callback) => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on('history:state-changed', handler);
    return () => ipcRenderer.removeListener('history:state-changed', handler);
  },

  // ── Control bar layout ──────────────────────────────────────────────
  getLayout: () => ipcRenderer.invoke('layout:get'),
  setLayout: (layout) => ipcRenderer.invoke('layout:set', layout),
  repairLayout: (knownIds) => ipcRenderer.invoke('layout:repair', knownIds),
  onLayoutUpdated: (callback) => {
    const handler = (_, layout) => callback(layout);
    ipcRenderer.on('layout:updated', handler);
    return () => ipcRenderer.removeListener('layout:updated', handler);
  },

  // ── Module settings ─────────────────────────────────────────────────
  /** Read a module's persisted settings blob from config.json. */
  getModuleSettings: (moduleId) => ipcRenderer.invoke('module:settings-get', moduleId),
  /** Persist a module's settings blob to config.json. */
  setModuleSettings: (moduleId, settings, schemaVersion) =>
    ipcRenderer.invoke('module:settings-set', { moduleId, settings, schemaVersion }),
  /**
   * Subscribe to settings-changed broadcasts scoped to any module.
   * @param {(payload: { moduleId: string; settings: Record<string, unknown> }) => void} cb
   * @returns {() => void} unsubscribe
   */
  onModuleSettingsChanged: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('module:settings-changed', handler);
    return () => ipcRenderer.removeListener('module:settings-changed', handler);
  },

  // ── Modules ─────────────────────────────────────────────────────────
  /** Pull the boot-time snapshot of disabled module ids. */
  getInitialDisabledModules: () => ipcRenderer.invoke('module:get-initial-disabled'),
  /** Pull all plugin install-metadata entries (installedAt timestamps). */
  getPluginMeta: () => ipcRenderer.invoke('plugin-meta:get-all'),
  /**
   * Subscribe to plugin-module manifests broadcast from the main process.
   * @param {(manifests: Array<{ id: string, name: string, version: string, rendererEntry: string | null }>) => void} callback
   * @returns {() => void} unsubscribe
   */
  onModuleManifests: (callback) => {
    const handler = (_, manifests) => callback(manifests);
    ipcRenderer.on('module:manifests', handler);
    return () => ipcRenderer.removeListener('module:manifests', handler);
  },
  /** Pull the current plugin-module manifests on demand. */
  getModuleManifests: () => ipcRenderer.invoke('module:get-manifests'),
  /**
   * Persist plugin id collision resolutions chosen by the user, then relaunch.
   * @param {Record<string, string>} resolutions - conflicting id → chosen manifest.dir
   * @returns {Promise<void>}
   */
  setPluginConflictResolutions: (resolutions) =>
    ipcRenderer.invoke('module:set-plugin-conflict-resolutions', resolutions),
  /**
   * Subscribe to host lifecycle events (currently `'quit'`). Modules
   * use this in bootstrap to fire their `lifecycle.onQuit` hooks.
   * @param {(event: 'quit' | 'suspend' | 'ready') => void} callback
   * @returns {() => void} unsubscribe
   */
  onLifecycleEvent: (callback) => {
    const handler = (_, event) => callback(event);
    ipcRenderer.on('module:lifecycle-event', handler);
    return () => ipcRenderer.removeListener('module:lifecycle-event', handler);
  },
  /**
   * Invoke a module's main-side handler.
   * @param {string} moduleId
   * @param {string} action
   * @param {unknown} payload
   * @returns {Promise<unknown>}
   */
  moduleCall: (moduleId, action, payload) =>
    ipcRenderer.invoke('module:call-handler', { moduleId, action, payload }),

  /**
   * Register a global accelerator for this module. The id is namespaced
   * by the module-loader so collisions across modules are impossible.
   * @param {string} id  - namespaced shortcut id
   * @param {string} keys - Electron accelerator string
   */
  registerShortcut: (id, keys) =>
    ipcRenderer.send('module:register-shortcut', { id, keys }),

  /** Remove a previously-registered shortcut. */
  unregisterShortcut: (id) =>
    ipcRenderer.send('module:unregister-shortcut', { id }),

  /**
   * Subscribe to shortcut-triggered broadcasts. The callback receives
   * the namespaced id; the module-loader maps it back to the local handler.
   * @param {(payload: { id: string }) => void} callback
   * @returns {() => void} unsubscribe
   */
  onShortcutTriggered: (callback) => {
    const handler = (_, payload) => callback(payload);
    ipcRenderer.on('module:shortcut-triggered', handler);
    return () => ipcRenderer.removeListener('module:shortcut-triggered', handler);
  },

  // ── Diagnostics (corruption-recovery sidecar) ──────────────────────
  getDiagnosticsState: () => ipcRenderer.invoke('diagnostics:get-state'),
  acknowledgeDiagnostics: (id) => ipcRenderer.invoke('diagnostics:acknowledge', id),
  openBackupDir: (backupPath) => ipcRenderer.invoke('diagnostics:open-backup-dir', backupPath),
  onDiagnosticsStateChanged: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('diagnostics:state-changed', handler);
    return () => ipcRenderer.removeListener('diagnostics:state-changed', handler);
  },

  // ── Plugin marketplace ───────────────────────────────────────────────
  /** Fetch the catalog plugins.json from the main process. */
  fetchPluginCatalog: () => ipcRenderer.invoke('plugin:fetch-catalog'),
  /** Install a plugin by id from the catalog. */
  installPlugin: (id) => ipcRenderer.invoke('plugin:install', { id }),
  /** Remove an installed plugin by id. */
  removePlugin: (id) => ipcRenderer.invoke('plugin:remove', { id }),
  /** Install a plugin from a local folder path. */
  addPluginFromLocal: (sourcePath) => ipcRenderer.invoke('plugin:add-from-local', { sourcePath }),
  /** Install a plugin from a GitHub repo URL. */
  addPluginFromGitHubRepo: (repoUrl) => ipcRenderer.invoke('plugin:add-from-github-repo', { repoUrl }),
  /**
   * Subscribe to install-progress events from the main process.
   * @param {(payload: { stage: string, percent?: number }) => void} callback
   * @returns {() => void} unsubscribe
   */
  onPluginInstallProgress: (callback) => {
    const handler = (_, payload) => callback(payload);
    ipcRenderer.on('plugin:install-progress', handler);
    return () => ipcRenderer.removeListener('plugin:install-progress', handler);
  },
  /** Open the OS folder picker. Returns the selected path, or null if cancelled. */
  pickPluginFolder: () => ipcRenderer.invoke('plugin:pick-folder'),
  /** Read plugin.json metadata from a local path without copying files. */
  inspectPluginSource: (sourcePath) => ipcRenderer.invoke('plugin:inspect-local', { sourcePath }),

  // ── Positioning engine ───────────────────────────────────────────────────────
  /**
   * Send a positioning intent to the main-process PositioningEngine.
   * @param {{ type: string; [key: string]: unknown }} intent
   * @returns {Promise<unknown>}
   */
  sendPositioningIntent: (intent) => ipcRenderer.invoke('positioning:intent', intent),

  /**
   * Pull the current positioning state snapshot from the engine.
   * Renderers call this on mount to avoid relying on the push-broadcast
   * that may fire before the subscription is wired.
   * @returns {Promise<object>}
   */
  getPositioningState: () => ipcRenderer.invoke('positioning:get-state'),

  /**
   * Subscribe to positioning state changes broadcast from the engine.
   * @param {(state: object) => void} callback
   * @returns {() => void} unsubscribe
   */
  onPositioningStateChanged: (callback) => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on('positioning:state-changed', handler);
    return () => ipcRenderer.removeListener('positioning:state-changed', handler);
  },

  // ── System diagnostics (platform rendering checks) ──────────────────
  /**
   * Subscribe to the transparent-rendering-broken notification.
   * Fires at most once per session on affected Windows GPU configurations.
   * @param {() => void} callback
   * @returns {() => void} unsubscribe
   */
  onTransparentRenderingBroken: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('system:transparent-rendering-broken', handler);
    return () => ipcRenderer.removeListener('system:transparent-rendering-broken', handler);
  },

  // ── Crash / error reporting ─────────────────────────────────────────
  /**
   * Forward a renderer-side error to the main-process file logger.
   * @param {{ level?: 'error'|'warn', message: string, stack?: string, source?: string, line?: number, column?: number }} payload
   */
  recordError: (payload) => ipcRenderer.send('log:record-error', payload),

  // ── Audit log (read-only) ────────────────────────────────────────────
  /**
   * Fetch structured audit-log entries from the main-process ring buffer.
   * Returns newest-first. All filters are optional.
   * @param {{ limit?: number; since?: number; pluginId?: string | null }} [opts]
   * @returns {Promise<import('../electron/audit-log.js').AuditLogEntry[]>}
   */
  getAuditLogEntries: (opts) => ipcRenderer.invoke('audit:get-entries', opts),

  /**
   * Clears all entries from the in-memory audit log ring buffer.
   * @returns {Promise<void>}
   */
  clearAuditLog: () => ipcRenderer.invoke('audit:clear'),
});
