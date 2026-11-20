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
import type { Point, Stroke } from '@openpen/module-api'
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

/** Resolves after the next paint opportunity (bounded: a throttled window may never fire rAF). */
function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100)
    requestAnimationFrame(() => { clearTimeout(timer); resolve() })
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

export async function executeMcpCommand(command: McpCommand): Promise<McpCommandResult> {
  switch (command.type) {
    case 'ping':
      // Readiness probe from main: answered only once this bridge is subscribed
      // (after the modules loaded). Repaint whatever the store already holds.
      await requestRedraw()
      await nextFrame()
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
