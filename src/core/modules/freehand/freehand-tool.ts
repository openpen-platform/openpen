/**
 * Freehand drawing tool — incremental polyline render during pointer
 * move (no pre-redraw needed) and a simple polyline stroke handed back
 * to the engine on pointer up. Uses the canvas-engine's default polyline
 * render path, so no `renderStroke` override is required.
 */
import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

export function createFreehandTool(): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  return {
    onPointerDown(_, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },
    onPointerMove(ctx, point) {
      if (!style || !prev) return
      points.push(point)
      ctx.save()
      ctx.strokeStyle =
        typeof style.color === 'string' ? style.color : style.color.from
      ctx.lineWidth = style.lineWidth
      ctx.lineCap = style.lineCap
      ctx.lineJoin = style.lineJoin
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.restore()
      prev = point
    },
    onPointerUp(_, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'freehand',
        points: [...points],
        style: { ...style },
      }
      points = []
      style = null
      prev = null
      return stroke
    },
  }
}
