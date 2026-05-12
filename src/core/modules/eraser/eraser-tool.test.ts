import { describe, it, expect, vi } from 'vitest'
import { createEraserTool } from './eraser-tool'
import type { Point, StrokeStyle } from '@openpen/module-api'

function pt(x: number, y: number): Point {
  return { x, y }
}

const baseStyle: StrokeStyle = {
  color: '#000000',
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
    roundRect: vi.fn(),
    strokeStyle: '', fillStyle: '',
    lineWidth: 0, lineCap: 'butt' as CanvasLineCap, lineJoin: 'miter' as CanvasLineJoin,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

// ---------------------------------------------------------------------------
// createEraserTool — factory behavior
// ---------------------------------------------------------------------------

describe('createEraserTool', () => {
  describe('brush sizing on onPointerDown', () => {
    it('lineWidth=1 → effective lineWidth=6 (max(6, 1*2))', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), { ...baseStyle, lineWidth: 1 })
      const stroke = tool.onPointerUp!(ctx, pt(0, 0))
      expect(stroke!.style.lineWidth).toBe(6)
    })

    it('lineWidth=3 → effective lineWidth=6 (max(6, 3*2)=6)', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), { ...baseStyle, lineWidth: 3 })
      const stroke = tool.onPointerUp!(ctx, pt(0, 0))
      expect(stroke!.style.lineWidth).toBe(6)
    })

    it('lineWidth=10 → effective lineWidth=20 (max(6, 10*2)=20)', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), { ...baseStyle, lineWidth: 10 })
      const stroke = tool.onPointerUp!(ctx, pt(0, 0))
      expect(stroke!.style.lineWidth).toBe(20)
    })
  })

  describe('onPointerMove deduplication', () => {
    it('same x,y as last point → point NOT appended', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(10, 10), baseStyle)
      // Move to same position twice — should not append
      tool.onPointerMove!(ctx, pt(10, 10))
      tool.onPointerMove!(ctx, pt(10, 10))
      const stroke = tool.onPointerUp!(ctx, pt(10, 10))
      // onPointerDown added pt(10,10). onPointerMove with same pos did not add.
      // onPointerUp: last.x===point.x && last.y===point.y → does not add.
      expect(stroke!.points).toHaveLength(1)
    })

    it('different point → appended', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
      tool.onPointerMove!(ctx, pt(10, 0))
      tool.onPointerMove!(ctx, pt(20, 0))
      const stroke = tool.onPointerUp!(ctx, pt(30, 0))
      // down(0,0) + move(10,0) + move(20,0) + up(30,0 — different from last 20,0)
      expect(stroke!.points).toHaveLength(4)
    })
  })

  describe('onPointerUp', () => {
    it('produces stroke with tool=eraser', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
      const stroke = tool.onPointerUp!(ctx, pt(10, 10))
      expect(stroke).not.toBeNull()
      expect(stroke!.tool).toBe('eraser')
    })

    it('produces stroke containing all distinct points in order', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
      tool.onPointerMove!(ctx, pt(5, 0))
      tool.onPointerMove!(ctx, pt(10, 0))
      const stroke = tool.onPointerUp!(ctx, pt(15, 0))
      expect(stroke!.points[0]).toEqual(pt(0, 0))
      expect(stroke!.points[1]).toEqual(pt(5, 0))
      expect(stroke!.points[2]).toEqual(pt(10, 0))
      expect(stroke!.points[3]).toEqual(pt(15, 0))
    })

    it('returns null without prior onPointerDown', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      const result = tool.onPointerUp!(ctx, pt(10, 10))
      expect(result).toBeNull()
    })

    it('internal state cleared after onPointerUp (second up returns null)', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
      tool.onPointerUp!(ctx, pt(10, 10))
      const second = tool.onPointerUp!(ctx, pt(20, 20))
      expect(second).toBeNull()
    })
  })

  describe('stroke style', () => {
    it('lineCap and lineJoin are always round', () => {
      const tool = createEraserTool()
      const ctx = makeMockCtx()
      tool.onPointerDown!(ctx, pt(0, 0), { ...baseStyle, lineCap: 'butt', lineJoin: 'miter' })
      const stroke = tool.onPointerUp!(ctx, pt(5, 5))
      expect(stroke!.style.lineCap).toBe('round')
      expect(stroke!.style.lineJoin).toBe('round')
    })
  })
})
