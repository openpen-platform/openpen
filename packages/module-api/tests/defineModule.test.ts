import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { defineModule } from '../src/define-module'

describe('defineModule', () => {
  it('returns the module spec for valid input', () => {
    const mod = defineModule({
      id: '@test/my-module',
      contributes: { tools: [] },
    })
    expect(mod.id).toBe('@test/my-module')
    expect(mod.contributes).toEqual({ tools: [] })
  })

  it('preserves optional fields', () => {
    const setup = vi.fn()
    const schema = z.object({ enabled: z.boolean() })
    const mod = defineModule({
      id: '@test/x',
      version: '1.0.0',
      minAppVersion: '0.1.0',
      setup,
      settingsSchema: schema,
      contributes: { tools: [] },
    })

    expect(mod.version).toBe('1.0.0')
    expect(mod.minAppVersion).toBe('0.1.0')
    expect(mod.setup).toBe(setup)
    expect(mod.settingsSchema).toBe(schema)
  })

  it('throws when id is missing', () => {
    expect(() =>
      defineModule({ id: '' as any, contributes: { tools: [] } })
    ).toThrow(/id/)
  })

  it('throws when id has invalid characters', () => {
    expect(() =>
      defineModule({ id: 'has space', contributes: { tools: [] } })
    ).toThrow(/id/i)
  })

  it('throws when id is bare (no scope)', () => {
    expect(() =>
      defineModule({ id: 'bare-id', contributes: { tools: [] } })
    ).toThrow(/id/i)
  })

  it('throws when contributes is missing entirely', () => {
    expect(() =>
      defineModule({ id: '@test/x' } as any)
    ).toThrow(/contributes/i)
  })

  it('throws when contributes is empty object', () => {
    expect(() =>
      defineModule({ id: '@test/x', contributes: {} })
    ).toThrow(/contributes/i)
  })

  it('throws when contributes references unknown slot', () => {
    expect(() =>
      defineModule({
        id: '@test/x',
        contributes: { madeUpSlot: [] } as any,
      })
    ).toThrow(/unknown.*slot|slot.*unknown/i)
  })

  it('accepts contributes with reserved slot (does not throw)', () => {
    expect(() =>
      defineModule({
        id: '@test/x',
        contributes: { strokeTransformers: [] },
      })
    ).not.toThrow()
  })
})
