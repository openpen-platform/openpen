import { describe, it, expect } from 'vitest'
import line from '../index'

describe('line module', () => {
  it('has correct id', () => {
    expect(line.id).toBe('@openpen/line')
  })

  it('contributes exactly one canvas tool with id line', () => {
    const tools = line.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('line')
  })

  it('contributes one cursor with the straightedge-corner hotspot', () => {
    const cursors = line.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('line')
    const cursor = cursors[0].cursor
    if (typeof cursor === 'string' || !('svg' in cursor)) {
      throw new Error('expected SvgCursorSpec')
    }
    expect(cursor.svg).toContain('<svg')
    expect(cursor.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('exports both static and animated cursor variants', async () => {
    const { lineCursor, lineCursorAnimated } = await import('../cursor')
    expect(lineCursor.svg).toContain('<svg')
    expect(lineCursor.svg).not.toContain('@keyframes')
    expect(lineCursor.hotspot).toEqual({ x: 2, y: 22 })

    expect(lineCursorAnimated.svg).toContain('<svg')
    expect(lineCursorAnimated.svg).toContain('@keyframes')
    expect(lineCursorAnimated.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('contributes locales with en entry and required keys', () => {
    const locales = line.contributes?.locales ?? {}
    expect(locales['en']).toBeDefined()
    expect((locales['en'] as Record<string, string>)['tool']).toBeTruthy()
  })

  it('tool has required handler functions', () => {
    const tool = line.contributes?.tools?.[0]
    expect(typeof tool?.onPointerDown).toBe('function')
    expect(typeof tool?.onPointerMove).toBe('function')
    expect(typeof tool?.onPointerUp).toBe('function')
  })
})
