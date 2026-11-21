import { describe, it, expect, vi, beforeEach } from 'vitest'
import eraser from '../index'
import { lastEraserMode } from '../eraser-state'
import { emit } from '@openpen/module-api/host'

function makeCtx(saved: Record<string, unknown>) {
  const updateSettings = vi.fn().mockResolvedValue(undefined)
  return { ctx: { getSettings: () => saved, updateSettings } as never, updateSettings }
}

describe('eraser mode persistence', () => {
  beforeEach(() => { lastEraserMode.value = 'eraser' })

  it('restores the saved mode on setup', () => {
    const { ctx } = makeCtx({ mode: 'stroke-eraser' })
    eraser.setup!(ctx)
    expect(lastEraserMode.value).toBe('stroke-eraser')
  })

  it('tracks tool-changed in memory but never writes settings (hotkey / relay safe)', () => {
    const { ctx, updateSettings } = makeCtx({ mode: 'stroke-eraser' })
    eraser.setup!(ctx)
    emit('tool-changed', { tool: 'eraser' })
    expect(lastEraserMode.value).toBe('eraser')
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('ignores non-eraser tools', () => {
    const { ctx } = makeCtx({ mode: 'stroke-eraser' })
    eraser.setup!(ctx)
    emit('tool-changed', { tool: 'freehand' })
    expect(lastEraserMode.value).toBe('stroke-eraser')
  })
})
