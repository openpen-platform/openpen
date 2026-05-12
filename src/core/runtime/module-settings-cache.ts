/**
 * Renderer-side in-memory cache and pub/sub for module settings.
 *
 * Extracted from bootstrap.ts so both bootstrap and module-loader can
 * import it without creating a circular dependency.
 *
 * Cache contract:
 *   - Values are already validated by settingsSchema (or {} when no schema).
 *   - getSettingsCache() returns the live reference — callers MUST NOT mutate it.
 *   - setSettingsCache() replaces the entry; notifySettingsChange() fires subscribers.
 *   - clearSettingsCache() is called on module rollback to prevent stale reads.
 */

/** Validated settings blobs keyed by moduleId. */
const settingsCache = new Map<string, unknown>()

/** Per-module set of live change subscribers. */
const subscribers = new Map<string, Set<(value: unknown) => void>>()

export function setSettingsCache(moduleId: string, value: unknown): void {
  settingsCache.set(moduleId, value)
}

export function getSettingsCache(moduleId: string): unknown {
  return settingsCache.get(moduleId)
}

export function notifySettingsChange(moduleId: string, value: unknown): void {
  settingsCache.set(moduleId, value)
  const subs = subscribers.get(moduleId)
  if (!subs) return
  for (const cb of subs) {
    try {
      cb(value)
    } catch (err) {
      console.error(`[module-settings-cache] subscriber for "${moduleId}" threw:`, err)
    }
  }
}

/**
 * Subscribe to settings changes for a specific module. Returns an
 * unsubscribe function. Safe to call multiple times with different cbs.
 */
export function subscribeSettingsChange(
  moduleId: string,
  cb: (value: unknown) => void
): () => void {
  let subs = subscribers.get(moduleId)
  if (!subs) {
    subs = new Set()
    subscribers.set(moduleId, subs)
  }
  subs.add(cb)
  return () => {
    subs!.delete(cb)
    if (subs!.size === 0) subscribers.delete(moduleId)
  }
}

/**
 * Drop the settings cache entry and all subscribers for a module.
 * Called by rollbackModule() so unloaded modules don't receive stale callbacks.
 */
export function clearSettingsCache(moduleId: string): void {
  settingsCache.delete(moduleId)
  subscribers.delete(moduleId)
}

/** Test-only: wipe all state. */
export function resetSettingsCacheForTest(): void {
  settingsCache.clear()
  subscribers.clear()
}
