import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

export function createEraserTool(): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let last: Point | null = null

  return {
    needsPreviewRedraw: true,
    onPointerDown(_, point, s) {
      points = [{ ...point }]
      style = {
        color: '#000000',
        lineWidth: Math.max(6, s.lineWidth * 2),
        lineCap: 'round',
        lineJoin: 'round',
      }
      last = { ...point }
    },
    onPointerMove(_, point) {
      if (!last || !style) return
      if (point.x === last.x && point.y === last.y) return
      points.push({ ...point })
      last = { ...point }
    },
    renderPreview(ctx) {
      if (!style || points.length === 0) return
      renderEraserStroke(ctx, {
        id: 'preview-eraser',
        tool: 'eraser',
        points,
        style,
      })
    },
    onPointerUp(_, point): Stroke | null {
      if (!style || points.length === 0) {
        points = []
        style = null
        last = null
        return null
      }
      if (!last || point.x !== last.x || point.y !== last.y) {
        points.push({ ...point })
      }
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'eraser',
        points,
        style: { ...style },
      }
      points = []
      style = null
      last = null
      return stroke
    },
  }
}

export function renderEraserStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (!stroke?.style || !stroke?.points || stroke.points.length === 0) return
  const lineWidth = Math.max(1, stroke.style.lineWidth)
  const radius = Math.max(1, lineWidth / 2)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const p0 = stroke.points[0]
  ctx.beginPath()
  ctx.arc(p0.x, p0.y, radius, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1]
    const b = stroke.points[i]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(b.x, b.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
