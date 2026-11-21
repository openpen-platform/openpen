import { describe, it, expect, vi, beforeEach } from 'vitest'
import shape from '../index'
import { currentShape, filled } from '../shape-state'
import { emit } from '@openpen/module-api/host'

function makeCtx(saved: Record<string, unknown>) {
  const updateSettings = vi.fn().mockResolvedValue(undefined)
  return { ctx: { getSettings: () => saved, updateSettings } as never, updateSettings }
}

describe('shape selection persistence', () => {
  beforeEach(() => {
    currentShape.value = 'rect'
    filled.value = false
  })

  it('restores saved shape kind and fill on setup', () => {
    const { ctx } = makeCtx({ shapeType: 'star', filled: true })
    shape.setup!(ctx)
    expect(currentShape.value).toBe('star')
    expect(filled.value).toBe(true)
  })

  it('ignores an unknown saved shape id', () => {
    const { ctx } = makeCtx({ shapeType: 'nope', filled: false })
    shape.setup!(ctx)
    expect(currentShape.value).toBe('rect')
  })

  it('syncs state from tool-changed but does not write settings (panel writes them)', () => {
    const { ctx, updateSettings } = makeCtx({})
    shape.setup!(ctx)
    emit('tool-changed', { tool: 'shape', shapeType: 'circle', filled: true })
    expect(currentShape.value).toBe('circle')
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
