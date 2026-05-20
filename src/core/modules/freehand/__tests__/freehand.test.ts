import { describe, it, expect } from 'vitest'
import freehand from '../index'
import { freehandCursor, freehandCursorAnimated } from '../cursor'

describe('freehand module', () => {
  it('has correct id', () => {
    expect(freehand.id).toBe('@openpen/freehand')
  })

  it('contributes exactly one canvas tool with id freehand', () => {
    const tools = freehand.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('freehand')
  })

  it('contributes one cursor with the pen-tip hotspot', () => {
    const cursors = freehand.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('freehand')
    const cursor = cursors[0].cursor
    if (typeof cursor === 'string' || !('svg' in cursor)) {
      throw new Error('expected SvgCursorSpec')
    }
    expect(cursor.svg).toContain('<svg')
    expect(cursor.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('exports both static and animated cursor variants', () => {
    expect(freehandCursor.svg).toContain('<svg')
    expect(freehandCursor.svg).not.toContain('@keyframes')
    expect(freehandCursor.hotspot).toEqual({ x: 2, y: 22 })

    expect(freehandCursorAnimated.svg).toContain('<svg')
    expect(freehandCursorAnimated.svg).toContain('@keyframes')
    expect(freehandCursorAnimated.hotspot).toEqual({ x: 2, y: 22 })
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
