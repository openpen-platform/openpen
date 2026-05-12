import type { z } from 'zod'
import type { ModuleContributions } from './contributions'
import type { NotifyPayload, NotifyHandle } from './notification'
import type { LocaleMap } from '../locale'

/**
 * Public contract that every OpenPen module — first-party (`src/core/modules/*`)
 * and third-party plugin alike — must satisfy.
 *
 * Modules express their behaviour entirely via `contributes` and
 * (optionally) `setup`. They never touch host-app internals directly:
 * cross-module communication goes through declared contribution slots
 * and the domain event bus.
 */
export interface OpenPenModule {
  /** Globally unique kebab-case id. Subject to {@link import('../validation').MODULE_ID_RE}. */
  id: string

  /**
   * i18n-independent display metadata. Used as a fallback layer in the
   * Settings UI when the module's `contributes.locales` entries are not
   * registered (e.g. the module is disabled and its contributions are not
   * wired into the host). The runtime i18n contribution is always preferred
   * as the primary source; this field is only consulted on a cache miss.
   *
   * Values are `LocaleMap` (`Record<string, string>`) keyed by BCP-47 tag.
   * Resolution follows the same order as `resolveLabel`: exact tag → language
   * prefix → `'en'` fallback → first declared value.
   */
  metadata?: {
    name: LocaleMap
    description?: LocaleMap
  }

  /**
   * SemVer string. **Required for plugins** — the host validator
   * rejects any non-built-in module whose `version` is missing or
   * empty with a `'missing-version'` ValidationError, so a plugin
   * with no version never finishes loading.
   *
   * Built-in modules (those bundled with the host under
   * `src/core/modules/`) MAY omit it and inherit the host version;
   * the type stays optional only to accommodate that case.
   */
  version?: string

  /**
   * Minimum OpenPen app version this module requires (semver).
   *
   * Validated at load time by the host: a plugin whose `minAppVersion`
   * exceeds the running host version is skipped with a console warning.
   * Set this to `"1.0.0"` (or omit it) for broad v1.x compatibility.
   */
  minAppVersion?: string

  /**
   * One-shot initialisation, called after manifest validation and
   * before contributions are wired into the host. Use this for things
   * that need to happen exactly once, like seeding default settings or
   * subscribing to long-running event streams.
   */
  setup?: (ctx: ModuleSetupContext) => void | Promise<void>

  /** At least one field on this object is required (enforced by `defineModule`). */
  contributes?: ModuleContributions

  /**
   * Zod schema for this module's user-facing settings. The host renders
   * the settings form from this schema and persists the parsed value
   * under `config.json.modules[id]`. The same schema validates writes
   * made via `ctx.updateSettings()`; writes that fail validation reject
   * with the underlying `ZodError`.
   *
   * Modules that intend to call `ctx.updateSettings()` MUST declare
   * this field; calling `updateSettings` without a schema throws at
   * runtime so the missing contract surfaces during development.
   */
  settingsSchema?: z.ZodType

  /**
   * Settings schema version. Increment when the schema's shape changes
   * in a way that needs migration (renames, removals, or restructuring).
   * Pure additive changes (new keys with `.default()` values) do not
   * require a bump — Zod's defaults fill in on parse.
   *
   * Defaults to `1` if omitted. The host persists the version under
   * `config.json.moduleMeta[id].schemaVersion` (separate from the data
   * blob) so plugins never see this sentinel in their settings object.
   */
  settingsVersion?: number

  /**
   * Optional migration hook run before `settingsSchema` parses persisted
   * data. Called when the stored `schemaVersion` is less than the
   * module's `settingsVersion`. Receives the stored version + raw data
   * blob; returns the migrated blob, which is then validated by
   * `settingsSchema` and persisted at the new version.
   *
   * Use this for renames, removals, or restructuring. For pure additive
   * changes (new keys), Zod's `.default()` covers it — no migrate hook
   * needed.
   *
   * @example
   * migrate(stored, data) {
   *   if (stored < 2 && 'oldName' in data) {
   *     data.newName = data.oldName
   *     delete data.oldName
   *   }
   *   return data
   * }
   */
  migrate?: (
    storedVersion: number,
    data: Record<string, unknown>
  ) => Record<string, unknown>
}

/**
 * Runtime context handed to `setup()`. Intentionally narrow — modules
 * that need more capabilities should declare them via contribution
 * slots so the dependency is visible at validation time.
 */
export interface ModuleSetupContext {
  /** This module's id, for logging / error messages. */
  moduleId: string
  /** Currently active locale, e.g. 'zh-TW'. Read-only. */
  locale: string
  /**
   * Returns this module's current settings — a live in-memory snapshot
   * already validated by `settingsSchema`. Synchronous and zero-I/O:
   * the host hydrates the cache before `setup()` is called and updates
   * it in-place after every successful `updateSettings()`.
   *
   * Generic `T` should match the inferred type of your `settingsSchema`
   * (use `z.infer<typeof MySchema>` at the call site).
   *
   * @example
   * const settings = ctx.getSettings<z.infer<typeof MySchema>>()
   */
  getSettings: <T = unknown>() => T

  /**
   * Shallow-merges `patch` into this module's settings, validates the
   * result against `settingsSchema` (Zod), and persists to `config.json`.
   * Resolves once the write is durable; rejects with the underlying
   * `ZodError` if the merged object fails validation (no I/O happens
   * on validation failure).
   *
   * The in-memory snapshot returned by `getSettings()` is updated
   * before the Promise resolves; subscribers registered via
   * `onSettingsChange()` then fire with the new snapshot.
   *
   * Note on nested objects: the merge is shallow. Updating a nested
   * object replaces it entirely — spread the existing nested value
   * yourself if you only want to change one inner field:
   *
   * ```ts
   * const cur = ctx.getSettings<MySettings>()
   * await ctx.updateSettings({ colors: { ...cur.colors, primary: '#0f0' } })
   * ```
   *
   * Throws synchronously if the module did not declare `settingsSchema`.
   */
  updateSettings: <T = unknown>(patch: Partial<T>) => Promise<void>

  /**
   * Subscribe to settings changes for this module. The callback fires
   * after every successful `updateSettings()` — including writes that
   * originated from the host's settings panel — with the fresh,
   * already-validated snapshot.
   *
   * Returns an unsubscribe function. The host also calls it
   * automatically when the module is rolled back, so manual cleanup
   * is only needed if you want to stop listening sooner than
   * module dispose.
   *
   * @example
   * const stop = ctx.onSettingsChange<MySettings>((s) => {
   *   redrawWithColor(s.primary)
   * })
   */
  onSettingsChange: <T = unknown>(cb: (settings: T) => void) => () => void

  /**
   * Invoke one of THIS module's main-side handlers (declared via
   * `contributes.mainHandlers`). The moduleId is captured by the host
   * so plugins cannot reach into other modules' handlers — use this
   * helper rather than the lower-level `openPenApi.moduleCall`.
   *
   * Returns whatever the handler returns (typed by the caller).
   */
  callMain: <T = unknown>(action: string, payload?: unknown) => Promise<T>
  /**
   * Register a cleanup callback. Called in reverse registration order
   * when the module is unloaded (hot-reload, user-disable, or app quit).
   * Use this to cancel timers, remove listeners, or release resources
   * that `setup()` acquired.
   */
  onDispose: (fn: () => void | Promise<void>) => void
  /**
   * Shows a short-lived toast notification in the overlay window.
   * Visibility and position are controlled by the user's settings.
   * Returns a NotifyHandle for early dismissal.
   */
  notify: (payload: NotifyPayload) => NotifyHandle

  /**
   * Resolves an i18n key for this module to the current-locale string.
   *
   * The key is automatically namespaced as `${moduleId}.${key}`, matching
   * the dictionary structure registered via `contributes.locales` (the host
   * merges each locale dict into the global vue-i18n instance under the
   * module's id namespace).
   *
   * Aligned with VS Code's `vscode.l10n.t()` convention:
   * ```typescript
   * ctx.t('notif.start')
   * ctx.t('notif.greeting', { name: 'Alice' })  // dict entry: 'Hello {name}'
   * ```
   *
   * When a key has no matching translation the namespaced key string is
   * returned (vue-i18n's default missing-key behaviour).
   */
  t: (key: string, params?: Record<string, unknown>) => string
}
