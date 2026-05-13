/** Single corruption-recovery event recorded in the diagnostics sidecar. */
interface DiagnosticsEvent {
  id: string
  layer: 'L1' | 'L2' | 'L3b'
  /** Absolute path to the backup file written before the reset. */
  backupPath: string
  /** ISO8601 timestamp of when the corruption was detected. */
  detectedAt: string
  /** ISO8601 timestamp of user acknowledgement, or null if still pending. */
  acknowledgedAt: string | null
}

/** Snapshot of the diagnostics sidecar state. */
interface DiagnosticsState {
  events: readonly DiagnosticsEvent[]
}

/** Structured entry in the plugin network audit log ring buffer. */
interface AuditLogEntry {
  /** Electron webRequest details.id — used internally to back-fill statusCode in onCompleted. */
  requestId: number | null
  /** Unix epoch milliseconds (Date.now()). */
  timestamp: number
  /** HTTP method, e.g. 'GET'. */
  method: string
  /** Full request URL. */
  url: string
  /** HTTP response status code, or null if the response has not yet arrived. */
  statusCode: number | null
  /** Electron webContents id, or null if unavailable. */
  webContentsId: number | null
  /** Frame URL / referrer (query string stripped to avoid PII leakage), best-effort. */
  initiator: string | null
  /**
   * Plugin id attributed from an openpen-plugin:// referrer, or null when
   * the request cannot be attributed to a specific plugin.
   */
  pluginId: string | null
}

interface WindowPosition {
  x: number
  y: number
}

interface DisplayArea {
  x: number
  y: number
  width: number
  height: number
}

interface DisplayInfo {
  /** Electron Display id — unique per physical display. */
  id: number
  bounds: DisplayArea
  workArea: DisplayArea
}

/** A single catalog entry from plugins.json (§4.8 of plugin-publish-flow.md). */
interface CatalogEntry {
  id: string
  scope: string
  name: string
  ownerId: number
  ownerLogin: string
  ownerType: string
  description: string
  minAppVersion: string
  repo: string
  latestVersion: string
  releaseUrl: string
  sha256: string
  state: 'active' | 'yanked' | 'tombstoned'
  registeredAt: string
  forkOf?: string
  incompatible?: boolean
  category?: 'draw' | 'tool' | 'integration'
}

/** A locally installed plugin entry returned from plugin-manager operations. */
interface PluginEntry {
  id: string
  scope: string
  name: string
  version: string
  installedAt: string
}

/** Sanitised plugin-module manifest broadcast from main → renderer. */
interface ModuleManifest {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  minAppVersion?: string
  /** `openpen-plugin://<id>/<file>` URL or null when no renderer entry. */
  rendererEntry: string | null
  /** ISO8601 UTC timestamp of the first time this plugin was observed on disk, or null. */
  installedAt?: string | null
}

// AppSettings / UserShortcuts imported as module-scoped types.
type AppSettings = import('../types/settings').AppSettings
type UserShortcuts = import('../types/settings').UserShortcuts

interface ToolConfig {
  tool: string
  shapeType?: string
  filled?: boolean
  eraserMode?: 'brush' | 'stroke'
}

type StrokeColor = string | { type: 'linear'; from: string; to: string }

interface StrokeStylePayload {
  color: StrokeColor
  lineWidth: number
}

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

interface OpenPenApi {
  // Window management
  getWindowPosition(): Promise<WindowPosition>
  setWindowPosition(pos: WindowPosition): void
  getCursorPosition(): Promise<WindowPosition>
  getDisplayInfo(): Promise<DisplayInfo[]>
  setIgnoreMouseEvents(ignore: boolean): void
  openSettingsWindow(): void
  closeSettingsWindow(): void
  signalContentReady(): void

  // Positioning engine
  sendPositioningIntent(intent: { type: string; [key: string]: unknown }): Promise<unknown>
  getPositioningState(): Promise<Record<string, unknown>>
  onPositioningStateChanged(cb: (state: Record<string, unknown>) => void): () => void
  // Drawing overlay
  setDrawingMode(enabled: boolean): void
  onDrawingModeChanged(cb: (enabled: boolean) => void): () => void

  // Settings
  getSettings(): Promise<AppSettings & { effectiveTheme: 'light' | 'dark' }>
  onSettingsUpdated(cb: (s: AppSettings & { effectiveTheme: 'light' | 'dark' }) => void): () => void
  previewSettings(settings: Partial<AppSettings>): void
  updateSettings(settings: Partial<AppSettings>): Promise<void>
  revertSettings(): Promise<void>
  getLocale(): Promise<string>
  onLocaleChange(cb: (locale: string) => void): () => void

  // Shortcuts
  setShortcutsSuspended(suspended: boolean): void
  getShortcuts(): Promise<UserShortcuts>
  setShortcut(id: string, accelerator: string): Promise<{ ok: boolean; error?: string }>
  resetShortcut(id: string): Promise<{ ok: boolean; error?: string }>
  onShortcutsUpdated(cb: (shortcuts: UserShortcuts) => void): () => void
  getModuleShortcuts(): Promise<Record<string, string>>
  onModuleShortcutsUpdated(cb: (overrides: Record<string, string>) => void): () => void
  getShortcutConflicts(): Promise<string[]>
  onShortcutConflictsUpdated(cb: (conflicts: string[]) => void): () => void

  // App config (developer-side, read-only)
  getAppConfig(): Promise<Record<string, unknown>>
  getAppVersion(): Promise<string>
  /** Relaunch the host process. Fire-and-forget; the call returns before exit. */
  relaunchApp(): void
  /** Quit the app. Fire-and-forget; caller must show confirm UI first. */
  quitApp(): void
  /** Subscribe to main-process quit requests (Cmd+Q / Dock-quit). */
  onRequestQuit(callback: () => void): () => void

  // Toolbar cross-window broadcast
  setActiveTool(config: ToolConfig): void
  onToolConfigChanged(cb: (config: ToolConfig) => void): () => void
  setStrokeStyle(style: StrokeStylePayload): void
  onStrokeStyleChanged(cb: (style: StrokeStylePayload) => void): () => void
  clearCanvas(): void
  onClearCanvasRequested(cb: () => void): () => void

  // History cross-window broadcast
  triggerUndo(): void
  triggerRedo(): void
  onUndo(cb: () => void): () => void
  onRedo(cb: () => void): () => void
  reportHistoryState(state: HistoryState): void
  onHistoryStateChanged(cb: (state: HistoryState) => void): () => void

  // Control bar layout
  getLayout(): Promise<import('@openpen/module-api').ControlBarLayout>
  setLayout(layout: import('@openpen/module-api').ControlBarLayout): Promise<{ ok: boolean; error?: string }>
  repairLayout(knownIds: string[]): Promise<void>
  onLayoutUpdated(cb: (layout: import('@openpen/module-api').ControlBarLayout) => void): () => void

  // Diagnostics (corruption-recovery sidecar)
  getDiagnosticsState(): Promise<DiagnosticsState>
  acknowledgeDiagnostics(id: string): Promise<void>
  openBackupDir(backupPath: string): Promise<void>
  onDiagnosticsStateChanged(cb: (state: DiagnosticsState) => void): () => void

  // System diagnostics (platform rendering checks)
  onTransparentRenderingBroken(cb: () => void): () => void

  // Crash / error reporting
  recordError(payload: {
    level?: 'error' | 'warn'
    message: string
    stack?: string
    source?: string
    line?: number
    column?: number
  }): void

  // Audit log (read-only)
  getAuditLogEntries(opts?: { limit?: number; since?: number; pluginId?: string | null }): Promise<AuditLogEntry[]>
  clearAuditLog(): Promise<void>

  // Module settings
  getModuleSettings(moduleId: string): Promise<{ data: Record<string, unknown>; schemaVersion: number }>
  setModuleSettings(moduleId: string, settings: Record<string, unknown>, schemaVersion: number): Promise<void>
  onModuleSettingsChanged(cb: (payload: { moduleId: string; settings: Record<string, unknown> }) => void): () => void

  // Modules
  getInitialDisabledModules(): Promise<string[]>
  getPluginMeta(): Promise<Record<string, { installedAt: string }>>

  // Plugin marketplace
  fetchPluginCatalog(): Promise<{ ok: true; plugins: CatalogEntry[] } | { ok: false; error: string }>
  installPlugin(id: string): Promise<{ ok: true; entry: PluginEntry } | { ok: false; error: string }>
  removePlugin(id: string): Promise<{ ok: true } | { ok: false; error: string }>
  addPluginFromLocal(sourcePath: string): Promise<{ ok: true; entry: PluginEntry } | { ok: false; error: string }>
  addPluginFromGitHubRepo(repoUrl: string): Promise<{ ok: true; entry: PluginEntry } | { ok: false; error: string }>
  inspectPluginSource(sourcePath: string): Promise<
    | { ok: true; info: { id: string; scope: string; name: string; version: string; displayName: string; description?: string; changelog?: string[] } }
    | { ok: false; error: string }
  >
  onPluginInstallProgress(cb: (payload: { stage: 'download' | 'verify' | 'extract'; percent?: number }) => void): () => void
  pickPluginFolder(): Promise<string | null>
  onModuleManifests(cb: (manifests: ModuleManifest[]) => void): () => void
  getModuleManifests(): Promise<ModuleManifest[]>
  onLifecycleEvent(cb: (event: 'quit' | 'suspend' | 'ready') => void): () => void
  moduleCall(moduleId: string, action: string, payload: unknown): Promise<unknown>
  registerShortcut(id: string, keys: string): void
  unregisterShortcut(id: string): void
  onShortcutTriggered(cb: (payload: { id: string }) => void): () => void
  /** Persist plugin id collision resolutions, then relaunch. */
  setPluginConflictResolutions(resolutions: Record<string, string>): Promise<void>
}

interface Window {
  openPenApi?: OpenPenApi
  __OPENPEN_DEBUG__?: Record<string, unknown>
}
