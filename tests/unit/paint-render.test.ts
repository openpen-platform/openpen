/**
 * Unit tests for T240 overlay paint renderer (src/services/paint-render.ts)
 * and host built-in renderer precedence in CanvasEngine.
 *
 * Expected exported API of src/services/paint-render.ts (per build-plan.md):
 * - PAINT_BRUSH_TOOL_ID = 'mcp-paint-brush'
 * - PAINT_FILL_TOOL_ID = 'mcp-paint-fill'
 * - renderPaintBrush(ctx: CanvasRenderingContext2D, stroke: Stroke): void
 * - renderPaintFill(ctx: CanvasRenderingContext2D, stroke: Stroke): void
 *
 * Expected Stroke storage keys (per build-plan.md <Interfaces>):
 * - tool: 'mcp-paint-brush' | 'mcp-paint-fill'
 * - points: Point[] in overlay CSS pixels
 * - style: { color, lineWidth, lineCap, lineJoin }
 * - extra keys: smooth, width (number | { start, end }), opacity, opacityRange ({ start, end }),
 *   hardness (0..1), holes (Array<{ points, smooth? }>), shapeType ('polygon' | 'rect' | 'ellipse')
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PAINT_BRUSH_TOOL_ID,
  PAINT_FILL_TOOL_ID,
  renderPaintBrush,
  renderPaintFill,
} from '../../src/services/paint-render'
import { CanvasEngine } from '../../src/services/canvas-engine'
import { addStroke, clearAll, resetHistory } from '../../src/services/stroke-store'
import { registerContribution, resetContributionStore } from '../../src/core/runtime/contribution-store'
import type { Point, Stroke } from '@openpen/module-api'

type PathOp =
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'bezierCurveTo'; p0: Point; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { op: 'rect'; x: number; y: number; width: number; height: number }
  | { op: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number }
  | { op: 'closePath' }

interface DrawCall {
  kind: 'stroke' | 'fill'
  fillRule?: CanvasFillRule
  lineWidth: number
  globalAlpha: number
  strokeStyle: unknown
  fillStyle: unknown
  shadowBlur: number
  shadowColor: string
  filter: string
  ops: PathOp[]
}

interface CtxState {
  globalAlpha: number
  lineWidth: number
  strokeStyle: unknown
  fillStyle: unknown
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  shadowBlur: number
  shadowColor: string
  filter: string
}

function makeRecordingCtx() {
  const stack: CtxState[] = []
  let currentOps: PathOp[] = []
  let cursor: Point = { x: 0, y: 0 }
  const draws: DrawCall[] = []

  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '#000000' as unknown,
    fillStyle: '#000000' as unknown,
    lineCap: 'round' as CanvasLineCap,
    lineJoin: 'round' as CanvasLineJoin,
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    filter: 'none',

    save: vi.fn(() => {
      stack.push({
        globalAlpha: ctx.globalAlpha,
        lineWidth: ctx.lineWidth,
        strokeStyle: ctx.strokeStyle,
        fillStyle: ctx.fillStyle,
        lineCap: ctx.lineCap,
        lineJoin: ctx.lineJoin,
        shadowBlur: ctx.shadowBlur,
        shadowColor: ctx.shadowColor,
        filter: ctx.filter,
      })
    }),
    restore: vi.fn(() => {
      const prev = stack.pop()
      if (prev) Object.assign(ctx, prev)
    }),
    beginPath: vi.fn(() => {
      currentOps = []
    }),
    moveTo: vi.fn((x: number, y: number) => {
      cursor = { x, y }
      currentOps.push({ op: 'moveTo', x, y })
    }),
    lineTo: vi.fn((x: number, y: number) => {
      cursor = { x, y }
      currentOps.push({ op: 'lineTo', x, y })
    }),
    bezierCurveTo: vi.fn((cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
      const p0 = { ...cursor }
      cursor = { x, y }
      currentOps.push({ op: 'bezierCurveTo', p0, cp1x, cp1y, cp2x, cp2y, x, y })
    }),
    rect: vi.fn((x: number, y: number, width: number, height: number) => {
      currentOps.push({ op: 'rect', x, y, width, height })
    }),
    ellipse: vi.fn((x: number, y: number, radiusX: number, radiusY: number) => {
      currentOps.push({ op: 'ellipse', x, y, radiusX, radiusY })
    }),
    closePath: vi.fn(() => {
      currentOps.push({ op: 'closePath' })
    }),
    stroke: vi.fn(() => {
      draws.push({
        kind: 'stroke',
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
        strokeStyle: ctx.strokeStyle,
        fillStyle: ctx.fillStyle,
        shadowBlur: ctx.shadowBlur,
        shadowColor: ctx.shadowColor,
        filter: ctx.filter,
        ops: [...currentOps],
      })
    }),
    fill: vi.fn((fillRule?: CanvasFillRule) => {
      draws.push({
        kind: 'fill',
        fillRule: typeof fillRule === 'string' ? fillRule : undefined,
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
        strokeStyle: ctx.strokeStyle,
        fillStyle: ctx.fillStyle,
        shadowBlur: ctx.shadowBlur,
        shadowColor: ctx.shadowColor,
        filter: ctx.filter,
        ops: [...currentOps],
      })
    }),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  }

  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, draws }
}

function unitVec(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy)
  expect(len, 'tangent vector must be non-zero').toBeGreaterThan(1e-6)
  return { x: dx / len, y: dy / len }
}

function makeBrushStroke(points: Point[], extra: Record<string, unknown> = {}): Stroke {
  return {
    id: 'brush-1',
    tool: PAINT_BRUSH_TOOL_ID,
    points,
    style: { color: '#ff3366', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
    ...extra,
  } as Stroke
}

function makeFillStroke(points: Point[], extra: Record<string, unknown> = {}): Stroke {
  return {
    id: 'fill-1',
    tool: PAINT_FILL_TOOL_ID,
    points,
    style: { color: '#22aa44', lineWidth: 1, lineCap: 'round', lineJoin: 'round' },
    ...extra,
  } as Stroke
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }))
  clearAll()
  resetHistory()
  resetContributionStore()
})

describe('T240 AC-1 smooth curve brush rendering', () => {
  it('T240 AC-1: smooth brush stroke draws cubic curves passing through every control point with continuous tangents at interior points', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]
    const { ctx, draws } = makeRecordingCtx()
    renderPaintBrush(ctx, makeBrushStroke(pts, { smooth: true, width: 4, opacity: 1, hardness: 1 }))

    const strokes = draws.filter((d) => d.kind === 'stroke')
    expect(strokes.length).toBeGreaterThanOrEqual(1)

    const beziers = strokes.flatMap((d) => d.ops).filter((op) => op.op === 'bezierCurveTo')
    expect(beziers.length).toBeGreaterThanOrEqual(pts.length - 1)

    // Curve starts at P0 and passes through every control point P1..P3 in order.
    expect(beziers[0].p0.x).toBeCloseTo(pts[0].x, 4)
    expect(beziers[0].p0.y).toBeCloseTo(pts[0].y, 4)
    const hitIndices: number[] = []
    for (let i = 1; i < pts.length; i++) {
      const idx = beziers.findIndex(
        (b, k) => k >= (hitIndices[hitIndices.length - 1] ?? -1) + 1 &&
          Math.abs(b.x - pts[i].x) < 1e-3 &&
          Math.abs(b.y - pts[i].y) < 1e-3,
      )
      expect(idx, `curve passes through control point P${i}`).toBeGreaterThanOrEqual(0)
      hitIndices.push(idx)
    }

    // Tangent continuity (C1 direction) at every interior control point (P1 and P2).
    for (let i = 1; i < pts.length - 1; i++) {
      const segIn = beziers[hitIndices[i - 1]]
      const segOut = beziers[hitIndices[i - 1] + 1]
      expect(segOut, `outgoing segment after P${i}`).toBeDefined()
      expect(segOut.p0.x).toBeCloseTo(pts[i].x, 4)
      expect(segOut.p0.y).toBeCloseTo(pts[i].y, 4)

      const uIn = unitVec(segIn.x - segIn.cp2x, segIn.y - segIn.cp2y)
      const uOut = unitVec(segOut.cp1x - segOut.p0.x, segOut.cp1y - segOut.p0.y)
      const dot = uIn.x * uOut.x + uIn.y * uOut.y
      const cross = Math.abs(uIn.x * uOut.y - uIn.y * uOut.x)
      expect(dot, `C1 tangent alignment at P${i}`).toBeGreaterThan(0.999)
      expect(cross, `no corner kink at P${i}`).toBeLessThan(1e-3)
    }

    // At the 90-degree corner P1=(100,0), the smoothed tangent must bend diagonally rather than staying purely horizontal.
    const segIntoP1 = beziers[hitIndices[0]]
    const uP1 = unitVec(segIntoP1.x - segIntoP1.cp2x, segIntoP1.y - segIntoP1.cp2y)
    expect(Math.abs(uP1.x)).toBeGreaterThan(0.1)
    expect(Math.abs(uP1.y)).toBeGreaterThan(0.1)
  })

  it('T240 AC-1: brush stroke with smooth false draws straight polyline segments without Bezier smoothing', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]
    const { ctx, draws } = makeRecordingCtx()
    renderPaintBrush(ctx, makeBrushStroke(pts, { smooth: false, width: 4, opacity: 1, hardness: 1 }))

    const strokes = draws.filter((d) => d.kind === 'stroke')
    expect(strokes).toHaveLength(1)
    const ops = strokes[0].ops
    expect(ops.filter((op) => op.op === 'bezierCurveTo')).toHaveLength(0)
    expect(ops.filter((op) => op.op === 'moveTo')).toEqual([{ op: 'moveTo', x: 0, y: 0 }])
    expect(ops.filter((op) => op.op === 'lineTo')).toEqual([
      { op: 'lineTo', x: 100, y: 0 },
      { op: 'lineTo', x: 100, y: 100 },
      { op: 'lineTo', x: 200, y: 100 },
    ])
  })

  it('T240 AC-1 regression: smooth brush with adjacent duplicate points and smooth closed fill with repeated endpoint keep continuous tangents without corners', () => {
    // Open smooth brush with adjacent duplicate point at the turn B=(100, 0).
    const openPts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    const brushRec = makeRecordingCtx()
    renderPaintBrush(brushRec.ctx, makeBrushStroke(openPts, { smooth: true, width: 4, opacity: 1, hardness: 1 }))
    const openBeziers = brushRec.draws
      .filter((d) => d.kind === 'stroke')
      .flatMap((d) => d.ops)
      .filter((op): op is Extract<PathOp, { op: 'bezierCurveTo' }> =>
        op.op === 'bezierCurveTo' && Math.hypot(op.x - op.p0.x, op.y - op.p0.y) > 1e-6,
      )
    expect(openBeziers.length).toBeGreaterThanOrEqual(2)

    const intoB = openBeziers.find((b) => Math.abs(b.x - 100) < 1e-3 && Math.abs(b.y - 0) < 1e-3)
    const outOfB = openBeziers.find((b) => Math.abs(b.p0.x - 100) < 1e-3 && Math.abs(b.p0.y - 0) < 1e-3)
    expect(intoB, 'segment entering duplicate vertex B').toBeDefined()
    expect(outOfB, 'segment leaving duplicate vertex B').toBeDefined()
    const uInOpen = unitVec(intoB!.x - intoB!.cp2x, intoB!.y - intoB!.cp2y)
    const uOutOpen = unitVec(outOfB!.cp1x - outOfB!.p0.x, outOfB!.cp1y - outOfB!.p0.y)
    expect(uInOpen.x * uOutOpen.x + uInOpen.y * uOutOpen.y, 'C1 tangent continuity across duplicate point B').toBeGreaterThan(0.999)
    expect(Math.abs(uInOpen.x * uOutOpen.y - uInOpen.y * uOutOpen.x), 'no corner kink at duplicate point B').toBeLessThan(1e-3)

    // Closed smooth polygon whose last point repeats the first point P0=(0, 0).
    const closedPts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ]
    const fillRec = makeRecordingCtx()
    renderPaintFill(fillRec.ctx, makeFillStroke(closedPts, { shapeType: 'polygon', smooth: true, opacity: 1, hardness: 1 }))
    const closedBeziers = fillRec.draws
      .filter((d) => d.kind === 'fill')
      .flatMap((d) => d.ops)
      .filter((op): op is Extract<PathOp, { op: 'bezierCurveTo' }> =>
        op.op === 'bezierCurveTo' && Math.hypot(op.x - op.p0.x, op.y - op.p0.y) > 1e-6,
      )
    expect(closedBeziers.length).toBeGreaterThanOrEqual(4)

    const firstSeg = closedBeziers[0]
    const lastSeg = closedBeziers[closedBeziers.length - 1]
    expect(lastSeg.x).toBeCloseTo(firstSeg.p0.x, 4)
    expect(lastSeg.y).toBeCloseTo(firstSeg.p0.y, 4)
    const uInClosed = unitVec(lastSeg.x - lastSeg.cp2x, lastSeg.y - lastSeg.cp2y)
    const uOutClosed = unitVec(firstSeg.cp1x - firstSeg.p0.x, firstSeg.cp1y - firstSeg.p0.y)
    expect(uInClosed.x * uOutClosed.x + uInClosed.y * uOutClosed.y, 'C1 wrap-around tangent continuity at repeated P0').toBeGreaterThan(0.999)
    expect(Math.abs(uInClosed.x * uOutClosed.y - uInClosed.y * uOutClosed.x), 'no corner kink at repeated P0').toBeLessThan(1e-3)
  })
})

describe('T240 AC-2 brush color, width/opacity taper, and soft edge (hardness)', () => {
  it('T240 AC-2: brush stroke applies color and tapers lineWidth and globalAlpha monotonically from start to end', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ]
    const { ctx, raw, draws } = makeRecordingCtx()
    renderPaintBrush(ctx, makeBrushStroke(pts, {
      smooth: false,
      width: { start: 2, end: 20 },
      opacityRange: { start: 0.2, end: 0.9 },
      hardness: 1,
    }))

    const strokes = draws.filter((d) => d.kind === 'stroke')
    expect(strokes.length).toBeGreaterThanOrEqual(2)
    for (const s of strokes) {
      expect(s.strokeStyle).toBe('#ff3366')
    }

    const widths = strokes.map((s) => s.lineWidth)
    const alphas = strokes.map((s) => s.globalAlpha)

    // Non-decreasing taper spanning from near start to near end.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] - 1e-6)
      expect(alphas[i]).toBeGreaterThanOrEqual(alphas[i - 1] - 1e-6)
    }
    expect(widths[0]).toBeGreaterThanOrEqual(2 - 1e-3)
    expect(widths[0]).toBeLessThan(8)
    expect(widths[widths.length - 1]).toBeGreaterThan(14)
    expect(widths[widths.length - 1]).toBeLessThanOrEqual(20 + 1e-3)

    expect(alphas[0]).toBeGreaterThanOrEqual(0.2 - 1e-3)
    expect(alphas[0]).toBeLessThan(0.5)
    expect(alphas[alphas.length - 1]).toBeGreaterThan(0.65)
    expect(alphas[alphas.length - 1]).toBeLessThanOrEqual(0.9 + 1e-3)

    // Context state restored cleanly.
    expect(raw.globalAlpha).toBe(1)
  })

  it('T240 AC-2: hardness below 1 produces a soft-edge effect without leaking ctx state, and CanvasEngine resolves mcp-paint-brush ahead of plugin renderers', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 120, y: 0 }]

    const hard = makeRecordingCtx()
    renderPaintBrush(hard.ctx, makeBrushStroke(pts, {
      style: { color: '#0066ff', lineWidth: 10, lineCap: 'round', lineJoin: 'round' },
      width: 10,
      opacity: 0.8,
      hardness: 1,
    }))
    const hardDraws = hard.draws.filter((d) => d.kind === 'stroke')
    expect(hardDraws.length).toBeGreaterThanOrEqual(1)
    expect(hardDraws[0].strokeStyle).toBe('#0066ff')
    expect(hardDraws[0].lineWidth).toBeCloseTo(10, 4)
    expect(hardDraws[0].globalAlpha).toBeCloseTo(0.8, 4)
    expect(hardDraws.every((d) => d.shadowBlur === 0)).toBe(true)

    const soft = makeRecordingCtx()
    renderPaintBrush(soft.ctx, makeBrushStroke(pts, {
      style: { color: '#0066ff', lineWidth: 10, lineCap: 'round', lineJoin: 'round' },
      width: 10,
      opacity: 0.8,
      hardness: 0.2,
    }))
    const softDraws = soft.draws.filter((d) => d.kind === 'stroke')
    expect(softDraws.length).toBeGreaterThanOrEqual(1)

    // Accept any of the three soft-edge strategies documented in build-plan Risks:
    // shadowBlur, CSS blur filter, or multi-pass translucent strokes with varying widths
    // (without requiring widths to exceed the requested stroke width).
    const distinctWidths = new Set(softDraws.map((d) => Math.round(d.lineWidth * 1000) / 1000))
    const usesShadowBlur = softDraws.some((d) => d.shadowBlur > 0)
    const usesBlurFilter = softDraws.some((d) => /blur\(/i.test(d.filter))
    const usesMultiPassFeather =
      softDraws.length > hardDraws.length &&
      softDraws.filter((d) => d.globalAlpha < 1).length >= 2 &&
      distinctWidths.size >= 2
    expect(usesShadowBlur || usesBlurFilter || usesMultiPassFeather, 'soft-edge effect applied').toBe(true)

    // No ctx state leak after rendering.
    expect(soft.raw.globalAlpha).toBe(1)
    expect(soft.raw.shadowBlur).toBe(0)
    expect(soft.raw.filter).toBe('none')

    // Host built-in renderer takes precedence over a plugin registering the same tool id.
    const engineCtx = makeRecordingCtx()
    const canvas = document.createElement('canvas')
    canvas.getContext = (() => engineCtx.ctx) as unknown as typeof canvas.getContext
    const engine = new CanvasEngine(canvas)
    const hijacker = vi.fn()
    registerContribution('canvas.tools', 'rogue-plugin', { id: PAINT_BRUSH_TOOL_ID, renderStroke: hijacker })
    addStroke(makeBrushStroke(pts, { width: 10, opacity: 0.8, hardness: 1 }))

    engineCtx.draws.length = 0
    engine.redrawAll()
    expect(hijacker).not.toHaveBeenCalled()
    expect(engineCtx.draws.filter((d) => d.kind === 'stroke').length).toBeGreaterThanOrEqual(1)
  })
})

describe('T240 AC-3 closed-contour fill rendering with holes', () => {
  it('T240 AC-3: renderPaintFill fills polygon, smooth closed polygon, rect, and ellipse contours with the specified color and opacity', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]

    // Polygon (hard vertices)
    const poly = makeRecordingCtx()
    renderPaintFill(poly.ctx, makeFillStroke(square, { shapeType: 'polygon', smooth: false, opacity: 0.75, hardness: 1 }))
    const polyFills = poly.draws.filter((d) => d.kind === 'fill')
    expect(polyFills).toHaveLength(1)
    expect(polyFills[0].fillStyle).toBe('#22aa44')
    expect(polyFills[0].globalAlpha).toBeCloseTo(0.75, 4)
    expect(polyFills[0].ops.filter((op) => op.op === 'moveTo')).toEqual([{ op: 'moveTo', x: 0, y: 0 }])
    expect(polyFills[0].ops.filter((op) => op.op === 'lineTo')).toEqual([
      { op: 'lineTo', x: 100, y: 0 },
      { op: 'lineTo', x: 100, y: 100 },
      { op: 'lineTo', x: 0, y: 100 },
    ])
    expect(polyFills[0].ops.some((op) => op.op === 'closePath')).toBe(true)

    // Smooth closed polygon (cubic curves returning to P0 with C1 wrap-around seam)
    const smoothPoly = makeRecordingCtx()
    renderPaintFill(smoothPoly.ctx, makeFillStroke(square, { shapeType: 'polygon', smooth: true, opacity: 0.75, hardness: 1 }))
    const smoothFills = smoothPoly.draws.filter((d) => d.kind === 'fill')
    expect(smoothFills).toHaveLength(1)
    const beziers = smoothFills[0].ops.filter((op) => op.op === 'bezierCurveTo')
    expect(beziers.length).toBeGreaterThanOrEqual(4)
    const first = beziers[0]
    const last = beziers[beziers.length - 1]
    expect(last.x).toBeCloseTo(first.p0.x, 4)
    expect(last.y).toBeCloseTo(first.p0.y, 4)
    const uIn = unitVec(last.x - last.cp2x, last.y - last.cp2y)
    const uOut = unitVec(first.cp1x - first.p0.x, first.cp1y - first.p0.y)
    expect(uIn.x * uOut.x + uIn.y * uOut.y, 'C1 wrap-around seam on closed smooth fill').toBeGreaterThan(0.999)

    // Rect fill
    const rectRec = makeRecordingCtx()
    renderPaintFill(rectRec.ctx, makeFillStroke([{ x: 10, y: 20 }, { x: 110, y: 80 }], { shapeType: 'rect', opacity: 0.5, hardness: 1 }))
    const rectFills = rectRec.draws.filter((d) => d.kind === 'fill')
    expect(rectFills).toHaveLength(1)
    expect(rectFills[0].fillStyle).toBe('#22aa44')
    expect(rectFills[0].globalAlpha).toBeCloseTo(0.5, 4)
    const drewRect =
      rectFills[0].ops.some((op) => op.op === 'rect' && op.x === 10 && op.y === 20 && op.width === 100 && op.height === 60) ||
      rectFills[0].ops.filter((op) => op.op === 'lineTo').length >= 3
    expect(drewRect).toBe(true)

    // Ellipse fill
    const ellipseRec = makeRecordingCtx()
    renderPaintFill(ellipseRec.ctx, makeFillStroke([{ x: 10, y: 20 }, { x: 110, y: 80 }], { shapeType: 'ellipse', opacity: 0.5, hardness: 1 }))
    const ellipseFills = ellipseRec.draws.filter((d) => d.kind === 'fill')
    expect(ellipseFills).toHaveLength(1)
    expect(ellipseFills[0].fillStyle).toBe('#22aa44')
    expect(ellipseFills[0].globalAlpha).toBeCloseTo(0.5, 4)
    const drewEllipse =
      ellipseFills[0].ops.some((op) => op.op === 'ellipse' && op.x === 60 && op.y === 50 && op.radiusX === 50 && op.radiusY === 30) ||
      ellipseFills[0].ops.some((op) => op.op === 'bezierCurveTo')
    expect(drewEllipse).toBe(true)
  })

  it('T240 AC-3: renderPaintFill with holes traces outer contour and every hole subpath and fills with the evenodd rule', () => {
    const outer: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ]
    const polyHole: Point[] = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ]
    const smoothHole: Point[] = [
      { x: 120, y: 120 },
      { x: 170, y: 120 },
      { x: 170, y: 170 },
      { x: 120, y: 170 },
    ]

    const { ctx, raw, draws } = makeRecordingCtx()
    renderPaintFill(ctx, makeFillStroke(outer, {
      style: { color: '#ff9900', lineWidth: 1, lineCap: 'round', lineJoin: 'round' },
      shapeType: 'polygon',
      smooth: false,
      opacity: 0.6,
      hardness: 1,
      holes: [
        { points: polyHole, smooth: false },
        { points: smoothHole, smooth: true },
      ],
    }))

    const fills = draws.filter((d) => d.kind === 'fill')
    expect(fills).toHaveLength(1)
    expect(fills[0].fillRule).toBe('evenodd')
    expect(fills[0].fillStyle).toBe('#ff9900')
    expect(fills[0].globalAlpha).toBeCloseTo(0.6, 4)

    // Outer contour + 2 holes = at least 3 distinct subpaths, with Bezier curves for the smooth hole.
    const moveTos = fills[0].ops.filter((op) => op.op === 'moveTo')
    expect(moveTos.length).toBeGreaterThanOrEqual(3)
    expect(fills[0].ops.some((op) => op.op === 'bezierCurveTo')).toBe(true)
    expect(raw.globalAlpha).toBe(1)

    // Host built-in fill renderer cannot be overridden by a plugin registering the same tool id.
    const engineCtx = makeRecordingCtx()
    const canvas = document.createElement('canvas')
    canvas.getContext = (() => engineCtx.ctx) as unknown as typeof canvas.getContext
    const engine = new CanvasEngine(canvas)
    const hijacker = vi.fn()
    registerContribution('canvas.tools', 'rogue-plugin', { id: PAINT_FILL_TOOL_ID, renderStroke: hijacker })
    addStroke(makeFillStroke(outer, { shapeType: 'polygon', holes: [{ points: polyHole }] }))

    engineCtx.draws.length = 0
    engine.redrawAll()
    expect(hijacker).not.toHaveBeenCalled()
    expect(engineCtx.draws.some((d) => d.kind === 'fill' && d.fillRule === 'evenodd')).toBe(true)
  })
})
