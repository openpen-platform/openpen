import { describe, it, expect, beforeEach } from 'vitest'
import { defineModule, type OpenPenModule } from '@openpen/module-api'
import {
  registerModule,
  unregisterModule,
  getModule,
  getAllModules,
  hasModule,
  resetModuleRegistry,
} from '../../src/core/runtime/module-registry'

function mod(id: string): OpenPenModule {
  return defineModule({ id, contributes: { tools: [] } })
}

describe('module-registry', () => {
  beforeEach(() => {
    resetModuleRegistry()
  })

  it('starts empty', () => {
    expect(getAllModules()).toEqual([])
  })

  describe('registerModule', () => {
    it('stores a module retrievable by id', () => {
      const m = mod('@test/a')
      registerModule(m)
      expect(getModule('@test/a')).toBe(m)
      expect(hasModule('@test/a')).toBe(true)
    })

    it('throws when registering a duplicate id', () => {
      registerModule(mod('@test/a'))
      expect(() => registerModule(mod('@test/a'))).toThrow(/already.*registered|duplicate/i)
    })

    it('preserves insertion order in getAllModules', () => {
      registerModule(mod('@test/first'))
      registerModule(mod('@test/second'))
      registerModule(mod('@test/third'))
      expect(getAllModules().map((m) => m.id)).toEqual(['@test/first', '@test/second', '@test/third'])
    })
  })

  describe('unregisterModule', () => {
    it('removes a registered module and returns true', () => {
      registerModule(mod('@test/a'))
      const ok = unregisterModule('@test/a')
      expect(ok).toBe(true)
      expect(hasModule('@test/a')).toBe(false)
      expect(getModule('@test/a')).toBeUndefined()
    })

    it('returns false when the id was not registered', () => {
      expect(unregisterModule('@test/non-existent')).toBe(false)
    })

    it('does not affect other modules', () => {
      registerModule(mod('@test/a'))
      registerModule(mod('@test/b'))
      unregisterModule('@test/a')
      expect(hasModule('@test/b')).toBe(true)
      expect(getAllModules()).toHaveLength(1)
    })
  })

  describe('getAllModules', () => {
    it('returns a snapshot — mutating it does not affect the registry', () => {
      registerModule(mod('@test/a'))
      const snap = getAllModules()
      snap.push(mod('@test/b'))
      expect(getAllModules()).toHaveLength(1)
    })
  })

  describe('resetModuleRegistry', () => {
    it('clears all modules', () => {
      registerModule(mod('@test/a'))
      registerModule(mod('@test/b'))
      resetModuleRegistry()
      expect(getAllModules()).toEqual([])
    })
  })
})
