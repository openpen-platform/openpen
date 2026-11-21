import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  strokes: [] as unknown[],
  getAllStrokes: vi.fn(),
  removeStrokeById: vi.fn(),
  pushCommand: vi.fn(),
  emit: vi.fn(),
}))

vi.mock('@openpen/module-api/host', () => ({
  getAllStrokes: host.getAllStrokes,
  removeStrokeById: host.removeStrokeById,
  pushCommand: host.pushCommand,
  emit: host.emit,
}))

import type { Point, Stroke } from '@openpen/module-api'
import { createStrokeEraserTool, hitPaintBrush, hitPaintFill, hitStroke } from './stroke-eraser-tool'

const RADIUS = 10
const pt = (x: number, y: number): Point => ({ x, y })

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: 's',
    tool: 'freehand',
    points: [pt(0, 0), pt(100, 0)],
    style: { color: '#000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
    ...overrides,
  }
}

const brush = (overrides: Partial<Stroke> = {}) => stroke({ tool: 'mcp-paint-brush', ...overrides })
const fill = (overrides: Partial<Stroke> = {}) => stroke({ tool: 'mcp-paint-fill', ...overrides })

describe('hitPaintBrush', () => {
  it('hits within eraser radius plus half the numeric width, misses beyond', () => {
    const s = brush({ width: 20 })
    expect(hitPaintBrush(pt(50, 20), s, RADIUS)).toBe(true) // 20 == 10 + 20/2
    expect(hitPaintBrush(pt(50, 20.5), s, RADIUS)).toBe(false)
  })

  it('falls back to style.lineWidth when no width is set', () => {
    const s = brush({ width: undefined })
    expect(hitPaintBrush(pt(50, 12), s, RADIUS)).toBe(true) // 10 + 4/2
    expect(hitPaintBrush(pt(50, 12.5), s, RADIUS)).toBe(false)
  })

  it('uses the width at that spot of a start-to-end ramp', () => {
    const s = brush({ width: { start: 2, end: 30 } })
    // Thin start: reach 10 + 1 + a bit of ramp. Thick end: reach 10 + ~15.
    expect(hitPaintBrush(pt(0, 16), s, RADIUS)).toBe(false)
    expect(hitPaintBrush(pt(100, 16), s, RADIUS)).toBe(true)
    expect(hitPaintBrush(pt(100, 25.5), s, RADIUS)).toBe(false)
  })

  it('follows the smooth curve rather than the straight chords', () => {
    const points = [pt(0, 0), pt(50, 60), pt(100, 0)]
    const plain = brush({ points, width: 2, smooth: false })
    const smooth = brush({ points, width: 2, smooth: true })
    // A spot beside the chord midpoint's bulge: only the smoothed curve passes near it.
    const probe = pt(33.5, 53.4)
    expect(hitPaintBrush(probe, plain, 1)).toBe(false)
    expect(hitPaintBrush(probe, smooth, 1)).toBe(true)
  })

  it('treats a single point as a dot of the stroke width', () => {
    const s = brush({ points: [pt(10, 10)], width: 20 })
    expect(hitPaintBrush(pt(10, 30), s, RADIUS)).toBe(true)
    expect(hitPaintBrush(pt(10, 31), s, RADIUS)).toBe(false)
  })
})

describe('hitPaintFill', () => {
  it('rect: hits inside the box, misses just outside (no eraser radius padding)', () => {
    const s = fill({ shapeType: 'rect', points: [pt(10, 10), pt(110, 60)] })
    expect(hitPaintFill(pt(60, 30), s)).toBe(true)
    expect(hitPaintFill(pt(9, 30), s)).toBe(false)
  })

  it('ellipse: hits at the centre, misses in the box corner', () => {
    const s = fill({ shapeType: 'ellipse', points: [pt(0, 0), pt(100, 60)] })
    expect(hitPaintFill(pt(50, 30), s)).toBe(true)
    expect(hitPaintFill(pt(2, 2), s)).toBe(false)
  })

  it('degenerate box never hits', () => {
    const s = fill({ shapeType: 'rect', points: [pt(10, 10), pt(10, 60)] })
    expect(hitPaintFill(pt(10, 30), s)).toBe(false)
  })

  it('polygon: hits inside, misses outside', () => {
    const s = fill({ shapeType: 'polygon', points: [pt(0, 0), pt(100, 0), pt(50, 80)] })
    expect(hitPaintFill(pt(50, 20), s)).toBe(true)
    expect(hitPaintFill(pt(5, 70), s)).toBe(false)
  })

  it('a hole is not hit, the ring around it is', () => {
    const s = fill({
      shapeType: 'polygon',
      points: [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100)],
      holes: [{ points: [pt(40, 40), pt(60, 40), pt(60, 60), pt(40, 60)] }],
    })
    expect(hitPaintFill(pt(50, 50), s)).toBe(false)
    expect(hitPaintFill(pt(20, 20), s)).toBe(true)
  })
})

describe('hitStroke routing', () => {
  it('sends paint brush and fill strokes to their own tests', () => {
    expect(hitStroke(pt(50, 20), brush({ width: 20 }), RADIUS)).toBe(true)
    expect(hitStroke(pt(50, 20), stroke({ style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' } }), RADIUS)).toBe(false)
    const f = fill({ shapeType: 'rect', points: [pt(10, 10), pt(110, 60)] })
    expect(hitStroke(pt(60, 30), f, RADIUS)).toBe(true)
    expect(hitStroke(pt(60, 70), f, RADIUS)).toBe(false) // outside: padding does not apply to fills
  })
})

describe('createStrokeEraserTool', () => {
  const ctx = {} as never
  const style = {} as never

  beforeEach(() => {
    host.getAllStrokes.mockReset()
    host.removeStrokeById.mockReset().mockReturnValue(true)
    host.pushCommand.mockReset()
    host.emit.mockReset()
  })

  it('removes only the topmost stroke under the pointer and records one undo command', () => {
    const lower = stroke({ id: 'lower' })
    const upper = stroke({ id: 'upper' })
    host.getAllStrokes.mockReturnValue([lower, upper])
    createStrokeEraserTool().onPointerDown!(ctx, pt(50, 0), style)
    expect(host.removeStrokeById).toHaveBeenCalledTimes(1)
    expect(host.removeStrokeById).toHaveBeenCalledWith('upper')
    expect(host.pushCommand).toHaveBeenCalledWith({ type: 'REMOVE_STROKE', stroke: upper })
    expect(host.emit).toHaveBeenCalledWith('canvas-redraw-requested')
  })

  it('does nothing when the pointer is away from every stroke', () => {
    host.getAllStrokes.mockReturnValue([stroke()])
    createStrokeEraserTool().onPointerDown!(ctx, pt(50, 200), style)
    expect(host.removeStrokeById).not.toHaveBeenCalled()
    expect(host.pushCommand).not.toHaveBeenCalled()
  })

  it('skips pixel-eraser strokes and reaches the stroke below them', () => {
    host.getAllStrokes.mockReturnValue([stroke({ id: 'ink' }), stroke({ id: 'wipe', tool: 'eraser' })])
    createStrokeEraserTool().onPointerDown!(ctx, pt(50, 0), style)
    expect(host.removeStrokeById).toHaveBeenCalledWith('ink')
  })

  it('erases while dragging only after the pointer went down, and stops after release', () => {
    host.getAllStrokes.mockReturnValue([stroke({ id: 'a' })])
    const tool = createStrokeEraserTool()
    expect(tool.onPointerMove!(ctx, pt(50, 0))).toBe(false)
    expect(host.removeStrokeById).not.toHaveBeenCalled()

    tool.onPointerDown!(ctx, pt(50, 200), style)
    expect(tool.onPointerMove!(ctx, pt(50, 0))).toBe(true)
    expect(host.removeStrokeById).toHaveBeenCalledWith('a')

    tool.onPointerUp!(ctx, pt(50, 0))
    host.removeStrokeById.mockClear()
    expect(tool.onPointerMove!(ctx, pt(50, 0))).toBe(false)
    expect(host.removeStrokeById).not.toHaveBeenCalled()
  })

  it('records no command when the store refuses the removal', () => {
    host.getAllStrokes.mockReturnValue([stroke({ id: 'a' })])
    host.removeStrokeById.mockReturnValue(false)
    createStrokeEraserTool().onPointerDown!(ctx, pt(50, 0), style)
    expect(host.pushCommand).not.toHaveBeenCalled()
    expect(host.emit).not.toHaveBeenCalled()
  })
})
