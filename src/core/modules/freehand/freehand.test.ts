import { describe, it, expect } from 'vitest'
import freehand from './index'

describe('freehand module', () => {
  it('has correct id', () => {
    expect(freehand.id).toBe('@openpen/freehand')
  })

  it('contributes exactly one canvas tool with id freehand', () => {
    const tools = freehand.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('freehand')
  })

  it('contributes a crosshair cursor', () => {
    const cursors = freehand.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('freehand')
    expect(cursors[0].cursor).toBe('crosshair')
  })

  it('contributes locales with en entry and required keys', () => {
    const locales = freehand.contributes?.locales ?? {}
    expect(locales['en']).toBeDefined()
    expect((locales['en'] as Record<string, string>)['tool']).toBeTruthy()
  })

  it('tool has required handler functions', () => {
    const tool = freehand.contributes?.tools?.[0]
    expect(typeof tool?.onPointerDown).toBe('function')
    expect(typeof tool?.onPointerMove).toBe('function')
    expect(typeof tool?.onPointerUp).toBe('function')
  })
})
