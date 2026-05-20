import { describe, it, expect } from 'vitest'
import eraser from '../index'

describe('eraser module', () => {
  it('has correct id', () => {
    expect(eraser.id).toBe('@openpen/eraser')
  })

  it('contributes exactly one canvas tool with id eraser', () => {
    const tools = eraser.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('eraser')
  })

  it('tool has a renderStroke function', () => {
    const tool = eraser.contributes?.tools?.[0]
    expect(typeof tool?.renderStroke).toBe('function')
  })

  it('contributes one cursor with the eraser-corner hotspot', () => {
    const cursors = eraser.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('eraser')
    const cursor = cursors[0].cursor
    if (typeof cursor === 'string' || !('svg' in cursor)) {
      throw new Error('expected SvgCursorSpec')
    }
    expect(cursor.svg).toContain('<svg')
    expect(cursor.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('exports both static and animated cursor variants', async () => {
    const { eraserCursor, eraserCursorAnimated } = await import('../cursor')
    expect(eraserCursor.svg).toContain('<svg')
    expect(eraserCursor.svg).not.toContain('@keyframes')
    expect(eraserCursor.hotspot).toEqual({ x: 2, y: 22 })

    expect(eraserCursorAnimated.svg).toContain('<svg')
    expect(eraserCursorAnimated.svg).toContain('@keyframes')
    expect(eraserCursorAnimated.hotspot).toEqual({ x: 2, y: 22 })
  })

  it('contributes locales with all required eraser keys in en', () => {
    const locales = eraser.contributes?.locales ?? {}
    const en = locales['en'] as Record<string, string>
    expect(en).toBeDefined()
    for (const key of ['tool', 'toolAria', 'modeMenu', 'modeBrush', 'modeBrushSub', 'modeStroke', 'modeStrokeSub']) {
      expect(en[key], `missing key: ${key}`).toBeTruthy()
    }
  })
})
