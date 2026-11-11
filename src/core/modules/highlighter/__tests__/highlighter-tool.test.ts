import { describe, it, expect, vi } from 'vitest'
import { createHighlighterTool, HIGHLIGHTER_OPACITY } from '../highlighter-tool'
import type { StrokeStyle } from '@openpen/module-api'

const style: StrokeStyle = { color: '#ff8800', lineWidth: 14, lineCap: 'round', lineJoin: 'round' }

function makeCtx() {
  const alphaAtStroke: number[] = []
  const raw = {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => { alphaAtStroke.push(raw.globalAlpha) }),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
  }
  return { ctx: raw as unknown as CanvasRenderingContext2D, raw, alphaAtStroke }
}

describe('highlighter tool', () => {
  it('produces a semi-transparent stroke that carries the selected colour and width', () => {
    const tool = createHighlighterTool()
    const { ctx } = makeCtx()
    tool.onPointerDown(ctx, { x: 0, y: 0 }, style)
    tool.onPointerMove(ctx, { x: 20, y: 5 })
    const stroke = tool.onPointerUp(ctx, { x: 40, y: 10 })

    expect(stroke?.tool).toBe('highlighter-pen')
    expect(stroke?.opacity).toBe(HIGHLIGHTER_OPACITY)
    expect(HIGHLIGHTER_OPACITY).toBeGreaterThan(0)
    expect(HIGHLIGHTER_OPACITY).toBeLessThan(1)
    expect(stroke?.style).toEqual(style)
    expect(stroke?.points).toHaveLength(3)
  })

  it('previews the whole stroke as one path at the final opacity, so overlapping segments do not darken', () => {
    const tool = createHighlighterTool()
    const { ctx, raw, alphaAtStroke } = makeCtx()
    tool.onPointerDown(ctx, { x: 0, y: 0 }, style)
    tool.onPointerMove(ctx, { x: 20, y: 5 })
    tool.onPointerMove(ctx, { x: 40, y: 10 })
    expect(tool.needsPreviewRedraw).toBe(true)

    tool.renderPreview!(ctx)
    expect(raw.stroke).toHaveBeenCalledTimes(1)
    expect(alphaAtStroke).toEqual([HIGHLIGHTER_OPACITY])
    expect(raw.lineTo).toHaveBeenCalledTimes(2)
  })
})
