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

export function hitStroke(p: Point, stroke: Stroke, extraRadius: number): boolean {
  if (!stroke.points || stroke.points.length === 0) return false
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
