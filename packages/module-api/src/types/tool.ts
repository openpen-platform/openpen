/**
 * Public Tool / Stroke / Point primitives shared by host code and
 * every module / plugin. Declared inside @openpen/module-api so
 * third parties don't need to import host internals to type their
 * `canvas.tools` contributions.
 */

export interface Point {
  x: number
  y: number
}

/** Solid color or linear gradient between two stops. */
export type StrokeColor =
  | string
  | { type: 'linear'; from: string; to: string }

/**
 * Reduce a `StrokeColor` to a single CSS colour string.
 *
 * `CanvasRenderingContext2D.strokeStyle` accepts a single colour string but
 * not a structured gradient descriptor; custom `renderStroke` implementations
 * that don't draw the gradient natively need a representative fallback.
 * Returns the string as-is for solid colours, and the `from` stop for linear
 * gradients. Future gradient kinds can pick their own representative without
 * touching callers.
 */
export function resolveStrokeColor(color: StrokeColor): string {
  return typeof color === 'string' ? color : color.from
}

export interface StrokeStyle {
  color: StrokeColor
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

export interface Stroke {
  id: string
  /** Id of the tool that produced this stroke (matches a ToolContribution.id). */
  tool: string
  points: Point[]
  style: StrokeStyle
  /**
   * Tool-specific extra state. Tools MAY store arbitrary keys here during
   * `onPointerDown` / `onPointerMove` / `onPointerUp`; those keys survive
   * into `renderStroke(stroke, canvasCtx)` calls so the renderer can read
   * them back.
   *
   * The host treats extra keys as `unknown` — type-cast at the read site is
   * the plugin author's responsibility (TypeScript cannot infer the shape).
   *
   * @example
   * // Store during onPointerUp:
   * const stroke: Stroke = { id, tool: 'my-tool', points, style, opacity: 0.5 }
   *
   * // Read back in renderStroke:
   * const opacity = (stroke.opacity as number) ?? 1
   * canvasCtx.globalAlpha = opacity
   */
  [key: string]: unknown
}

export interface PointerModifiers {
  shiftKey?: boolean
}

export interface Tool {
  onPointerDown(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    style: StrokeStyle
  ): void
  /**
   * Returns `true` when the engine should perform a full redraw
   * (e.g. stroke-eraser removed an existing stroke). Otherwise `void`.
   */
  onPointerMove(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers
  ): void | boolean
  /**
   * Returns the finished `Stroke` to push into the store, or `null`
   * to discard (e.g. an eraser that doesn't accumulate state).
   */
  onPointerUp(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers
  ): Stroke | null
  /** When true, canvas-engine clears + redraws all strokes before each move. */
  needsPreviewRedraw?: boolean
  renderPreview?(canvasCtx: CanvasRenderingContext2D): void
}
