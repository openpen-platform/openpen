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

  it('contributes a pointer cursor', () => {
    const cursors = strokeEraser.contributes?.cursors ?? []
    expect(cursors).toHaveLength(1)
    expect(cursors[0].id).toBe('stroke-eraser')
    expect(cursors[0].cursor).toBe('pointer')
  })
})
