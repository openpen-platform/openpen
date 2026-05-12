import { describe, it, expect, beforeEach } from 'vitest'
import {
  setModuleContext,
  clearModuleContext,
  resetModuleContextRegistryForTest,
} from '../../packages/module-api/src/host/module-context-registry'
import { useModuleContext } from '../../packages/module-api/src/use-module-context'
import type { ModuleSetupContext } from '../../packages/module-api/src/types/module'

function makeCtx(moduleId: string): ModuleSetupContext {
  return {
    moduleId,
    locale: 'en',
    getSettings: () => ({}),
    updateSettings: async () => {},
    onSettingsChange: () => () => {},
    callMain: async () => undefined as unknown as never,
    onDispose: () => {},
    notify: () => ({ dismiss: () => {} }),
    t: (key) => key,
  }
}

beforeEach(() => {
  resetModuleContextRegistryForTest()
})

describe('useModuleContext', () => {
  it('throws when no module is registered', () => {
    expect(() => useModuleContext('my-id')).toThrowError(
      /useModuleContext\("my-id"\) was called but no module is currently registered/
    )
  })

  it('returns the registered ctx after setModuleContext', () => {
    const ctx = makeCtx('my-id')
    setModuleContext('my-id', ctx)
    expect(useModuleContext('my-id')).toBe(ctx)
  })

  it('throws after clearModuleContext', () => {
    const ctx = makeCtx('my-id')
    setModuleContext('my-id', ctx)
    clearModuleContext('my-id')
    expect(() => useModuleContext('my-id')).toThrowError(
      /useModuleContext\("my-id"\)/
    )
  })

  it('isolates different moduleIds — no cross-leak', () => {
    const ctxA = makeCtx('plugin-a')
    const ctxB = makeCtx('plugin-b')
    setModuleContext('plugin-a', ctxA)
    setModuleContext('plugin-b', ctxB)

    expect(useModuleContext('plugin-a')).toBe(ctxA)
    expect(useModuleContext('plugin-b')).toBe(ctxB)
    expect(useModuleContext('plugin-a')).not.toBe(ctxB)
  })

  it('re-setting the same moduleId replaces the previous ctx', () => {
    const ctxOld = makeCtx('my-id')
    const ctxNew = makeCtx('my-id')
    setModuleContext('my-id', ctxOld)
    setModuleContext('my-id', ctxNew)

    expect(useModuleContext('my-id')).toBe(ctxNew)
    expect(useModuleContext('my-id')).not.toBe(ctxOld)
  })
})
