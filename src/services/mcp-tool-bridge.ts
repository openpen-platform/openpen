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
import { addStroke, clearAll, getAllStrokes, pushCommand, purgeStroke, undo as storeUndo, redo as storeRedo } from './stroke-store'
import { emit, hasListeners } from '../core/runtime/event-bus'
import { getSlotEntries } from '../core/runtime/contribution-store'

type DrawShape = 'freehand' | 'line' | 'rect' | 'ellipse' | 'highlighter'

/** Top-left of the target display in screenshot pixels (absent = 0,0). */
export interface McpOffset { x: number; y: number }

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
  | { type: 'ping' }
  | { type: 'list'; offset?: McpOffset }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'plugin-tool-call'; callId: string; pluginId: string; name: string; args?: unknown }
  | { type: 'plugin-tool-cancel'; callId: string }

export interface McpAnnotation {
  id: string
  kind: string
  bounds: { x: number; y: number; width: number; height: number }
  sourcePlugin: string
}

export type McpCommandResult =
  | { id: string }
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

function kindOf(stroke: Stroke): string {
  if (stroke.tool === HIGHLIGHTER_TOOL_ID) return 'highlighter'
  if (stroke.tool === 'shape') return typeof stroke.shapeType === 'string' ? stroke.shapeType : 'rect'
  return stroke.tool
}

function sourceOf(stroke: Stroke): string {
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
  const ctx: McpToolContext = {
    displayId: overlayDisplayId(),
    signal: controller.signal,
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
