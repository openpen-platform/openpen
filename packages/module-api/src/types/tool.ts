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
   * Whole-stroke opacity in `0..1`; omitted means fully opaque.
   *
   * The host's default polyline renderer applies it as `globalAlpha` and clamps
   * values outside `0..1` back into range (non-finite values are ignored). A
   * tool that ships its own `renderStroke` owns the drawing and reads this field
   * itself — the host does not wrap custom renderers, so a plugin that already
   * stores and applies its own `opacity` key keeps rendering exactly as before.
   * A tool WITHOUT `renderStroke` that stores an `opacity` key now has it applied
   * by the default renderer; such a tool must store a number in `0..1`.
   */
  opacity?: number
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
   * const stroke: Stroke = { id, tool: 'my-tool', points, style, taper: 0.5 }
   *
   * // Read back in renderStroke:
   * const taper = (stroke.taper as number) ?? 1
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
