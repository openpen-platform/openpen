/**
 * Unit tests for the module settings runtime:
 *   getSettings(), updateSettings(), onSettingsChange(), migration.
 *
 * The tests drive the cache + subscriber logic in module-settings-cache.ts
 * and the host logic assembled in bootstrap.ts's makeSetupContextFactory /
 * prepareModuleSettings. window.openPenApi is mocked throughout.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { z } from 'zod'
import {
  setSettingsCache,
  getSettingsCache,
  notifySettingsChange,
  subscribeSettingsChange,
  clearSettingsCache,
  resetSettingsCacheForTest,
} from '../../src/core/runtime/module-settings-cache'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock of window.openPenApi for settings tests. */
function buildApiMock() {
  const getModuleSettings = vi.fn().mockResolvedValue({ data: {}, schemaVersion: 1 })
  // setModuleSettings simulates the main-process broadcast echo back to
  // the renderer, so subscribers fire exactly once (the same path
  // production goes through after the IPC roundtrip).
  const setModuleSettings = vi.fn().mockImplementation(
    async (moduleId: string, settings: Record<string, unknown>) => {
      notifySettingsChange(moduleId, settings)
    }
  )
  const onModuleSettingsChanged = vi.fn().mockReturnValue(() => {})

  Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true })
  ;(window as Window & typeof globalThis).openPenApi = {
    getModuleSettings,
    setModuleSettings,
    onModuleSettingsChanged,
  } as never

  return { getModuleSettings, setModuleSettings, onModuleSettingsChanged }
}

const MySchema = z.object({
  color: z.string().default('#fff'),
  opacity: z.number().min(0).max(1).default(1),
})
type MySettings = z.infer<typeof MySchema>

/** Build a minimal module definition and setup context mirroring bootstrap logic. */
function makeModuleWithContext(moduleId: string, overrides?: {
  settingsSchema?: z.ZodType
  settingsVersion?: number
  migrate?: (v: number, d: Record<string, unknown>) => Record<string, unknown>
}) {
  const m = {
    id: moduleId,
    settingsSchema: overrides?.settingsSchema ?? MySchema,
    settingsVersion: overrides?.settingsVersion ?? 1,
    migrate: overrides?.migrate,
  }

  // Simulate bootstrap: cache already hydrated before setup() runs.
  const initialData = m.settingsSchema?.parse({}) ?? {}
  setSettingsCache(moduleId, initialData)

  const ctx = {
    moduleId,
    getSettings: <T = unknown>(): T => (getSettingsCache(moduleId) ?? {}) as unknown as T,
    updateSettings: async <T = unknown>(patch: Partial<T>): Promise<void> => {
      if (!m.settingsSchema) {
        throw new Error(
          `[module-api] ctx.updateSettings() requires a settingsSchema on the module definition for "${moduleId}".`
        )
      }
      const current = (getSettingsCache(moduleId) ?? {}) as Record<string, unknown>
      const merged = { ...current, ...(patch as Record<string, unknown>) }
      const result = m.settingsSchema.safeParse(merged)
      if (!result.success) throw result.error
      await window.openPenApi?.setModuleSettings(
        moduleId,
        result.data as Record<string, unknown>,
        m.settingsVersion ?? 1
      )
      // Mirror production: only update the local cache. Subscribers fire
      // when the main-process broadcast echo arrives — the test's
      // setModuleSettings mock simulates that echo via notifySettingsChange.
      setSettingsCache(moduleId, result.data)
    },
    onSettingsChange: <T = unknown>(cb: (s: T) => void): (() => void) => {
      return subscribeSettingsChange(moduleId, (v) => cb(v as T))
    },
  }

  return { m, ctx }
}

// ---------------------------------------------------------------------------
// Cache isolation: module-settings-cache primitives
// ---------------------------------------------------------------------------

describe('module-settings-cache — isolation', () => {
  beforeEach(() => resetSettingsCacheForTest())
  afterEach(() => resetSettingsCacheForTest())

  it('getSettingsCache for a different module does not see this module\'s cache', () => {
    setSettingsCache('mod-a', { color: 'red' })
    setSettingsCache('mod-b', { color: 'blue' })

    expect((getSettingsCache('mod-a') as MySettings).color).toBe('red')
    expect((getSettingsCache('mod-b') as MySettings).color).toBe('blue')
    // mod-a should not leak into mod-b
    expect((getSettingsCache('mod-a') as MySettings).color).not.toBe('blue')
  })

  it('clearSettingsCache removes entry and stops subscribers', () => {
    setSettingsCache('mod-c', { color: 'green' })
    const cb = vi.fn()
    subscribeSettingsChange('mod-c', cb)

    clearSettingsCache('mod-c')

    expect(getSettingsCache('mod-c')).toBeUndefined()
    // Notify after clear should not reach the now-removed subscriber
    notifySettingsChange('mod-c', { color: 'green' })
    expect(cb).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getSettings()
// ---------------------------------------------------------------------------

describe('getSettings()', () => {
  beforeEach(() => {
    resetSettingsCacheForTest()
    buildApiMock()
  })
  afterEach(() => resetSettingsCacheForTest())

  it('returns parsed defaults when no persisted data exists', () => {
    const { ctx } = makeModuleWithContext('mod-defaults')
    const s = ctx.getSettings<MySettings>()
    expect(s.color).toBe('#fff')
    expect(s.opacity).toBe(1)
  })

  it('returns the live cache reference (subsequent calls reflect writes)', () => {
    const { ctx } = makeModuleWithContext('mod-live')
    // Simulate an in-place cache update without IPC (direct cache write)
    setSettingsCache('mod-live', { color: 'blue', opacity: 0.5 })
    const s = ctx.getSettings<MySettings>()
    expect(s.color).toBe('blue')
    expect(s.opacity).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// updateSettings()
// ---------------------------------------------------------------------------

describe('updateSettings()', () => {
  beforeEach(() => {
    resetSettingsCacheForTest()
    buildApiMock()
  })
  afterEach(() => resetSettingsCacheForTest())

  it('shallow-merges patch and persists via IPC', async () => {
    const { getModuleSettings, setModuleSettings } = buildApiMock()
    getModuleSettings.mockResolvedValue({ data: { color: '#fff', opacity: 1 }, schemaVersion: 1 })

    const { ctx } = makeModuleWithContext('mod-merge')
    await ctx.updateSettings<MySettings>({ color: '#000' })

    expect(setModuleSettings).toHaveBeenCalledWith(
      'mod-merge',
      { color: '#000', opacity: 1 },
      1,
    )
    expect(ctx.getSettings<MySettings>().color).toBe('#000')
    // opacity unchanged
    expect(ctx.getSettings<MySettings>().opacity).toBe(1)
  })

  it('rejects with ZodError on schema violation; no IPC call happens', async () => {
    const { setModuleSettings } = buildApiMock()
    const { ctx } = makeModuleWithContext('mod-invalid')

    // opacity must be 0–1; 999 violates the schema
    await expect(ctx.updateSettings<MySettings>({ opacity: 999 })).rejects.toMatchObject({
      name: 'ZodError',
    })
    expect(setModuleSettings).not.toHaveBeenCalled()
  })

  it('throws synchronously if settingsSchema is undefined', async () => {
    buildApiMock()
    // Module with no schema
    const moduleId = 'mod-no-schema'
    setSettingsCache(moduleId, {})
    const ctx = {
      getSettings: () => getSettingsCache(moduleId),
      updateSettings: async <T = unknown>(patch: Partial<T>): Promise<void> => {
        const m = { id: moduleId, settingsSchema: undefined }
        if (!m.settingsSchema) {
          throw new Error(
            `[module-api] ctx.updateSettings() requires a settingsSchema on the module definition for "${moduleId}".`
          )
        }
      },
    }

    await expect(ctx.updateSettings({ color: 'red' })).rejects.toThrow('settingsSchema')
  })
})

// ---------------------------------------------------------------------------
// onSettingsChange()
// ---------------------------------------------------------------------------

describe('onSettingsChange()', () => {
  beforeEach(() => {
    resetSettingsCacheForTest()
    buildApiMock()
  })
  afterEach(() => resetSettingsCacheForTest())

  it('fires after successful updateSettings', async () => {
    buildApiMock()
    const { ctx } = makeModuleWithContext('mod-sub')
    const received: MySettings[] = []
    ctx.onSettingsChange<MySettings>((s) => received.push(s))

    await ctx.updateSettings<MySettings>({ color: '#123' })

    expect(received).toHaveLength(1)
    expect(received[0].color).toBe('#123')
  })

  it('unsubscribe fn stops further callbacks', async () => {
    buildApiMock()
    const { ctx } = makeModuleWithContext('mod-unsub')
    const received: MySettings[] = []
    const stop = ctx.onSettingsChange<MySettings>((s) => received.push(s))

    await ctx.updateSettings<MySettings>({ color: '#aaa' })
    stop()
    await ctx.updateSettings<MySettings>({ color: '#bbb' })

    expect(received).toHaveLength(1)
    expect(received[0].color).toBe('#aaa')
  })
})

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  beforeEach(() => {
    resetSettingsCacheForTest()
    buildApiMock()
  })
  afterEach(() => resetSettingsCacheForTest())

  it('runs migrate() when storedVersion < module.settingsVersion', async () => {
    const { getModuleSettings, setModuleSettings } = buildApiMock()
    // Stored at version 1 with old key name
    getModuleSettings.mockResolvedValue({
      data: { legacyColor: 'red', opacity: 0.8 },
      schemaVersion: 1,
    })

    const MigratedSchema = z.object({
      color: z.string().default('#fff'),
      opacity: z.number().min(0).max(1).default(1),
    })

    const migrate = vi.fn((storedVersion: number, data: Record<string, unknown>) => {
      if (storedVersion < 2 && 'legacyColor' in data) {
        return { color: data.legacyColor, opacity: data.opacity }
      }
      return data
    })

    // Simulate prepareModuleSettings logic inline (bootstrap calls IPC)
    const { data, schemaVersion: storedVersion } = await window.openPenApi!.getModuleSettings('mod-migrate')
    const targetVersion = 2
    let migratedData: Record<string, unknown> = data
    if (storedVersion < targetVersion) {
      migratedData = migrate(storedVersion, data)
    }
    const parsed = MigratedSchema.parse(migratedData)
    setSettingsCache('mod-migrate', parsed)
    await window.openPenApi!.setModuleSettings('mod-migrate', parsed, targetVersion)

    expect(migrate).toHaveBeenCalledWith(1, { legacyColor: 'red', opacity: 0.8 })
    expect(setModuleSettings).toHaveBeenCalledWith(
      'mod-migrate',
      { color: 'red', opacity: 0.8 },
      2,
    )
    expect((getSettingsCache('mod-migrate') as z.infer<typeof MigratedSchema>).color).toBe('red')
  })

  it('skips migration when versions match', async () => {
    const { getModuleSettings } = buildApiMock()
    getModuleSettings.mockResolvedValue({ data: { color: 'blue', opacity: 0.5 }, schemaVersion: 2 })

    const migrate = vi.fn()

    const { data, schemaVersion: storedVersion } = await window.openPenApi!.getModuleSettings('mod-nomigrate')
    const targetVersion = 2
    if (storedVersion < targetVersion) {
      migrate(storedVersion, data)
    }

    expect(migrate).not.toHaveBeenCalled()
  })

  it('skips migration when migrate hook is absent', async () => {
    const { getModuleSettings, setModuleSettings } = buildApiMock()
    getModuleSettings.mockResolvedValue({ data: { color: 'green', opacity: 0.3 }, schemaVersion: 1 })

    // Module with settingsVersion 2 but no migrate hook
    const { data, schemaVersion: storedVersion } = await window.openPenApi!.getModuleSettings('mod-no-migrate-fn')
    const targetVersion = 2
    // No migrate fn: only version bump, data passes through as-is
    const parsed = MySchema.safeParse(data)
    const result = parsed.success ? parsed.data : MySchema.parse({})
    setSettingsCache('mod-no-migrate-fn', result)
    if (storedVersion < targetVersion) {
      await window.openPenApi!.setModuleSettings('mod-no-migrate-fn', result, targetVersion)
    }

    expect(setModuleSettings).toHaveBeenCalledWith(
      'mod-no-migrate-fn',
      { color: 'green', opacity: 0.3 },
      2,
    )
  })
})
