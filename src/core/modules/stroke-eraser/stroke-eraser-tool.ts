import type { Point, Stroke, Tool } from '@openpen/module-api'
import {
  getAllStrokes,
  removeStrokeById,
  pushCommand,
  emit as eventBusEmit,
} from '@openpen/module-api/host'

export function createStrokeEraserTool(): Tool {
  let active = false
  const radius = 10

  function eraseAt(point: Point): boolean {
    const strokes = getAllStrokes()
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i]
      if (stroke.tool === 'eraser') continue
      if (hitStroke(point, stroke, radius)) {
        if (removeStrokeById(stroke.id)) {
          pushCommand({ type: 'REMOVE_STROKE', stroke })
          eventBusEmit('canvas-redraw-requested')
          return true
        }
        break
      }
    }
    return false
  }

  return {
    onPointerDown(_, point) {
      active = true
      eraseAt(point)
    },
    onPointerMove(_, point) {
      if (!active) return false
      return eraseAt(point)
    },
    onPointerUp() {
      active = false
      return null
    },
  }
}

// Tool ids of the host's MCP painting strokes (kept literal: modules cannot import host internals).
const PAINT_BRUSH_TOOL_ID = 'mcp-paint-brush'
const PAINT_FILL_TOOL_ID = 'mcp-paint-fill'

export function hitStroke(p: Point, stroke: Stroke, extraRadius: number): boolean {
  if (!stroke.points || stroke.points.length === 0) return false
  if (stroke.tool === PAINT_BRUSH_TOOL_ID && stroke.points.length >= 2) return hitPaintBrush(p, stroke, extraRadius)
  if (stroke.tool === PAINT_FILL_TOOL_ID && stroke.points.length >= 2) return hitPaintFill(p, stroke)
  if (stroke.tool === 'shape' && stroke.points.length >= 2) {
    return hitShape(p, stroke, extraRadius)
  }
  if (stroke.points.length === 1) {
    const w = stroke.style?.lineWidth ?? 1
    return dist(p, stroke.points[0]) <= extraRadius + w / 2
  }
  const tolerance = extraRadius + (stroke.style?.lineWidth ?? 1) / 2
  for (let i = 1; i < stroke.points.length; i++) {
    if (pointToSegmentDistance(p, stroke.points[i - 1], stroke.points[i]) <= tolerance) return true
  }
  return false
}

export function hitShape(p: Point, stroke: Stroke, extraRadius: number): boolean {
  const a = stroke.points[0]
  const b = stroke.points[1]
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  if (w === 0 && h === 0) return false
  const inExpandedBox =
    p.x >= x - extraRadius && p.x <= x + w + extraRadius &&
    p.y >= y - extraRadius && p.y <= y + h + extraRadius
  if (!inExpandedBox) return false
  if (stroke.filled) return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
  const left = Math.abs(p.x - x)
  const right = Math.abs(p.x - (x + w))
  const top = Math.abs(p.y - y)
  const bottom = Math.abs(p.y - (y + h))
  const edge = Math.min(left, right, top, bottom)
  const half = (stroke.style?.lineWidth ?? 1) / 2
  return edge <= extraRadius + half
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

// ── MCP painting strokes ─────────────────────────────────────────────────────

interface Ramp { start: number; end: number }

function isRamp(v: unknown): v is Ramp {
  return typeof v === 'object' && v !== null &&
    Number.isFinite((v as Ramp).start) && Number.isFinite((v as Ramp).end)
}

/**
 * The curve a smooth brush stroke follows, sampled: it passes through every
 * point with handles a third of the adjoining chord long along the line through
 * the neighbours. Mirrors the painting renderer so a hit lands where the
 * stroke is drawn.
 */
/** Drop points that repeat the one before them (and a closed contour's last point when it repeats the first). */
function cleanPoints(points: Point[], closed: boolean): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.abs(p.x - last.x) > 1e-9 || Math.abs(p.y - last.y) > 1e-9) out.push(p)
  }
  if (closed && out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first.x - last.x) <= 1e-9 && Math.abs(first.y - last.y) <= 1e-9) out.pop()
  }
  return out
}

function smoothPolyline(input: Point[], closed = false): Point[] {
  const points = cleanPoints(input, closed)
  const n = points.length
  if (n < 2) return points
  const at = (i: number): Point => (closed ? points[((i % n) + n) % n] : points[Math.min(n - 1, Math.max(0, i))])
  const dir = (i: number): Point => {
    const prev = at(i - 1)
    const next = at(i + 1)
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy)
    return len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 }
  }
  const out: Point[] = [points[0]]
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i)
    const b = at(i + 1)
    const chord = Math.hypot(b.x - a.x, b.y - a.y) / 3
    const da = dir(i)
    const db = dir(i + 1)
    const c1 = { x: a.x + da.x * chord, y: a.y + da.y * chord }
    const c2 = { x: b.x - db.x * chord, y: b.y - db.y * chord }
    const steps = Math.min(48, Math.max(4, Math.ceil(chord)))
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const u = 1 - t
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      })
    }
  }
  return out
}

/** A brush stroke is hit within half the stroke width (at that spot of a start-to-end ramp) plus the eraser radius. */
export function hitPaintBrush(p: Point, stroke: Stroke, extraRadius: number): boolean {
  const poly = stroke.smooth === true && stroke.points.length >= 3 ? smoothPolyline(stroke.points) : stroke.points
  const fallback = stroke.style?.lineWidth ?? 1
  const w = stroke.width
  if (poly.length === 1) {
    return dist(p, poly[0]) <= extraRadius + (typeof w === 'number' && Number.isFinite(w) ? w : isRamp(w) ? w.start : fallback) / 2
  }
  let total = 0
  for (let i = 1; i < poly.length; i++) total += dist(poly[i - 1], poly[i])
  let travelled = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]
    const b = poly[i]
    const len = dist(a, b)
    const d = pointToSegmentDistance(p, a, b)
    let width: number
    if (isRamp(w) && total > 0) {
      // Width at the foot of the perpendicular from p onto this segment.
      const abx = b.x - a.x
      const aby = b.y - a.y
      const f = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (len * len))) : 0
      const t = (travelled + len * f) / total
      width = w.start + (w.end - w.start) * t
    } else {
      width = typeof w === 'number' && Number.isFinite(w) ? w : fallback
    }
    if (d <= extraRadius + width / 2) return true
    travelled += len
  }
  return false
}

function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Closed contour of a fill (or one of its holes) as a polygon, smooth contours sampled. */
function contourPolygon(points: Point[], smooth: boolean): Point[] {
  if (!smooth || points.length < 3) return points
  return smoothPolyline(points, true)
}

/** A fill is hit anywhere inside its outline that is not inside one of its holes. */
export function hitPaintFill(p: Point, stroke: Stroke): boolean {
  const pts = stroke.points
  let inside: boolean
  if (stroke.shapeType === 'rect' || stroke.shapeType === 'ellipse') {
    const a = pts[0]
    const b = pts[1]
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    if (w === 0 || h === 0) return false
    if (stroke.shapeType === 'rect') {
      inside = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
    } else {
      const nx = (p.x - (x + w / 2)) / (w / 2)
      const ny = (p.y - (y + h / 2)) / (h / 2)
      inside = nx * nx + ny * ny <= 1
    }
  } else {
    inside = insidePolygon(p, contourPolygon(pts, stroke.smooth === true))
  }
  if (!inside) return false
  const holes = Array.isArray(stroke.holes) ? (stroke.holes as Array<{ points?: Point[]; smooth?: boolean }>) : []
  for (const hole of holes) {
    if (!Array.isArray(hole.points) || hole.points.length < 3) continue
    if (insidePolygon(p, contourPolygon(hole.points, hole.smooth === true))) return false
  }
  return true
}
