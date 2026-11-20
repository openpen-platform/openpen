import type { Tool, StrokeStyle, Stroke, PointerModifiers } from '../types/tool-types'
import { addStroke, getAllStrokes, getRewriteVersion, clearAll, pushCommand, purgeStroke, undo as storeUndo, redo as storeRedo } from './stroke-store'
import { StrokeFader } from './stroke-fade'
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
// Tool id → renderer, rebuilt only when the canvas.tools slot changes (the
// slot store replaces its entry array on every change).
let rendererMapSource: unknown = null
let rendererMap = new Map<string, CustomRenderer>()

function findCustomRenderer(toolId: string): CustomRenderer | undefined {
  const entries = getSlotEntries<ToolContribution>('canvas.tools').value
  if (entries !== rendererMapSource) {
    const map = new Map<string, CustomRenderer>()
    for (const e of entries) {
      const fn = (e.contribution as { renderStroke?: unknown }).renderStroke
      // First registration wins, matching the previous linear search.
      if (typeof fn === 'function' && !map.has(e.contribution.id)) map.set(e.contribution.id, fn as CustomRenderer)
    }
    rendererMap = map
    rendererMapSource = entries
  }
  return rendererMap.get(toolId)
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
  private fader = new StrokeFader()
  /** Hold time for strokes drawn from now on; null while fading is off. */
  private fadeHoldMs: number | null = null
  private fadeSettingKnown = false
  private fadeTimer: ReturnType<typeof setTimeout> | null = null
  private fadeScratch: HTMLCanvasElement | null = null
  private onFadeRemoved: (() => void) | null = null
  private now: () => number = () => performance.now()
  /**
   * Offscreen copy of the committed strokes. Adding a stroke draws just that
   * stroke into it; a repaint then costs one image copy however many strokes
   * are on screen. Rebuilt from the store when strokes are removed or replaced.
   */
  private strokeCache: HTMLCanvasElement | null = null
  private strokeCacheCtx: CanvasRenderingContext2D | null = null
  /** Scratch canvas for repaints that add a preview or fading strokes on top of the cache. */
  private strokeLayer: HTMLCanvasElement | null = null
  private strokeLayerCtx: CanvasRenderingContext2D | null = null
  private cacheValid = false
  private cacheCount = 0
  private cacheVersion = -1
  private cacheTools: unknown = null
  private redrawScheduled = false
  private redrawFallback: ReturnType<typeof setTimeout> | null = null
  /** A merged repaint was held back because a stroke was being drawn. */
  private repaintAfterStroke = false
  private onContextRestored: () => void

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
    // A GPU process restart wipes the canvas pixels while the store keeps
    // every stroke; repaint everything once the context is back.
    this.onContextRestored = () => {
      this.cacheValid = false
      this.requestRedraw()
    }
    canvas.addEventListener('contextrestored', this.onContextRestored)
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
    this.cacheValid = false
    this.redrawAllInternal()
  }

  /**
   * Turn stroke fading on (hold time in seconds) or off (null). Applies to
   * strokes drawn afterwards; turning it off also stops countdowns already
   * running, so those strokes stay until cleared.
   */
  setFadeSeconds(seconds: number | null): void {
    this.fadeSettingKnown = true
    this.fadeHoldMs = seconds !== null && seconds > 0 ? seconds * 1000 : null
    if (this.fadeHoldMs === null) {
      this.fader.forgetAll()
      this.clearFadeTimer()
      this.redrawAllInternal()
    }
  }

  /** Hold times of strokes that fade, to be saved with the drawing snapshot. */
  getFadeHolds(): Record<string, number> {
    return this.fader.holds()
  }

  /**
   * Re-arm fading for strokes brought back from a saved snapshot (the overlay
   * window is rebuilt on some platforms). Each hold time starts over from now.
   * Ignored when the setting is known to be off.
   */
  restoreFades(holds: Record<string, number> | null | undefined): void {
    if (!holds || (this.fadeSettingKnown && this.fadeHoldMs === null)) return
    this.fader.restore(holds)
    this.syncFades()
  }

  /** Called after faded-out strokes were removed, so history buttons can refresh. */
  setFadeRemovedListener(listener: (() => void) | null): void {
    this.onFadeRemoved = listener
  }

  /** Test hook: replace the clock used for fade timing. */
  setClock(now: () => number): void {
    this.now = now
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer)
      this.fadeTimer = null
    }
  }

  private syncFades(): void {
    this.fader.reconcile(new Set(getAllStrokes().map((s) => s.id)), this.now())
    this.scheduleFadeTick()
  }

  private scheduleFadeTick(): void {
    this.clearFadeTimer()
    const wait = this.fader.nextChangeIn(this.now())
    if (wait === null) return
    this.fadeTimer = setTimeout(() => this.tickFades(), Math.max(wait, 16))
  }

  /** Remove strokes whose fade finished, redraw the rest, and re-arm the timer. */
  tickFades(): void {
    this.fadeTimer = null
    const now = this.now()
    const expired = this.fader.expired(now)
    for (const id of expired) {
      purgeStroke(id)
      this.fader.forget(id)
    }
    if (expired.length > 0 || this.fader.isFading(now)) this.redrawDuringFade()
    if (expired.length > 0) this.onFadeRemoved?.()
    this.scheduleFadeTick()
  }

  /**
   * Redraw for a fade step without wiping a stroke that is being drawn: tools
   * that paint straight onto the canvas keep their partial stroke only until
   * the next full redraw, so that redraw waits for pointer-up; preview tools
   * get their preview painted back on top.
   */
  private redrawDuringFade(): void {
    const tool = this.activeTool
    if (this.drawing && tool && !tool.needsPreviewRedraw) return
    this.redrawAllInternal(this.drawing ? tool : null)
  }

  setActiveTool(tool: Tool): void {
    // Abort in-flight stroke when the tool changes mid-draw.
    this.drawing = false
    this.activeTool = tool
    // No pointer-up will come for the aborted stroke; repaint what was held back.
    if (this.repaintAfterStroke) {
      this.repaintAfterStroke = false
      this.requestRedraw()
    }
  }

  handlePointerDown(point: { x: number; y: number }, style: StrokeStyle): void {
    if (!this.activeTool) return
    this.drawing = true
    this.activeTool.onPointerDown(this.ctx, point, style)
    if (this.activeTool.needsPreviewRedraw) this.redrawAllInternal(this.activeTool)
  }

  handlePointerMove(point: { x: number; y: number }, modifiers: PointerModifiers = {}): void {
    if (!this.activeTool || !this.drawing) return
    const tool = this.activeTool
    // Tools with renderPreview (brush eraser, highlighter) get it painted into
    // the stroke layer, so an eraser preview cuts strokes, not the background.
    if (tool.needsPreviewRedraw && tool.renderPreview) {
      tool.onPointerMove(this.ctx, point, modifiers)
      this.redrawAllInternal(tool)
      return
    }
    // Tools that preview-redraw (line / shape) need a full redraw of committed
    // strokes first, then paint their preview during onPointerMove.
    if (tool.needsPreviewRedraw) this.redrawAllInternal()
    const changed = tool.onPointerMove(this.ctx, point, modifiers)
    // Stroke-eraser removes strokes during move; a full redraw is required immediately.
    if (changed === true) {
      this.syncFades()
      this.redrawAllInternal()
    }
  }

  handlePointerUp(point: { x: number; y: number }, modifiers: PointerModifiers = {}): void {
    if (!this.activeTool || !this.drawing) return
    this.drawing = false
    const stroke = this.activeTool.onPointerUp(this.ctx, point, modifiers)
    if (stroke) {
      addStroke(stroke)
      pushCommand({ type: 'ADD_STROKE', stroke })
      // Eraser strokes cut earlier strokes away; fading one would undo the erase.
      if (this.fadeHoldMs !== null && stroke.tool !== 'eraser') {
        this.fader.track(stroke.id, this.fadeHoldMs, this.now())
        this.scheduleFadeTick()
      }
      this.redrawAllInternal()
    } else if (this.repaintAfterStroke) {
      this.redrawAllInternal()
    }
    this.repaintAfterStroke = false
  }

  /**
   * Repaint the canvas: background layers, then the strokes, then overlay
   * layers. Strokes (and the active tool's renderPreview, when given) are
   * composed offscreen first, so eraser strokes cut only into strokes and
   * never into a background layer.
   */
  private redrawAllInternal(preview: Tool | null = null): void {
    const { canvas: canvas, ctx: ctx, dpr: dpr } = this
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    // Layer order: background → strokes → overlay. Modules wire grids,
    // watermarks, rulers, snap guides into the relevant slot.
    renderLayers(ctx, 'canvas.layers.background')
    const now = this.now()
    // A fading stroke changes every frame, so the cache is skipped and rebuilt
    // once fading is over.
    const fading = this.fader.isFading(now)
    if (fading) this.cacheValid = false
    const cache = fading ? null : this.syncStrokeCache()
    const previewTool = preview?.renderPreview ? preview : null
    const layer = cache && !previewTool ? cache : this.composeStrokeLayer(cache, now, previewTool)
    if (layer) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layer, 0, 0)
      ctx.restore()
    } else {
      // No offscreen 2D context available: paint straight onto the canvas.
      for (const stroke of getAllStrokes()) {
        const alpha = this.fader.alpha(stroke.id, now)
        if (alpha < 1) this.renderFaded(stroke, alpha, ctx)
        else renderStroke(ctx, stroke)
      }
      previewTool?.renderPreview?.(ctx)
    }
    renderLayers(ctx, 'canvas.layers.overlay')
  }

  /**
   * Compose the strokes for one repaint on a scratch canvas: the cache (or,
   * while strokes fade, every stroke at its current opacity), plus the active
   * tool's preview. Returns null when no offscreen 2D context is available.
   */
  private composeStrokeLayer(cache: HTMLCanvasElement | null, now: number, preview: Tool | null): HTMLCanvasElement | null {
    const { canvas, dpr } = this
    if (!this.strokeLayer) {
      this.strokeLayer = document.createElement('canvas')
      this.strokeLayerCtx = this.strokeLayer.getContext('2d')
    }
    const layer = this.strokeLayer
    const lctx = this.strokeLayerCtx
    if (!lctx) return null
    if (layer.width !== canvas.width) layer.width = canvas.width
    if (layer.height !== canvas.height) layer.height = canvas.height
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.clearRect(0, 0, layer.width, layer.height)
    if (cache) {
      lctx.drawImage(cache, 0, 0)
    } else {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      for (const stroke of getAllStrokes()) {
        const alpha = this.fader.alpha(stroke.id, now)
        if (alpha < 1) this.renderFaded(stroke, alpha, lctx)
        else renderStroke(lctx, stroke)
      }
    }
    if (preview?.renderPreview) {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      preview.renderPreview(lctx)
    }
    return layer
  }

  /**
   * Bring the stroke cache up to date and return it, or null when no
   * offscreen 2D context is available. Strokes appended since the last call
   * are drawn into it; any other change to the stroke list, a resize or a
   * change of tool renderers redraws it from scratch.
   */
  private syncStrokeCache(): HTMLCanvasElement | null {
    const { canvas, dpr } = this
    if (!this.strokeCache) {
      this.strokeCache = document.createElement('canvas')
      this.strokeCacheCtx = this.strokeCache.getContext('2d')
    }
    const cache = this.strokeCache
    const cctx = this.strokeCacheCtx
    if (!cctx) return null
    if (cache.width !== canvas.width || cache.height !== canvas.height) {
      cache.width = canvas.width
      cache.height = canvas.height
      this.cacheValid = false
    }
    const strokes = getAllStrokes()
    const version = getRewriteVersion()
    const tools = getSlotEntries<ToolContribution>('canvas.tools').value
    if (
      !this.cacheValid ||
      version !== this.cacheVersion ||
      tools !== this.cacheTools ||
      strokes.length < this.cacheCount
    ) {
      cctx.setTransform(1, 0, 0, 1, 0, 0)
      cctx.clearRect(0, 0, cache.width, cache.height)
      this.cacheCount = 0
      this.cacheVersion = version
      this.cacheTools = tools
      this.cacheValid = true
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (let i = this.cacheCount; i < strokes.length; i++) renderStroke(cctx, strokes[i])
    this.cacheCount = strokes.length
    return cache
  }

  /**
   * Repaint on the next frame. Requests made before then share one repaint.
   * A timer backs up the frame callback, which a hidden or occluded window may
   * never run.
   */
  requestRedraw(): void {
    if (this.redrawScheduled) return
    this.redrawScheduled = true
    const run = (): void => {
      if (!this.redrawScheduled) return
      this.redrawScheduled = false
      if (this.redrawFallback !== null) {
        clearTimeout(this.redrawFallback)
        this.redrawFallback = null
      }
      this.syncFades()
      // Same rule as a fade step: a tool painting its partial stroke straight
      // onto the canvas would lose it to a full repaint, so that repaint waits
      // for pointer-up; preview tools get their preview painted back on top.
      const tool = this.activeTool
      if (this.drawing && tool && !tool.needsPreviewRedraw) {
        this.repaintAfterStroke = true
        return
      }
      this.redrawAllInternal(this.drawing ? tool : null)
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run)
    this.redrawFallback = setTimeout(run, 100)
  }

  /**
   * Draw a fading stroke through a scratch canvas so the fade multiplies
   * whatever opacity the stroke's own renderer applies.
   */
  private renderFaded(stroke: Stroke, alpha: number, ctx: CanvasRenderingContext2D): void {
    const { canvas, dpr } = this
    const scratch = this.fadeScratch ?? (this.fadeScratch = document.createElement('canvas'))
    const sctx = scratch.getContext('2d')
    if (!sctx) {
      ctx.save()
      ctx.globalAlpha = alpha
      renderStroke(ctx, stroke)
      ctx.restore()
      return
    }
    if (scratch.width !== canvas.width) scratch.width = canvas.width
    if (scratch.height !== canvas.height) scratch.height = canvas.height
    sctx.setTransform(1, 0, 0, 1, 0, 0)
    sctx.clearRect(0, 0, scratch.width, scratch.height)
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderStroke(sctx, stroke)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = alpha
    ctx.drawImage(scratch, 0, 0)
    ctx.restore()
  }

  destroy(): void {
    this.clearFadeTimer()
    this.redrawScheduled = false
    if (this.redrawFallback !== null) clearTimeout(this.redrawFallback)
    this.redrawFallback = null
    this.canvas.removeEventListener('contextrestored', this.onContextRestored)
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
    this.syncFades()
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
    if (storeUndo()) {
      this.syncFades()
      this.redrawAllInternal()
    }
  }

  redo(): void {
    if (storeRedo()) {
      this.syncFades()
      this.redrawAllInternal()
    }
  }

  redrawAll(): void {
    // Callers such as the stroke eraser change the stroke list outside the engine.
    this.syncFades()
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
  if (typeof stroke.opacity === 'number' && Number.isFinite(stroke.opacity)) {
    ctx.globalAlpha = Math.min(1, Math.max(0, stroke.opacity))
  }
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
