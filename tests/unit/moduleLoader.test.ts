import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineModule, type ModuleSetupContext } from '@openpen/module-api'
import { loadModules } from '../../src/core/runtime/module-loader'
import { getAllModules, resetModuleRegistry } from '../../src/core/runtime/module-registry'
import { getSlotEntries, resetContributionStore } from '../../src/core/runtime/contribution-store'

const HOST = '1.0.0'

function makeCtx(moduleId: string): ModuleSetupContext {
  return {
    moduleId,
    locale: 'en',
    getSettings: <T = unknown>(): T => ({} as T),
    updateSettings: async () => {},
    onSettingsChange: () => () => {},
    callMain: async () => undefined as never,
    onDispose: () => {},
    notify: () => ({ dismiss: () => {} }),
    t: (key: string) => key,
  }
}

const noopTool = {
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => null,
}

describe('module-loader — loadModules', () => {
  beforeEach(() => {
    resetModuleRegistry()
    resetContributionStore()
  })

  it('returns success with empty result for empty input', async () => {
    const result = await loadModules({ modules: [], hostVersion: HOST })
    expect(result.errors).toEqual([])
    expect(result.loaded).toEqual([])
    expect(result.skipped).toEqual([])
    expect(getAllModules()).toEqual([])
  })

  it('registers valid modules into module-registry', async () => {
    const a = defineModule({ id: '@test/a', contributes: { tools: [] } })
    const b = defineModule({ id: '@test/b', contributes: { tools: [] } })
    const result = await loadModules({ modules: [a, b], hostVersion: HOST })
    expect(result.loaded).toEqual(['@test/a', '@test/b'])
    expect(result.skipped).toEqual([])
    expect(getAllModules().map((m) => m.id)).toEqual(['@test/a', '@test/b'])
  })

  it('registers contributions into contribution-store', async () => {
    const m = defineModule({
      id: '@test/mod',
      contributes: {
        tools: [
          { id: 'tool-1', ...noopTool },
          { id: 'tool-2', ...noopTool },
        ],
        settingsTabs: [{ id: 'tab', label: 'T', component: {} as never }],
      },
    })
    await loadModules({ modules: [m], hostVersion: HOST })

    const tools = getSlotEntries('canvas.tools').value
    expect(tools).toHaveLength(2)
    expect(tools[0].moduleId).toBe('@test/mod')
    expect((tools[0].contribution as { id: string }).id).toBe('tool-1')

    const tabs = getSlotEntries('ui.settings.tabs').value
    expect(tabs).toHaveLength(1)
    expect(tabs[0].moduleId).toBe('@test/mod')
  })

  it('handles single-object contribution slots (strokeStyle, locales, lifecycle)', async () => {
    const m = defineModule({
      id: '@test/mod',
      contributes: {
        strokeStyle: { provides: ['lineWidth'] },
        locales: { en: { hello: 'Hi' } },
      },
    })
    await loadModules({ modules: [m], hostVersion: HOST })

    const styleEntries = getSlotEntries('canvas.stroke.style').value
    expect(styleEntries).toHaveLength(1)
    expect((styleEntries[0].contribution as { provides: string[] }).provides).toEqual(['lineWidth'])

    const localeEntries = getSlotEntries('system.locales').value
    expect(localeEntries).toHaveLength(1)
  })

  describe('id collision handling', () => {
    it('plugin vs built-in: plugin is skipped, built-in loads', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const builtIn = defineModule({ id: '@test/freehand', contributes: { tools: [] } })
      const plugin = defineModule({ id: '@test/freehand', contributes: { tools: [] } })
      const builtInIds = new Set(['@test/freehand'])

      const result = await loadModules({
        modules: [builtIn, plugin],
        hostVersion: HOST,
        builtInModuleIds: builtInIds,
      })

      expect(result.loaded).toContain('@test/freehand')
      expect(result.errors).toHaveLength(0)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].module).toBe(plugin)
      expect(result.skipped[0].reason).toBe('duplicate-built-in')
      expect(result.pluginConflicts).toHaveLength(0)
      // Only one module registered
      expect(getAllModules()).toHaveLength(1)
      consoleWarn.mockRestore()
    })

    it('plugin vs plugin conflict: no modules load, pluginConflicts populated', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const p1 = defineModule({ id: '@vendor/tool', version: '1.0.0', contributes: { tools: [] } })
      const p2 = defineModule({ id: '@vendor/tool', version: '1.0.0', contributes: { tools: [] } })

      const result = await loadModules({ modules: [p1, p2], hostVersion: HOST })

      expect(result.loaded).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
      expect(result.skipped).toHaveLength(0)
      expect(result.pluginConflicts).toHaveLength(1)
      expect(result.pluginConflicts[0].id).toBe('@vendor/tool')
      expect(result.pluginConflicts[0].candidates).toHaveLength(2)
      // Nothing registered when there are unresolved conflicts
      expect(getAllModules()).toHaveLength(0)
      consoleWarn.mockRestore()
    })

    it('three plugins share same id: all go into pluginConflicts, nothing loads', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const p1 = defineModule({ id: '@vendor/tool', version: '1.0.0', contributes: { tools: [] } })
      const p2 = defineModule({ id: '@vendor/tool', version: '1.0.0', contributes: { tools: [] } })
      const p3 = defineModule({ id: '@vendor/tool', version: '1.0.0', contributes: { tools: [] } })

      const result = await loadModules({ modules: [p1, p2, p3], hostVersion: HOST })

      expect(result.loaded).toHaveLength(0)
      expect(result.pluginConflicts).toHaveLength(1)
      expect(result.pluginConflicts[0].candidates).toHaveLength(3)
      expect(result.skipped).toHaveLength(0)
      consoleWarn.mockRestore()
    })

    it('no conflict: all modules load normally, skipped is empty', async () => {
      const a = defineModule({ id: '@test/a', contributes: { tools: [] } })
      const b = defineModule({ id: '@test/b', contributes: { tools: [] } })
      const result = await loadModules({ modules: [a, b], hostVersion: HOST })
      expect(result.loaded).toEqual(['@test/a', '@test/b'])
      expect(result.skipped).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('mixed: built-ins + conflicting plugin + normal plugin — built-ins and normal plugin load', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const builtIn1 = defineModule({ id: '@openpen/freehand', contributes: { tools: [] } })
      const builtIn2 = defineModule({ id: '@openpen/color', contributes: { tools: [] } })
      const conflictPlugin = defineModule({ id: '@openpen/freehand', version: '1.0.0', contributes: { tools: [] } })
      const normalPlugin = defineModule({ id: '@vendor/extra', version: '1.0.0', contributes: { tools: [] } })
      const builtInIds = new Set(['@openpen/freehand', '@openpen/color'])

      const result = await loadModules({
        modules: [builtIn1, builtIn2, conflictPlugin, normalPlugin],
        hostVersion: HOST,
        builtInModuleIds: builtInIds,
      })

      expect(result.loaded.sort()).toEqual(['@openpen/color', '@openpen/freehand', '@vendor/extra'].sort())
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].module.id).toBe('@openpen/freehand')
      expect(result.skipped[0].reason).toBe('duplicate-built-in')
      expect(result.errors).toHaveLength(0)
      expect(result.pluginConflicts).toHaveLength(0)
      consoleWarn.mockRestore()
    })
  })

  describe('hard validation errors still fail', () => {
    it('slot-conflict (strokeStyle) still causes a hard error', async () => {
      const a = defineModule({
        id: '@test/a',
        contributes: { strokeStyle: { provides: ['lineWidth'] } },
      })
      const b = defineModule({
        id: '@test/b',
        contributes: { strokeStyle: { provides: ['lineWidth'] } },
      })
      const result = await loadModules({ modules: [a, b], hostVersion: HOST })
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].category).toBe('slot-conflict')
      expect(result.loaded).toEqual([])
    })

    it('min-version mismatch is still a hard error', async () => {
      const future = defineModule({
        id: '@test/future',
        minAppVersion: '99.0.0',
        contributes: { tools: [] },
      })
      const result = await loadModules({ modules: [future], hostVersion: '1.0.0' })
      expect(result.errors.some((e) => e.category === 'min-version')).toBe(true)
      expect(result.loaded).toEqual([])
    })
  })

  it('calls setup(ctx) for each module', async () => {
    const setupA = vi.fn()
    const setupB = vi.fn()
    const a = defineModule({ id: '@test/a', contributes: { tools: [] }, setup: setupA })
    const b = defineModule({ id: '@test/b', contributes: { tools: [] }, setup: setupB })
    await loadModules({
      modules: [a, b],
      hostVersion: HOST,
      makeSetupContext: makeCtx,
    })
    expect(setupA).toHaveBeenCalledOnce()
    expect(setupA.mock.calls[0][0]).toEqual({
      moduleId: '@test/a',
      locale: 'en',
      getSettings: expect.any(Function),
      updateSettings: expect.any(Function),
      onSettingsChange: expect.any(Function),
      callMain: expect.any(Function),
      onDispose: expect.any(Function),
      notify: expect.any(Function),
      t: expect.any(Function),
    })
    expect(setupB).toHaveBeenCalledOnce()
  })

  it('rolls back the failing module and keeps loading the rest', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = defineModule({
      id: '@test/failing',
      contributes: { tools: [] },
      setup: () => {
        throw new Error('boom')
      },
    })
    const ok = defineModule({ id: '@test/ok', contributes: { tools: [] }, setup: vi.fn() })

    const result = await loadModules({
      modules: [failing, ok],
      hostVersion: HOST,
      makeSetupContext: makeCtx,
    })

    // Failing module is rolled back; surviving module continues.
    expect(result.loaded).toEqual(['@test/ok'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].moduleId).toBe('@test/failing')
    expect(result.errors[0].category).toBe('setup-failed')
    expect(result.errors[0].message).toContain('boom')
    expect(consoleErr).toHaveBeenCalled()
    expect(consoleErr.mock.calls[0].join(' ')).toMatch(/setup.*failing|failing.*setup/i)
    consoleErr.mockRestore()
  })

  it('skips setup invocation when no makeSetupContext is provided', async () => {
    const setup = vi.fn()
    const m = defineModule({ id: '@test/a', contributes: { tools: [] }, setup })
    await loadModules({ modules: [m], hostVersion: HOST })
    expect(setup).not.toHaveBeenCalled()
  })
})
