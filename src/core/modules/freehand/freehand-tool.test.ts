import { describe, it, expect, vi } from 'vitest'
import { createFreehandTool } from './freehand-tool'
import type { Point, StrokeStyle } from '@openpen/module-api'

function pt(x: number, y: number): Point {
  return { x, y }
}

const baseStyle: StrokeStyle = {
  color: '#ff0000',
  lineWidth: 3,
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
    roundRect: vi.fn(),
    strokeStyle: '', fillStyle: '',
    lineWidth: 0, lineCap: 'butt' as CanvasLineCap, lineJoin: 'miter' as CanvasLineJoin,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

// ---------------------------------------------------------------------------
// createFreehandTool — factory behavior
// ---------------------------------------------------------------------------

describe('createFreehandTool', () => {
  it('full sequence: down + 3 moves + up produces stroke with 5 points in order', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    const p0 = pt(0, 0)
    const p1 = pt(10, 5)
    const p2 = pt(20, 10)
    const p3 = pt(30, 5)
    const p4 = pt(40, 0)

    tool.onPointerDown!(ctx, p0, baseStyle)
    tool.onPointerMove!(ctx, p1)
    tool.onPointerMove!(ctx, p2)
    tool.onPointerMove!(ctx, p3)
    const stroke = tool.onPointerUp!(ctx, p4)

    expect(stroke).not.toBeNull()
    expect(stroke!.points).toHaveLength(5)
    expect(stroke!.points[0]).toEqual(p0)
    expect(stroke!.points[1]).toEqual(p1)
    expect(stroke!.points[2]).toEqual(p2)
    expect(stroke!.points[3]).toEqual(p3)
    expect(stroke!.points[4]).toEqual(p4)
  })

  it('stroke has tool=freehand', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(10, 10))
    expect(stroke!.tool).toBe('freehand')
  })

  it('stroke style matches the style passed at onPointerDown', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(10, 10))
    expect(stroke!.style.color).toBe('#ff0000')
    expect(stroke!.style.lineWidth).toBe(3)
    expect(stroke!.style.lineCap).toBe('round')
  })

  it('onPointerUp without prior onPointerDown returns null', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    const result = tool.onPointerUp!(ctx, pt(10, 10))
    expect(result).toBeNull()
  })

  it('internal state cleared after onPointerUp (second up returns null)', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    tool.onPointerUp!(ctx, pt(10, 10))
    const second = tool.onPointerUp!(ctx, pt(20, 20))
    expect(second).toBeNull()
  })

  it('onPointerMove without prior onPointerDown does nothing (guard)', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    // Should not throw, ctx methods should not be called
    tool.onPointerMove!(ctx, pt(5, 5))
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('stroke id is a non-empty string', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(5, 5))
    expect(typeof stroke!.id).toBe('string')
    expect(stroke!.id.length).toBeGreaterThan(0)
  })

  it('onPointerMove draws a line segment on ctx for each move', () => {
    const tool = createFreehandTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    tool.onPointerMove!(ctx, pt(10, 10))
    tool.onPointerMove!(ctx, pt(20, 20))
    // Two moves → two beginPath calls
    expect(ctx.beginPath).toHaveBeenCalledTimes(2)
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })
})
