/** A plugin entry as returned from list/install operations. */
export interface PluginEntry {
  id: string         // @scope/name
  scope: string
  name: string
  version: string
  installedAt: string  // ISO 8601
}

/** Options common to install operations. */
export interface InstallOptions {
  /** Override the default ~/.openpen/plugins install root (useful in tests). */
  pluginsDir?: string
  /** Abort signal for cancelling in-flight network operations. */
  signal?: AbortSignal
  /** Progress callback fired during each install stage. */
  onProgress?: (event: ProgressEvent) => void
}

export interface ProgressEvent {
  stage: 'download' | 'verify' | 'extract'
  percent?: number
}

/**
 * A single plugin entry in the catalog's plugins.json aggregate.
 * Matches the schema described in plugin-publish-flow.md §4.8.
 */
export interface CatalogEntry {
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
}

export interface CatalogIndex {
  schemaVersion: number
  updatedAt?: string
  plugins: CatalogEntry[]
}
