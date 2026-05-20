import { describe, it, expect, vi } from 'vitest'
import { resolveEnd, createLineTool } from '../line-tool'
import type { Point, StrokeStyle } from '@openpen/module-api'

function pt(x: number, y: number): Point {
  return { x, y }
}

const baseStyle: StrokeStyle = {
  color: '#ff0000',
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
// resolveEnd
// ---------------------------------------------------------------------------

describe('resolveEnd', () => {
  const start = pt(0, 0)

  it('shiftKey=false returns point unchanged', () => {
    const p = pt(30, 40)
    const result = resolveEnd(start, p, false)
    expect(result).toEqual({ x: 30, y: 40 })
  })

  it('shiftKey=true, dx=0 dy=0 (degenerate) returns point unchanged', () => {
    const p = pt(0, 0)
    const result = resolveEnd(start, p, true)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('shiftKey=true at ~20 deg snaps to 0 deg (horizontal)', () => {
    // 20° rounds to 0 × 45° because Math.round(20/45) = Math.round(0.44) = 0
    const d = 100
    const angle = (20 * Math.PI) / 180
    const p = pt(d * Math.cos(angle), d * Math.sin(angle))
    const result = resolveEnd(start, p, true)
    // Snapped to 0°: y should be ~0, x should be ~original distance
    expect(result.y).toBeCloseTo(0, 3)
    expect(result.x).toBeCloseTo(d, 3)
  })

  it('shiftKey=true at ~60 deg snaps to 45 deg (dx ≈ dy)', () => {
    const d = 100
    const angle = (60 * Math.PI) / 180
    const p = pt(d * Math.cos(angle), d * Math.sin(angle))
    const result = resolveEnd(start, p, true)
    // Snapped to 45°: dx ≈ dy
    expect(Math.abs(result.x)).toBeCloseTo(Math.abs(result.y), 3)
    // Distance preserved
    expect(Math.hypot(result.x - start.x, result.y - start.y)).toBeCloseTo(d, 3)
  })

  it('shiftKey=true at ~80 deg snaps to 90 deg (vertical)', () => {
    const d = 100
    const angle = (80 * Math.PI) / 180
    const p = pt(d * Math.cos(angle), d * Math.sin(angle))
    const result = resolveEnd(start, p, true)
    expect(result.x).toBeCloseTo(start.x, 3)
    expect(Math.hypot(result.x - start.x, result.y - start.y)).toBeCloseTo(d, 3)
  })

  it('shiftKey=true at ~135 deg snaps to 135 deg exactly', () => {
    const d = 50
    const angle = (135 * Math.PI) / 180
    const p = pt(d * Math.cos(angle), d * Math.sin(angle))
    const result = resolveEnd(start, p, true)
    const resultAngle = Math.atan2(result.y - start.y, result.x - start.x)
    expect(resultAngle).toBeCloseTo(angle, 3)
    expect(Math.hypot(result.x - start.x, result.y - start.y)).toBeCloseTo(d, 3)
  })

  it('shiftKey=true at ~180 deg snaps to 180 deg (negative horizontal)', () => {
    const d = 80
    const angle = Math.PI
    const p = pt(start.x + d * Math.cos(angle), start.y + d * Math.sin(angle))
    const result = resolveEnd(start, p, true)
    expect(result.y).toBeCloseTo(start.y, 3)
    expect(result.x).toBeCloseTo(start.x - d, 3)
    expect(Math.hypot(result.x - start.x, result.y - start.y)).toBeCloseTo(d, 3)
  })

  it('magnitude is preserved for all snap angles (general check)', () => {
    const angles = [15, 30, 45, 60, 75, 90, 120, 135, 150, 165, 180]
    const d = 60
    for (const deg of angles) {
      const rad = (deg * Math.PI) / 180
      const p = pt(d * Math.cos(rad), d * Math.sin(rad))
      const result = resolveEnd(start, p, true)
      expect(Math.hypot(result.x - start.x, result.y - start.y)).toBeCloseTo(d, 3)
    }
  })
})

// ---------------------------------------------------------------------------
// createLineTool — factory behavior
// ---------------------------------------------------------------------------

describe('createLineTool', () => {
  it('onPointerDown then onPointerUp without shift produces stroke with correct shape', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    const start = pt(10, 20)
    const end = pt(80, 90)
    tool.onPointerDown!(ctx, start, baseStyle)
    const stroke = tool.onPointerUp!(ctx, end, {})
    expect(stroke).not.toBeNull()
    expect(stroke!.tool).toBe('line')
    expect(stroke!.points).toHaveLength(2)
    expect(stroke!.points[0]).toEqual(start)
    expect(stroke!.points[1]).toEqual(end)
  })

  it('onPointerUp without prior onPointerDown returns null', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    const result = tool.onPointerUp!(ctx, pt(5, 5), {})
    expect(result).toBeNull()
  })

  it('style is copied from the style at onPointerDown', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(10, 10), {})
    expect(stroke!.style.color).toBe('#ff0000')
    expect(stroke!.style.lineWidth).toBe(2)
  })

  it('onPointerUp with shift snaps end angle to nearest 45°', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    const start = pt(0, 0)
    // 80° angle — should snap to 90°
    const d = 100
    const angle = (80 * Math.PI) / 180
    const rawEnd = pt(d * Math.cos(angle), d * Math.sin(angle))
    tool.onPointerDown!(ctx, start, baseStyle)
    const stroke = tool.onPointerUp!(ctx, rawEnd, { shiftKey: true })
    const snappedEnd = stroke!.points[1]
    // Snapped to 90°: x should be ~start.x
    expect(snappedEnd.x).toBeCloseTo(start.x, 3)
  })

  it('internal state is cleared after onPointerUp (second up returns null)', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    tool.onPointerUp!(ctx, pt(10, 10), {})
    // No new onPointerDown — state was cleared
    const second = tool.onPointerUp!(ctx, pt(20, 20), {})
    expect(second).toBeNull()
  })

  it('stroke id is a non-empty string (UUID)', () => {
    const tool = createLineTool()
    const ctx = makeMockCtx()
    tool.onPointerDown!(ctx, pt(0, 0), baseStyle)
    const stroke = tool.onPointerUp!(ctx, pt(5, 5), {})
    expect(typeof stroke!.id).toBe('string')
    expect(stroke!.id.length).toBeGreaterThan(0)
  })
})
