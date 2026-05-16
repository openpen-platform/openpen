import { describe, it, expect } from 'vitest'
import strokeEraser from './index'

describe('stroke-eraser module', () => {
  it('has correct id', () => {
    expect(strokeEraser.id).toBe('@openpen/stroke-eraser')
  })

  it('contributes exactly one canvas tool with id stroke-eraser', () => {
    const tools = strokeEraser.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('stroke-eraser')
  })

  it('tool has required handler functions', () => {
    const tool = strokeEraser.contributes?.tools?.[0]
    expect(typeof tool?.onPointerDown).toBe('function')
    expect(typeof tool?.onPointerMove).toBe('function')
    expect(typeof tool?.onPointerUp).toBe('function')
  })

  it('contributes one cursor with the eraser-corner hotspot', () => {
    const cursors = strokeEraser.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('stroke-eraser')
    const cursor = cursors[0].cursor
    if (typeof cursor === 'string' || !('svg' in cursor)) {
      throw new Error('expected SvgCursorSpec')
    }
    expect(cursor.svg).toContain('<svg')
    expect(cursor.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('exports both static and animated cursor variants', async () => {
    const { strokeEraserCursor, strokeEraserCursorAnimated } = await import('./cursor')
    expect(strokeEraserCursor.svg).toContain('<svg')
    expect(strokeEraserCursor.svg).not.toContain('@keyframes')
    expect(strokeEraserCursor.hotspot).toEqual({ x: 2, y: 22 })

    expect(strokeEraserCursorAnimated.svg).toContain('<svg')
    expect(strokeEraserCursorAnimated.svg).toContain('@keyframes')
    expect(strokeEraserCursorAnimated.hotspot).toEqual({ x: 2, y: 22 })
  })
})
