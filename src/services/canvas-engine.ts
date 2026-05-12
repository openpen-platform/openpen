import type { Tool, StrokeStyle, Stroke, PointerModifiers } from '../types/tool-types'
import { addStroke, getAllStrokes, clearAll, pushCommand, undo as storeUndo, redo as storeRedo } from './stroke-store'
import { resolveColorStyle } from './color-utils'
import { getSlotEntries } from '../core/runtime/contribution-store'
import type { CanvasLayerContribution, ToolContribution } from '@openpen/module-api'

type CustomRenderer = (ctx: CanvasRenderingContext2D, stroke: Stroke) => void

/**
 * Look up a module-provided custom renderer for a stroke. Modules register
 * their tools as contributions to `canvas.tools`; if a tool's contribution
 * declares `renderStroke`, we use it for the stroke's full redraw.
 *
 * Returns undefined to fall back to the default polyline render.
 */
function findCustomRenderer(toolId: string): CustomRenderer | undefined {
  const entries = getSlotEntries<ToolContribution>('canvas.tools').value
  for (const e of entries) {
    if (e.contribution.id === toolId) {
      const fn = (e.contribution as { renderStroke?: unknown }).renderStroke
      if (typeof fn === 'function') return fn as CustomRenderer
    }
  }
  return undefined
}

/**
 * Read layer contributions sorted ascending by `order` (stable). Layers
 * with no `order` count as 0; ties keep registration order.
 */
function sortedLayers(slotId: string): CanvasLayerContribution[] {
  const entries = getSlotEntries<CanvasLayerContribution>(slotId).value
  const decorated = entries.map((e, idx) => ({ idx, item: e.contribution }))
  decorated.sort((a, b) => {
    const oa = a.item.order ?? 0
    const ob = b.item.order ?? 0
    return oa !== ob ? oa - ob : a.idx - b.idx
  })
  return decorated.map((d) => d.item)
}

function renderLayers(
  ctx: CanvasRenderingContext2D,
  slotId: 'canvas.layers.background' | 'canvas.layers.overlay'
): void {
  for (const layer of sortedLayers(slotId)) {
    if (typeof layer.render !== 'function') continue
    try {
      layer.render(ctx)
    } catch (err) {
      console.error(`[canvas-engine] ${slotId} layer "${layer.id}" threw:`, err)
    }
  }
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private activeTool: Tool | null = null
  private drawing = false
  private dpr: number
  private resizeObserver: ResizeObserver
  private dprMediaQuery: MediaQueryList | null = null
  private onDprChange: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.dpr = window.devicePixelRatio || 1

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(canvas)

    this.onDprChange = () => {
      this.onResize()
      this.watchDpr()
    }
    this.watchDpr()
    this.onResize()
  }

  // One-shot matchMedia listener: fires once when DPR changes, then re-arms on the new value.
  private watchDpr(): void {
    const dpr = window.devicePixelRatio || 1
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    this.dprMediaQuery = mq
    mq.addEventListener('change', this.onDprChange, { once: true })
  }

  private onResize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.redrawAllInternal()
  }

  setActiveTool(tool: Tool): void {
    // Abort in-flight stroke when the tool changes mid-draw.
    this.drawing = false
    this.activeTool = tool
  }

  handlePointerDown(point: { x: number; y: number }, style: StrokeStyle): void {
    if (!this.activeTool) return
    this.drawing = true
    this.activeTool.onPointerDown(this.ctx, point, style)
    if (this.activeTool.needsPreviewRedraw) {
      this.redrawAllInternal()
      this.activeTool.renderPreview?.(this.ctx)
    }
  }

  handlePointerMove(point: { x: number; y: number }, modifiers: PointerModifiers = {}): void {
    if (!this.activeTool || !this.drawing) return
    // Tools that preview-redraw (line / shape) need a full redraw of committed strokes first.
    if (this.activeTool.needsPreviewRedraw) this.redrawAllInternal()
    const changed = this.activeTool.onPointerMove(this.ctx, point, modifiers)
    if (this.activeTool.needsPreviewRedraw && this.activeTool.renderPreview) {
      this.activeTool.renderPreview(this.ctx)
      return
    }
    // Stroke-eraser removes strokes during move; a full redraw is required immediately.
    if (changed === true) this.redrawAllInternal()
  }

  handlePointerUp(point: { x: number; y: number }, modifiers: PointerModifiers = {}): void {
    if (!this.activeTool || !this.drawing) return
    this.drawing = false
    const stroke = this.activeTool.onPointerUp(this.ctx, point, modifiers)
    if (stroke) {
      addStroke(stroke)
      pushCommand({ type: 'ADD_STROKE', stroke })
      this.redrawAllInternal()
    }
  }

  private redrawAllInternal(): void {
    const { canvas: canvas, ctx: ctx, dpr: dpr } = this
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    // Layer order: background → strokes → overlay. Modules wire grids,
    // watermarks, rulers, snap guides into the relevant slot.
    renderLayers(ctx, 'canvas.layers.background')
    for (const stroke of getAllStrokes()) {
      renderStroke(ctx, stroke)
    }
    renderLayers(ctx, 'canvas.layers.overlay')
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.dprMediaQuery?.removeEventListener('change', this.onDprChange)
    this.dprMediaQuery = null
  }

  clearCanvas(): void {
    const strokes = getAllStrokes()
    if (strokes.length > 0) {
      pushCommand({ type: 'CLEAR_ALL', strokes: [...strokes] })
    }
    clearAll()
    this.redrawAllInternal()
    // On Windows, transparent overlay BrowserWindows defer paint when no input
    // is in flight — the cleared canvas stays visually stale until the next
    // pointer event triggers a fresh redraw (user reproduces by drawing one
    // more stroke for the clear to "take effect"). Scheduling an explicit RAF
    // redraw forces the compositor to flush within ~16ms on every platform.
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.redrawAllInternal())
    }
  }

  undo(): void {
    if (storeUndo()) this.redrawAllInternal()
  }

  redo(): void {
    if (storeRedo()) this.redrawAllInternal()
  }

  redrawAll(): void {
    this.redrawAllInternal()
  }
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  // Module-provided renderer wins. Tools that need custom drawing
  // (shapes, erasers, anything beyond a polyline) ship their own
  // `renderStroke` in their `canvas.tools` contribution.
  const custom = findCustomRenderer(stroke.tool)
  if (custom) {
    custom(ctx, stroke)
    return
  }

  // Default: connect points as a stroked polyline. Suitable for any
  // freehand-style tool. Tools producing zero or single-point strokes
  // are no-ops here and must provide a custom renderer if they want
  // visible output.
  if (stroke.points.length < 2) return
  const { lineWidth, lineCap, lineJoin } = stroke.style
  const p0 = stroke.points[0]
  const pN = stroke.points[stroke.points.length - 1]
  const resolved = resolveColorStyle(ctx, stroke.style.color, p0, pN)

  ctx.save()
  ctx.strokeStyle = resolved
  ctx.lineWidth = lineWidth
  ctx.lineCap = lineCap
  ctx.lineJoin = lineJoin
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}
