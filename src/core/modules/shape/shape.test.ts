import { describe, it, expect } from 'vitest'
import shape from './index'

describe('shape module', () => {
  it('has correct id', () => {
    expect(shape.id).toBe('@openpen/shape')
  })

  it('contributes exactly one canvas tool with id shape', () => {
    const tools = shape.contributes?.tools ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('shape')
  })

  it('contributes 10 built-in shapes', () => {
    const shapes = shape.contributes?.shapes ?? []
    expect(shapes).toHaveLength(10)
    const ids = shapes.map((s) => s.id)
    for (const id of ['circle', 'ellipse', 'square', 'rect', 'roundrect', 'triangle', 'triangle-down', 'diamond', 'parallelogram', 'star']) {
      expect(ids).toContain(id)
    }
  })

  it('built-in shapes are registered in display order', () => {
    const shapes = shape.contributes?.shapes ?? []
    const ids = shapes.map((s) => s.id)
    expect(ids).toEqual([
      'circle', 'ellipse', 'square', 'rect', 'roundrect',
      'triangle', 'triangle-down', 'diamond', 'parallelogram', 'star',
    ])
  })

  it('contributes a crosshair cursor', () => {
    const cursors = shape.contributes?.cursors ?? []
    expect(cursors.some((c) => c.id === 'shape' && c.cursor === 'crosshair')).toBe(true)
  })

  it('contributes locales with all required shape keys in en', () => {
    const locales = shape.contributes?.locales ?? {}
    const en = locales['en'] as Record<string, string>
    expect(en).toBeDefined()
    for (const key of [
      'tool', 'options',
      'circle', 'ellipse', 'square', 'rect', 'roundrect',
      'triangle', 'triangle-down', 'diamond', 'parallelogram', 'star',
      'fill', 'fillToggle',
    ]) {
      expect(en[key], `missing key: ${key}`).toBeTruthy()
    }
  })

  it('has setup() function', () => {
    expect(typeof shape.setup).toBe('function')
  })
})
