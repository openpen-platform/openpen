import type { Point, PointerModifiers, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

export function resolveEnd(start: Point, point: Point, shiftKey: boolean): Point {
  if (!shiftKey) return { ...point }
  const dx = point.x - start.x
  const dy = point.y - start.y
  if (dx === 0 && dy === 0) return { ...point }
  const angle = Math.atan2(dy, dx)
  const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  const dist = Math.hypot(dx, dy)
  return { x: start.x + Math.cos(snap) * dist, y: start.y + Math.sin(snap) * dist }
}

export function createLineTool(): Tool {
  let start: Point | null = null
  let end: Point | null = null
  let style: StrokeStyle | null = null

  return {
    needsPreviewRedraw: true,
    onPointerDown(_, point, s) {
      start = { ...point }
      end = null
      style = { ...s }
    },
    onPointerMove(ctx, point, modifiers: PointerModifiers = {}) {
      if (!start || !style) return
      end = resolveEnd(start, point, modifiers.shiftKey === true)
      ctx.save()
      ctx.strokeStyle = typeof style.color === 'string' ? style.color : style.color.from
      ctx.lineWidth = style.lineWidth
      ctx.lineCap = style.lineCap
      ctx.lineJoin = style.lineJoin
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.restore()
    },
    onPointerUp(_, point, modifiers: PointerModifiers = {}): Stroke | null {
      if (!start || !style) return null
      const finalEnd = end ?? resolveEnd(start, point, modifiers.shiftKey === true)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'line',
        points: [start, finalEnd],
        style: { ...style },
      }
      start = null
      end = null
      style = null
      return stroke
    },
  }
}
