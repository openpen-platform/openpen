import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

/**
 * Highlighter — semi-transparent wide pen. The custom `renderStroke`
 * (exported for the module's contribution) re-applies the alpha so
 * strokes look the same on the live preview and on a full redraw.
 */
export function createHighlighterTool(): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  return {
    onPointerDown(_ctx, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },
    onPointerMove(ctx, point) {
      if (!style || !prev) return
      points.push(point)
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = typeof style.color === 'string' ? style.color : style.color.from
      ctx.lineWidth = Math.max(12, style.lineWidth * 4)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.restore()
      prev = point
    },
    onPointerUp(_ctx, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'highlighter',
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

export function renderHighlighterStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke
): void {
  if (stroke.points.length < 2) return
  const style = stroke.style
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = typeof style.color === 'string' ? style.color : style.color.from
  ctx.lineWidth = Math.max(12, style.lineWidth * 4)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}
