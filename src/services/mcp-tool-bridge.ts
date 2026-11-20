/**
 * MCP tool bridge (renderer side).
 *
 * The main process forwards agent commands to the overlay of the target
 * display; this module turns them into the same stroke-store operations a
 * manual drawing action performs, so history (undo / redo), the canvas and the
 * Wayland snapshot all behave exactly as if the user had drawn the stroke.
 *
 * Coordinate spaces: commands and replies use screenshot pixels of the display.
 * The overlay works in CSS pixels, so overlay = pixel / devicePixelRatio.
 */
import { toRaw } from 'vue'
import { z } from 'zod'
import { runMcpTool, sanitizeIdForI18n } from '@openpen/module-api'
import type { McpCallResult, McpToolContext, McpToolDefinition, Point, Stroke } from '@openpen/module-api'
import { i18n } from '../i18n/index'
import { getModule } from '../core/runtime/module-registry'
import { PAINT_BRUSH_TOOL_ID, PAINT_FILL_TOOL_ID } from './paint-render'
import { addStroke, clearAll, getAllStrokes, pushCommand, purgeStroke, undo as storeUndo, redo as storeRedo } from './stroke-store'
import { emit, hasListeners } from '../core/runtime/event-bus'
import { getSlotEntries } from '../core/runtime/contribution-store'

type DrawShape = 'freehand' | 'line' | 'rect' | 'ellipse' | 'highlighter'

/** Top-left of the target display in screenshot pixels (absent = 0,0). */
export interface McpOffset { x: number; y: number }

/** A value that is either fixed or ramps from the start of a stroke to its end. */
export type PaintRamp = number | { start: number; end: number }

export interface PaintBrushItem {
  kind: 'brush'
  points: Point[]
  smooth?: boolean
  color?: string
  width?: PaintRamp
  opacity?: PaintRamp
  hardness?: number
}

interface PaintHoleItem { points: Point[]; smooth?: boolean }

interface PaintFillCommon {
  kind: 'fill'
  holes?: PaintHoleItem[]
  color?: string
  opacity?: number
  hardness?: number
}

export type PaintFillItem =
  | (PaintFillCommon & { shape: 'polygon'; points: Point[]; smooth?: boolean })
  | (PaintFillCommon & { shape: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number })

export type PaintItem = PaintBrushItem | PaintFillItem

export type McpCommand =
  | {
      type: 'draw'
      offset?: McpOffset
      shape: DrawShape
      points?: Point[]
      from?: Point
      to?: Point
      x?: number
      y?: number
      width?: number
      height?: number
      color?: string
      lineWidth?: number
    }
  | { type: 'paint'; offset?: McpOffset; items: PaintItem[] }
  | { type: 'ping' }
  | { type: 'list'; offset?: McpOffset }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'plugin-tool-call'; callId: string; pluginId: string; name: string; args?: unknown; offset?: McpOffset }
  | { type: 'plugin-tool-cancel'; callId: string }

export interface McpAnnotation {
  id: string
  kind: string
  bounds: { x: number; y: number; width: number; height: number }
  sourcePlugin: string
}

export type McpCommandResult =
  | { id: string }
  | { ids: string[] }
  | { annotations: McpAnnotation[] }
  | { deleted: boolean }
  | { ok: boolean }
  | { ready: true }
  | McpCallResult

const DEFAULT_COLOR = '#818cf8'
const DEFAULT_LINE_WIDTH = 4
const HIGHLIGHTER_LINE_WIDTH = 16
// Mirrors the highlighter module (src/core/modules/highlighter): own tool id + opacity.
const HIGHLIGHTER_TOOL_ID = 'highlighter-pen'
const HIGHLIGHTER_OPACITY = 0.4

const BUILTIN_SOURCES: Record<string, string> = {
  freehand: '@openpen/freehand',
  line: '@openpen/line',
  shape: '@openpen/shape',
  [HIGHLIGHTER_TOOL_ID]: '@openpen/highlighter',
}

function dpr(): number {
  const v = window.devicePixelRatio
  return Number.isFinite(v) && v > 0 ? v : 1
}

function toOverlay(p: Point, offset: McpOffset = { x: 0, y: 0 }): Point {
  const r = dpr()
  return { x: (p.x - offset.x) / r, y: (p.y - offset.y) / r }
}

/** Longest wait for the overlay to report a repaint before replying anyway. */
const REPAINT_WAIT_MS = 250

/**
 * Ask the overlay to repaint and resolve once it has, so a reply sent after
 * this (and a screenshot the agent takes next) already shows the change.
 * useCanvas listens: it merges requests into one repaint on the next frame,
 * which also makes transparent overlay windows on Windows flush their paint.
 */
function requestRedraw(): Promise<void> {
  if (!hasListeners('canvas-redraw-requested')) return Promise.resolve()
  // A hidden overlay (display asleep, screen locked) runs no frames and its
  // timers are throttled, so waiting could stall the reply for a long time.
  // The repaint is still requested and lands once the overlay is visible.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    emit('canvas-redraw-requested')
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, REPAINT_WAIT_MS)
    emit('canvas-redraw-requested', {
      onPainted: () => {
        clearTimeout(timer)
        resolve()
      },
    })
  })
}

function buildStroke(cmd: Extract<McpCommand, { type: 'draw' }>): Stroke {
  const off = cmd.offset ?? { x: 0, y: 0 }
  const toO = (p: Point) => toOverlay(p, off)
  const style = {
    color: cmd.color ?? DEFAULT_COLOR,
    lineWidth: cmd.lineWidth ?? (cmd.shape === 'highlighter' ? HIGHLIGHTER_LINE_WIDTH : DEFAULT_LINE_WIDTH),
    lineCap: 'round' as CanvasLineCap,
    lineJoin: 'round' as CanvasLineJoin,
  }
  const id = crypto.randomUUID()
  switch (cmd.shape) {
    case 'freehand':
      return { id, tool: 'freehand', points: (cmd.points ?? []).map(toO), style }
    case 'highlighter':
      return {
        id,
        tool: HIGHLIGHTER_TOOL_ID,
        points: (cmd.points ?? []).map(toO),
        style,
        opacity: HIGHLIGHTER_OPACITY,
      }
    case 'line':
      return { id, tool: 'line', points: [toO(cmd.from as Point), toO(cmd.to as Point)], style }
    case 'rect':
    case 'ellipse': {
      const x = cmd.x as number
      const y = cmd.y as number
      return {
        id,
        tool: 'shape',
        points: [toO({ x, y }), toO({ x: x + (cmd.width as number), y: y + (cmd.height as number) })],
        style,
        shapeType: cmd.shape,
        filled: false,
      }
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown): value is Point {
  return !!value && isFiniteNumber((value as Point).x) && isFiniteNumber((value as Point).y)
}

function paintError(index: number, kind: string, problem: string, nextStep: string): Error {
  return new Error(`Paint item ${index + 1} (${kind}): ${problem}. Next step: ${nextStep}. Nothing was drawn.`)
}

function checkPointList(points: unknown, min: number, index: number, kind: string, label: string): Point[] {
  if (!Array.isArray(points) || points.length < min) {
    throw paintError(index, kind, `${label} needs at least ${min} points`, `send ${label} with ${min} or more points of {x, y}`)
  }
  if (!points.every(isPoint)) {
    throw paintError(index, kind, `${label} has a point whose x or y is not a finite number`, 'send every point as {x, y} with finite numbers')
  }
  return points
}

/** A fixed number or a {start, end} pair whose numbers all satisfy `valid`. */
function checkRamp(
  value: PaintRamp | undefined,
  name: string,
  valid: (v: number) => boolean,
  rule: string,
  index: number,
  kind: string,
): PaintRamp | undefined {
  if (value === undefined) return undefined
  const ok = typeof value === 'object' && value !== null
    ? isFiniteNumber(value.start) && valid(value.start) && isFiniteNumber(value.end) && valid(value.end)
    : isFiniteNumber(value) && valid(value)
  if (!ok) throw paintError(index, kind, `${name} must be a number or {start, end} ${rule}`, `change ${name} to a value ${rule}`)
  return value
}

function checkUnit(value: number | undefined, name: string, index: number, kind: string): number | undefined {
  if (value === undefined) return undefined
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw paintError(index, kind, `${name} must be a number from 0 to 1`, `change ${name} to a value from 0 to 1`)
  }
  return value
}

function buildPaintHoles(holes: PaintHoleItem[] | undefined, index: number, toO: (p: Point) => Point): PaintHoleItem[] | undefined {
  if (holes === undefined) return undefined
  if (!Array.isArray(holes)) throw paintError(index, 'fill', 'holes must be an array', 'send holes as a list of {points}')
  return holes.map((hole, h) => {
    const pts = checkPointList(hole?.points, 3, index, 'fill', `hole ${h + 1}`)
    return { points: pts.map(toO), ...(hole.smooth === true ? { smooth: true } : {}) }
  })
}

function buildPaintStroke(item: PaintItem, index: number, offset: McpOffset): Stroke {
  const toO = (p: Point) => toOverlay(p, offset)
  const id = crypto.randomUUID()
  const kind = (item as { kind?: unknown })?.kind
  if (kind === 'brush') {
    const brush = item as PaintBrushItem
    const points = checkPointList(brush.points, 2, index, 'brush', 'a brush stroke')
    const width = checkRamp(brush.width, 'width', (v) => v > 0, 'above zero', index, 'brush') ?? DEFAULT_LINE_WIDTH
    const opacity = checkRamp(brush.opacity, 'opacity', (v) => v >= 0 && v <= 1, 'from 0 to 1', index, 'brush')
    const hardness = checkUnit(brush.hardness, 'hardness', index, 'brush')
    const stroke: Stroke = {
      id,
      tool: PAINT_BRUSH_TOOL_ID,
      points: points.map(toO),
      style: {
        color: brush.color ?? DEFAULT_COLOR,
        lineWidth: typeof width === 'number' ? width : Math.max(width.start, width.end),
        lineCap: 'round',
        lineJoin: 'round',
      },
      smooth: brush.smooth === true,
      width,
    }
    if (typeof opacity === 'number') stroke.opacity = opacity
    else if (opacity) stroke.opacityRange = { start: opacity.start, end: opacity.end }
    if (hardness !== undefined) stroke.hardness = hardness
    return stroke
  }
  if (kind === 'fill') {
    const fill = item as PaintFillItem
    const opacity = checkUnit(fill.opacity, 'opacity', index, 'fill')
    const hardness = checkUnit(fill.hardness, 'hardness', index, 'fill')
    const holes = buildPaintHoles(fill.holes, index, toO)
    let points: Point[]
    let shapeType: 'polygon' | 'rect' | 'ellipse'
    let smooth = false
    if (fill.shape === 'polygon') {
      points = checkPointList(fill.points, 3, index, 'fill', 'a polygon').map(toO)
      shapeType = 'polygon'
      smooth = fill.smooth === true
    } else if (fill.shape === 'rect' || fill.shape === 'ellipse') {
      const { x, y, width, height } = fill
      if (![x, y, width, height].every(isFiniteNumber) || width <= 0 || height <= 0) {
        throw paintError(index, 'fill', `a ${fill.shape} needs finite x, y and a width and height above zero`, 'send x, y, width and height as numbers')
      }
      points = [toO({ x, y }), toO({ x: x + width, y: y + height })]
      shapeType = fill.shape
    } else {
      throw paintError(index, 'fill', 'shape must be polygon, rect or ellipse', 'set shape to one of those')
    }
    const stroke: Stroke = {
      id,
      tool: PAINT_FILL_TOOL_ID,
      points,
      style: { color: fill.color ?? DEFAULT_COLOR, lineWidth: 1, lineCap: 'round', lineJoin: 'round' },
      shapeType,
      smooth,
    }
    if (holes && holes.length > 0) stroke.holes = holes
    if (opacity !== undefined) stroke.opacity = opacity
    if (hardness !== undefined) stroke.hardness = hardness
    return stroke
  }
  throw paintError(index, String(kind), 'kind must be brush or fill', 'set kind to brush or fill')
}

/** Build every stroke of a batch first, so a bad item rejects the whole batch before anything is added. */
function buildPaintStrokes(command: Extract<McpCommand, { type: 'paint' }>): Stroke[] {
  const items = command.items
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('A paint command needs at least one item. Next step: send items with one or more brush or fill entries. Nothing was drawn.')
  }
  const offset = command.offset ?? { x: 0, y: 0 }
  return items.map((item, i) => buildPaintStroke(item, i, offset))
}

function kindOf(stroke: Stroke): string {
  if (stroke.tool === PAINT_BRUSH_TOOL_ID) return 'brush'
  if (stroke.tool === PAINT_FILL_TOOL_ID) return 'fill'
  if (stroke.tool === HIGHLIGHTER_TOOL_ID) return 'highlighter'
  if (stroke.tool === 'shape') return typeof stroke.shapeType === 'string' ? stroke.shapeType : 'rect'
  return stroke.tool
}

function sourceOf(stroke: Stroke): string {
  if (stroke.tool === PAINT_BRUSH_TOOL_ID || stroke.tool === PAINT_FILL_TOOL_ID) return 'openpen'
  const builtin = BUILTIN_SOURCES[stroke.tool]
  if (builtin) return builtin
  const owner = getSlotEntries<{ id: string }>('canvas.tools').value.find((e) => e.contribution.id === stroke.tool)
  return owner?.moduleId || stroke.tool || 'unknown'
}

function boundsOf(stroke: Stroke, offset: McpOffset): McpAnnotation['bounds'] {
  const r = dpr()
  const xs = stroke.points.map((p) => p.x * r + offset.x)
  const ys = stroke.points.map((p) => p.y * r + offset.y)
  if (xs.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

/** Plugin tool calls running in this overlay, so a cancel can reach the right handler. */
const inFlightCalls = new Map<string, AbortController>()

function overlayDisplayId(): number {
  const raw = new URLSearchParams(window.location.search).get('displayId')
  const id = raw === null ? NaN : Number(raw)
  return Number.isInteger(id) ? id : -1
}

// The slot store hands out readonly reactive proxies. A zod schema behind such a
// proxy cannot parse (its frozen internals break the proxy invariants), so tools
// are always unwrapped to the plain objects the plugin registered.
function pluginTools(): Array<{ pluginId: string; tool: McpToolDefinition }> {
  return getSlotEntries<McpToolDefinition>('system.mcp.tools').value
    .map((e) => ({ pluginId: e.moduleId, tool: toRaw(e.contribution) }))
}

function findPluginTool(pluginId: string, name: string): McpToolDefinition | undefined {
  return pluginTools().find((e) => e.pluginId === pluginId && e.tool?.name === name)?.tool
}

function pluginToolLogger(pluginId: string): McpToolContext['log'] {
  return (level, message) => {
    const text = `[mcp] plugin ${pluginId}: ${message}`
    if (level === 'info') console.info(text)
    else {
      console.error(text)
      window.openPenApi?.recordError?.({ level, message: text, source: 'mcp-plugin-tool' })
    }
  }
}

function declaresDisplayId(tool: McpToolDefinition): boolean {
  const shape = (tool.inputSchema as { shape?: Record<string, unknown> } | undefined)?.shape
  return !!shape && Object.prototype.hasOwnProperty.call(shape, 'displayId')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function runPluginToolCall(command: Extract<McpCommand, { type: 'plugin-tool-call' }>): Promise<McpCallResult> {
  const tool = findPluginTool(command.pluginId, command.name)
  if (!tool) {
    return {
      isError: true,
      errorKind: 'not_found',
      content: [{ type: 'text', text: `Tool ${command.name} of plugin ${command.pluginId} is not loaded. Next step: call tools/list for the tools that are available.` }],
    }
  }
  const controller = new AbortController()
  inFlightCalls.set(command.callId, controller)
  const offset = command.offset ?? { x: 0, y: 0 }
  const ctx: McpToolContext = {
    displayId: overlayDisplayId(),
    signal: controller.signal,
    // Same conversion the built-in draw tools use, so plugin and built-in drawings line up.
    toCanvas: (point) => toOverlay(point, offset),
    reportProgress: (progress, total, message) => {
      window.openPenApi?.mcpSendToolProgress({
        callId: command.callId,
        progress,
        ...(total !== undefined ? { total } : {}),
        ...(message !== undefined ? { message } : {}),
      })
    },
    log: pluginToolLogger(command.pluginId),
  }
  // The host strips `displayId` from the arguments (it picks the overlay). A plugin
  // schema that declares `displayId` itself would then fail its own validation, so
  // hand it the real value of this overlay.
  const args = declaresDisplayId(tool) && isPlainRecord(command.args)
    ? { ...command.args, displayId: ctx.displayId }
    : command.args
  try {
    return await runMcpTool(tool, args, ctx)
  } finally {
    inFlightCalls.delete(command.callId)
  }
}

export async function executeMcpCommand(command: McpCommand): Promise<McpCommandResult> {
  switch (command.type) {
    case 'plugin-tool-call':
      return runPluginToolCall(command)
    case 'plugin-tool-cancel':
      inFlightCalls.get(command.callId)?.abort()
      return { ok: true }
    case 'ping':
      // Readiness probe from main: answered only once this bridge is subscribed
      // (after the modules loaded). Repaint whatever the store already holds.
      await requestRedraw()
      return { ready: true }
    case 'draw': {
      const stroke = buildStroke(command)
      // Same path as a manually drawn stroke: store + ADD_STROKE history entry.
      addStroke(stroke)
      pushCommand({ type: 'ADD_STROKE', stroke })
      await requestRedraw()
      return { id: stroke.id }
    }
    case 'paint': {
      const strokes = buildPaintStrokes(command)
      // One history entry for the whole batch: a single undo removes all of it,
      // and a large batch cannot push the user's earlier history out of the limit.
      for (const stroke of strokes) addStroke(stroke)
      pushCommand({ type: 'ADD_STROKES', strokes: [...strokes] })
      await requestRedraw()
      return { ids: strokes.map((s) => s.id) }
    }
    case 'list':
      return {
        annotations: getAllStrokes().map((s) => ({
          id: s.id,
          kind: kindOf(s),
          bounds: boundsOf(s, command.offset ?? { x: 0, y: 0 }),
          sourcePlugin: sourceOf(s),
        })),
      }
    case 'delete': {
      // purgeStroke is what the stroke eraser uses: undo / redo cannot bring it back.
      const deleted = purgeStroke(command.id)
      if (deleted) await requestRedraw()
      return { deleted }
    }
    case 'clear': {
      // Mirrors CanvasEngine.clearCanvas: record CLEAR_ALL so it is undoable.
      const strokes = getAllStrokes()
      if (strokes.length > 0) pushCommand({ type: 'CLEAR_ALL', strokes: [...strokes] })
      clearAll()
      await requestRedraw()
      return { ok: true }
    }
    case 'undo': {
      const ok = storeUndo()
      await requestRedraw()
      return { ok }
    }
    case 'redo': {
      const ok = storeRedo()
      await requestRedraw()
      return { ok }
    }
  }
}

/**
 * Subscribe to commands forwarded by the main process. The preload reports the
 * resolved value (or a thrown error) back to the waiting MCP tool call.
 * Returns an unsubscribe function.
 */
export function initMcpToolBridge(): () => void {
  const unsub = window.openPenApi?.onMcpCommand((command) => executeMcpCommand(command as unknown as McpCommand))
  return unsub ?? (() => {})
}

/** Title shown to people: a key in the plugin's own locales for the current language, else as written. */
function resolveToolTitle(pluginId: string, title: string): string {
  const key = `${sanitizeIdForI18n(pluginId)}.${title}`
  return i18n.global.te(key) ? String(i18n.global.t(key)) : title
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = { ...(z.toJSONSchema(schema) as Record<string, unknown>) }
  delete converted.$schema
  return converted
}

/**
 * Describe every plugin MCP tool this overlay's modules declare, as plain data
 * for the main process (plugin code never runs there). Every overlay reports;
 * main keeps the one from the primary display. Call once the module runtime has
 * loaded all modules.
 */
export function reportPluginTools(): void {
  const tools: McpPluginToolReport[] = []
  const guides: Record<string, string> = {}
  for (const { pluginId, tool } of pluginTools()) {
    let inputJsonSchema: Record<string, unknown>
    let outputJsonSchema: Record<string, unknown> | undefined
    try {
      inputJsonSchema = toJsonSchema(tool.inputSchema)
      outputJsonSchema = tool.outputSchema ? toJsonSchema(tool.outputSchema) : undefined
    } catch (err) {
      pluginToolLogger(pluginId)('error', `tool "${tool.name}" was not reported: its schema cannot be converted to JSON Schema (${String(err)})`)
      continue
    }
    tools.push({
      pluginId,
      name: tool.name,
      ...(tool.title ? { title: resolveToolTitle(pluginId, tool.title) } : {}),
      description: tool.description,
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
      inputJsonSchema,
      ...(outputJsonSchema ? { outputJsonSchema } : {}),
    })
    const guide = getModule(pluginId)?.mcpGuide
    if (typeof guide === 'string' && guide !== '') guides[pluginId] = guide
  }
  window.openPenApi?.mcpReportPluginTools({ displayId: overlayDisplayId(), tools, guides })
}
