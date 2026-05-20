/**
 * DemoTool — minimal custom drawing tool for the plugin-starter.
 *
 * Demonstrates the full Tool contract:
 *   - onPointerDown  : starts a new stroke, stores the first point
 *   - onPointerMove  : extends the stroke incrementally (one segment per event)
 *   - onPointerUp    : finalises and returns the Stroke to the canvas engine
 *   - needsPreviewRedraw : false (incremental render — no full-canvas clear needed)
 *   - extra Stroke state : stores `opacity` as a tool-specific extra key to show
 *     how custom data survives into renderStroke
 *
 * Public reference for the Tool / Stroke / Point / StrokeStyle interfaces:
 *   docs/reference/slots.md → `canvas.tools` section.
 */
import { resolveStrokeColor } from '@openpen/module-api'
import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'

// Fixed demo opacity — replace with a settings value in a real tool.
const DEMO_OPACITY = 0.75

export function createDemoTool(): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  return {
    // needsPreviewRedraw defaults to false — incremental draw is more efficient.
    needsPreviewRedraw: false,

    onPointerDown(_canvasCtx, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },

    onPointerMove(canvasCtx, point) {
      if (!style || !prev) return
      points.push(point)

      canvasCtx.save()
      canvasCtx.globalAlpha = DEMO_OPACITY
      canvasCtx.strokeStyle = resolveStrokeColor(style.color)
      canvasCtx.lineWidth = style.lineWidth
      canvasCtx.lineCap = style.lineCap
      canvasCtx.lineJoin = style.lineJoin
      canvasCtx.beginPath()
      canvasCtx.moveTo(prev.x, prev.y)
      canvasCtx.lineTo(point.x, point.y)
      canvasCtx.stroke()
      canvasCtx.restore()

      prev = point
    },

    onPointerUp(_canvasCtx, point): Stroke | null {
      if (!style) return null
      points.push(point)

      // Store `opacity` as a tool-specific extra key on the Stroke.
      // The host passes this Stroke back to `renderStroke` below, where
      // we read it back without any host involvement.
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: 'openpen-plugin-starter.demo',
        points: [...points],
        style: { ...style },
        opacity: DEMO_OPACITY, // tool-specific extra state (Stroke index signature)
      }

      points = []
      style = null
      prev = null
      return stroke
    },
  }
}

/**
 * Custom stroke renderer — called by the canvas engine when replaying history.
 *
 * Reads back `opacity` from the Stroke's extra-state index signature.
 * Type-cast is intentional: TypeScript cannot infer plugin-specific keys.
 */
export function renderDemoStroke(
  canvasCtx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  if (stroke.points.length < 2) return
  const opacity = (stroke.opacity as number | undefined) ?? 1

  canvasCtx.save()
  canvasCtx.globalAlpha = opacity
  canvasCtx.strokeStyle = resolveStrokeColor(stroke.style.color)
  canvasCtx.lineWidth = stroke.style.lineWidth
  canvasCtx.lineCap = stroke.style.lineCap
  canvasCtx.lineJoin = stroke.style.lineJoin
  canvasCtx.beginPath()
  canvasCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    canvasCtx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  canvasCtx.stroke()
  canvasCtx.restore()
}
