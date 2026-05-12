import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'
import { resolveColorStyle } from '@openpen/module-api/host'

export type ShapeKind =
  | 'rect' | 'square' | 'circle' | 'roundrect'
  | 'ellipse' | 'triangle' | 'triangle-down'
  | 'diamond' | 'parallelogram' | 'star'

interface Options {
  kind?: ShapeKind
  filled?: boolean
}

export function createShapeTool({ kind = 'rect' as ShapeKind, filled = false }: Options = {}): Tool {
  let start: Point | null = null
  let style: StrokeStyle | null = null

  return {
    needsPreviewRedraw: true,
    onPointerDown(_, point, s) {
      start = { ...point }
      style = { ...s }
    },
    onPointerMove(ctx, point) {
      if (!start || !style) return
      drawShape(ctx, start, point, style, kind, filled)
    },
    onPointerUp(_, point): Stroke | null {
      if (!start || !style) return null
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'shape',
        points: [start, { ...point }],
        style: { ...style },
        shapeType: kind,
        filled,
      }
      start = null
      style = null
      return stroke
    },
  }
}

export function renderShapeStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length < 2) return
  drawShape(
    ctx,
    stroke.points[0],
    stroke.points[1],
    stroke.style,
    (stroke.shapeType as ShapeKind) ?? 'rect',
    Boolean(stroke.filled),
  )
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle,
  kind: ShapeKind,
  filled: boolean,
): void {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const w = Math.abs(end.x - start.x)
  const h = Math.abs(end.y - start.y)
  if (w === 0 && h === 0) return

  // Build stroke / fill style via the host's color resolver so linear
  // gradients are honoured (without this every gradient collapsed to
  // its `from` colour because we were taking the raw string).
  const p0 = { x, y }
  const p1 = { x: x + w, y: y + h }
  const resolved = resolveColorStyle(ctx, style.color, p0, p1)

  ctx.save()
  ctx.strokeStyle = resolved
  ctx.fillStyle = resolved
  ctx.lineWidth = style.lineWidth
  ctx.lineCap = style.lineCap
  ctx.lineJoin = style.lineJoin
  ctx.beginPath()

  switch (kind) {
    case 'square': {
      const size = Math.min(w, h)
      ctx.rect(x, y, size, size)
      break
    }
    case 'circle': {
      const r = Math.min(w, h) / 2
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
      break
    }
    case 'roundrect': {
      const radius = Math.min(w, h, 40) * 0.2
      const c = ctx as CanvasRenderingContext2D & { roundRect?: (...args: unknown[]) => void }
      if (typeof c.roundRect === 'function') {
        c.roundRect(x, y, w, h, radius)
      } else {
        ctx.rect(x, y, w, h)
      }
      break
    }
    case 'ellipse': {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      break
    }
    case 'triangle': {
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x, y + h)
      ctx.closePath()
      break
    }
    case 'triangle-down': {
      ctx.moveTo(x, y)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x + w / 2, y + h)
      ctx.closePath()
      break
    }
    case 'diamond': {
      const cx = x + w / 2
      const cy = y + h / 2
      ctx.moveTo(cx, y)
      ctx.lineTo(x + w, cy)
      ctx.lineTo(cx, y + h)
      ctx.lineTo(x, cy)
      ctx.closePath()
      break
    }
    case 'parallelogram': {
      const skew = w * 0.25
      ctx.moveTo(x + skew, y)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x + w - skew, y + h)
      ctx.lineTo(x, y + h)
      ctx.closePath()
      break
    }
    case 'star': {
      const cx = x + w / 2
      const cy = y + h / 2
      const rOuter = Math.min(w, h) / 2
      const rInner = rOuter * 0.4
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rOuter : rInner
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'rect':
    default:
      ctx.rect(x, y, w, h)
  }

  if (filled) ctx.fill()
  else ctx.stroke()
  ctx.restore()
}
