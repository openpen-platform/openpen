/**
 * Highlighter tool — freehand polyline drawn semi-transparent.
 *
 * Opacity is a property of the whole stroke, not of each segment: the live
 * preview re-draws the full polyline as a single path on every move, because
 * stroking segment by segment at partial alpha would darken wherever two
 * segments overlap. The committed stroke carries `opacity`, which the
 * canvas-engine's default polyline renderer applies, so no `renderStroke`
 * override is needed and undo / redo / clear / erase behave as for any stroke.
 */
import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

/**
 * Id shared by the tool, its cursor, its control-bar item and the strokes it
 * produces. Deliberately not the bare word `highlighter`: the plugin tutorial
 * teaches that id, and a plugin tool with the same id would take over the
 * built-in strokes' `renderStroke` lookup.
 */
export const HIGHLIGHTER_TOOL_ID = 'highlighter-pen'

/** Final stroke opacity: low enough that text underneath stays legible. */
export const HIGHLIGHTER_OPACITY = 0.4

export function createHighlighterTool(): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null

  return {
    needsPreviewRedraw: true,
    onPointerDown(_, point, s) {
      points = [point]
      style = { ...s }
    },
    onPointerMove(_, point) {
      if (!style) return
      points.push(point)
    },
    renderPreview(ctx) {
      if (!style || points.length < 2) return
      ctx.save()
      ctx.globalAlpha = HIGHLIGHTER_OPACITY
      ctx.strokeStyle =
        typeof style.color === 'string' ? style.color : style.color.from
      ctx.lineWidth = style.lineWidth
      ctx.lineCap = style.lineCap
      ctx.lineJoin = style.lineJoin
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y)
      }
      ctx.stroke()
      ctx.restore()
    },
    onPointerUp(_, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: HIGHLIGHTER_TOOL_ID,
        points: [...points],
        style: { ...style },
        opacity: HIGHLIGHTER_OPACITY,
      }
      points = []
      style = null
      return stroke
    },
  }
}
