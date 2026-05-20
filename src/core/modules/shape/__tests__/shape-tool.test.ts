import { describe, it, expect, vi } from 'vitest'

// Mock resolveColorStyle so drawShape can run without the host color system.
// Plain hex string colors are returned unchanged.
vi.mock('@openpen/module-api/host', () => ({
  resolveColorStyle: vi.fn((ctx: unknown, color: unknown) => {
    void ctx
    return typeof color === 'string' ? color : (color as { from: string }).from
  }),
}))

import { createShapeTool, renderShapeStroke } from '../shape-tool'
import type { Point, StrokeStyle } from '@openpen/module-api'

function pt(x: number, y: number): Point {
  return { x, y }
}

const baseStyle: StrokeStyle = {
  color: '#0000ff',
  lineWidth: 2,
  lineCap: 'round',
  lineJoin: 'round',
}

function makeMockCtx() {
  return {
    save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), fill: vi.fn(),
    arc: vi.fn(), rect: vi.fn(),
    roundRect: vi.fn(), ellipse: vi.fn(),
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 0, lineCap: 'butt' as CanvasLineCap, lineJoin: 'miter' as CanvasLineJoin,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

// ---------------------------------------------------------------------------
// createShapeTool — factory behavior
// ---------------------------------------------------------------------------

describe('createShapeTool', () => {
  it('kind=rect: produces stroke with shapeType=rect and correct metadata', () => {
    const tool = createShapeTool({ kind: 'rect', filled: false })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(50, 80))
    expect(stroke).not.toBeNull()
    expect(stroke!.tool).toBe('shape')
    expect(stroke!.shapeType).toBe('rect')
    expect(stroke!.filled).toBe(false)
    expect(stroke!.points).toHaveLength(2)
    expect(stroke!.points[0]).toEqual(pt(0, 0))
    expect(stroke!.points[1]).toEqual(pt(50, 80))
  })

  it('kind=square: produces stroke with shapeType=square', () => {
    const tool = createShapeTool({ kind: 'square', filled: true })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(10, 10), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(40, 40))
    expect(stroke!.shapeType).toBe('square')
    expect(stroke!.filled).toBe(true)
  })

  it('kind=circle: produces stroke with shapeType=circle', () => {
    const tool = createShapeTool({ kind: 'circle', filled: false })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(30, 30))
    expect(stroke!.shapeType).toBe('circle')
  })

  it('kind=roundrect: produces stroke with shapeType=roundrect', () => {
    const tool = createShapeTool({ kind: 'roundrect', filled: false })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(60, 40))
    expect(stroke!.shapeType).toBe('roundrect')
  })

  it('filled=true is preserved in produced stroke', () => {
    const tool = createShapeTool({ kind: 'rect', filled: true })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(100, 100))
    expect(stroke!.filled).toBe(true)
  })

  it('style from onPointerDown is copied into stroke', () => {
    const tool = createShapeTool({ kind: 'rect', filled: false })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(50, 50))
    expect(stroke!.style.color).toBe('#0000ff')
    expect(stroke!.style.lineWidth).toBe(2)
  })

  it('onPointerUp without prior onPointerDown returns null', () => {
    const tool = createShapeTool()
    const ctx = makeMockCtx()
    const result = tool.onPointerUp!(ctx, pt(10, 10))
    expect(result).toBeNull()
  })

  it('internal state cleared after onPointerUp (second up returns null)', () => {
    const tool = createShapeTool({ kind: 'rect' })
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    tool.onPointerUp!(ctx, pt(30, 30))
    const second = tool.onPointerUp!(ctx, pt(50, 50))
    expect(second).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// drawShape geometry — verified via ctx spy calls
// ---------------------------------------------------------------------------

describe('drawShape (via renderShapeStroke)', () => {
  it('kind=square with rect 10×20: ctx.rect called with size=10 (Math.min)', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(10, 20)],
      style: baseStyle,
      shapeType: 'square',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    // rect should be called with (x, y, size, size) where size = Math.min(10, 20) = 10
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 10, 10)
  })

  it('kind=circle with rect 10×20: ctx.arc called with radius=5 (Math.min(w,h)/2)', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(10, 20)],
      style: baseStyle,
      shapeType: 'circle',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    // arc: (cx, cy, r, 0, 2PI) — r = Math.min(10,20)/2 = 5, center at (0+5, 0+5)
    expect(ctx.arc).toHaveBeenCalledWith(5, 5, 5, 0, Math.PI * 2)
  })

  it('kind=rect: ctx.rect called with full width and height', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(30, 40)],
      style: baseStyle,
      shapeType: 'rect',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 30, 40)
  })

  it('degenerate w=0 h=0: no draw calls (ctx.stroke/fill not called)', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(5, 5), pt(5, 5)],
      style: baseStyle,
      shapeType: 'rect',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('filled=true calls ctx.fill, not ctx.stroke', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(50, 50)],
      style: baseStyle,
      shapeType: 'rect',
      filled: true,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('filled=false calls ctx.stroke, not ctx.fill', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(50, 50)],
      style: baseStyle,
      shapeType: 'rect',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('kind=ellipse: ctx.ellipse called once, no closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(20, 10)],
      style: baseStyle,
      shapeType: 'ellipse',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.ellipse).toHaveBeenCalledTimes(1)
    expect(ctx.closePath).not.toHaveBeenCalled()
  })

  it('kind=triangle: moveTo×1 + lineTo×2 + closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(20, 30)],
      style: baseStyle,
      shapeType: 'triangle',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('kind=triangle-down: moveTo×1 + lineTo×2 + closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(20, 30)],
      style: baseStyle,
      shapeType: 'triangle-down',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('kind=diamond: moveTo×1 + lineTo×3 + closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(20, 30)],
      style: baseStyle,
      shapeType: 'diamond',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(3)
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('kind=parallelogram: moveTo×1 + lineTo×3 + closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(20, 30)],
      style: baseStyle,
      shapeType: 'parallelogram',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(3)
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('kind=star: moveTo×1 + lineTo×9 + closePath', () => {
    const ctx = makeMockCtx()
    const stroke = {
      id: 'x', tool: 'shape' as const,
      points: [pt(0, 0), pt(40, 40)],
      style: baseStyle,
      shapeType: 'star',
      filled: false,
    }
    renderShapeStroke(ctx, stroke)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(9)
    expect(ctx.closePath).toHaveBeenCalled()
  })
})
