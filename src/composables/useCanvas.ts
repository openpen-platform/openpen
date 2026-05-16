/**
 * useCanvas — bridge between OverlayView and CanvasEngine.
 *
 * Hybrid data flow:
 *   - Cross-window IPC paths — triggered from main window or global shortcuts:
 *     onToolConfigChanged / onStrokeStyleChanged / onClearCanvasRequested /
 *     onUndo / onRedo. Triggered by ControlBar in the main window or by
 *     main-side global shortcuts; they hit the overlay's renderer here.
 *   - Renderer event-bus paths — used by modules in the same renderer:
 *     `tool-changed` / `stroke-style-changed` / `canvas-redraw-requested`.
 *     Used by built-in modules and plugins that live in the same renderer.
 *
 * Both paths funnel into the same internal state (currentStyle, active
 * tool lookup) so the engine sees one coherent picture regardless of
 * the trigger source.
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { ToolContribution } from '@openpen/module-api'
import { CanvasEngine } from '../services/canvas-engine'
import { canUndo, canRedo } from '../services/stroke-store'
import type { StrokeStyle } from '../types/tool-types'
import { emit as eventBusEmit, on as eventBusOn } from '../core/runtime/event-bus'
import { getSlotEntries } from '../core/runtime/contribution-store'

const DEFAULT_STYLE: StrokeStyle = {
  color: '#818cf8',
  lineWidth: 4,
  lineCap: 'round',
  lineJoin: 'round',
}

const currentStyle: StrokeStyle = { ...DEFAULT_STYLE }
let currentToolConfig: { tool: string; shapeType?: string; filled?: boolean; eraserMode?: 'brush' | 'stroke' } = { tool: 'freehand' }

export function useCanvas() {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const activeToolId = ref<string | null>(null)
  const isDrawingMode = ref(false)
  let engine: CanvasEngine | null = null
  let pointerDown = false

  const unsubs: Array<() => void> = []

  let rafPending = false
  let pendingPointer: { point: { x: number; y: number }; modifiers: { shiftKey: boolean } } | null = null

  function toPoint(e: PointerEvent) {
    return { x: e.clientX, y: e.clientY }
  }

  function findToolById(toolId: string): ToolContribution | undefined {
    return getSlotEntries<ToolContribution>('canvas.tools').value.find(
      (e) => e.contribution.id === toolId
    )?.contribution
  }

  // Hide strategy splits across two surfaces.
  //
  // Canvas: `cursor: none` is held *constant* — the canvas is the
  // primary surface macOS evaluates while drawing mode is on
  // (`pointer-events: auto`), so keeping the rule stable removes the
  // transition window where macOS WindowServer occasionally fails to
  // honour the new rule and the OS cursor stays visible.
  //
  // Body: toggled. When drawing mode is off the overlay enters
  // passthrough but the window itself is still visually on top —
  // macOS still consults the overlay's body cursor for the area not
  // covered by the now-pointer-events:none canvas. Holding body
  // `cursor: none` permanently would hide the OS cursor every time
  // the user is not actively drawing.
  function applyCursor(): void {
    const canvas = canvasRef.value
    if (!canvas) return
    canvas.style.cursor = 'none'
    document.body.style.cursor = isDrawingMode.value ? 'none' : ''
  }

  function syncActiveTool(): void {
    if (!engine) return
    if (!activeToolId.value) return
    const tool = findToolById(activeToolId.value)
    if (tool) engine.setActiveTool(tool)
  }

  function reportHistoryState(): void {
    window.openPenApi?.reportHistoryState({
      canUndo: canUndo(),
      canRedo: canRedo(),
    })
  }

  function applyToolConfig(config: { tool: string; shapeType?: string; filled?: boolean; eraserMode?: 'brush' | 'stroke' }): void {
    currentToolConfig = { ...config }
    // 'eraser' + eraserMode:'stroke' is the legacy IPC payload for stroke-eraser;
    // map it to the real tool id so canvas.tools lookup succeeds.
    const resolvedToolId = config.tool === 'eraser' && config.eraserMode === 'stroke'
      ? 'stroke-eraser'
      : config.tool
    activeToolId.value = resolvedToolId
    syncActiveTool()
    applyCursor()
    emitDebugOverlayState(config)
    eventBusEmit('tool-changed', { ...config })
  }

  // E2E and devtools introspection hook: mirror the active tool config
  // onto window.__OPENPEN_DEBUG__.overlay so tests can wait for tool
  // changes without poking IPC internals.
  function emitDebugOverlayState(config: { tool: string; eraserMode?: 'brush' | 'stroke' }): void {
    const isDebug =
      typeof import.meta !== 'undefined' &&
      (import.meta.env?.DEV || import.meta.env?.MODE === 'test')
    if (!isDebug || typeof window === 'undefined') return
    const existing =
      typeof window.__OPENPEN_DEBUG__ === 'object' && window.__OPENPEN_DEBUG__ !== null
        ? window.__OPENPEN_DEBUG__
        : {}
    window.__OPENPEN_DEBUG__ = {
      ...existing,
      overlay: {
        activeTool: config.tool ?? 'freehand',
        eraserMode: config.tool === 'eraser' ? (config.eraserMode ?? 'brush') : null,
        timestamp: Date.now(),
      },
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (!engine) return
    pointerDown = true
    rafPending = false
    pendingPointer = null
    if (e.currentTarget && 'setPointerCapture' in e.currentTarget) {
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* setPointerCapture not supported */
      }
    }
    engine.handlePointerDown(toPoint(e), { ...currentStyle })
  }

  function onPointerMove(e: PointerEvent): void {
    if (!engine || !pointerDown) return
    pendingPointer = { point: toPoint(e), modifiers: { shiftKey: e.shiftKey } }
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      if (pendingPointer && pointerDown && engine) {
        const { point, modifiers } = pendingPointer
        pendingPointer = null
        engine.handlePointerMove(point, modifiers)
      }
    })
  }

  function onPointerUp(e: PointerEvent): void {
    if (!engine) return
    pointerDown = false
    pendingPointer = null
    engine.handlePointerUp(toPoint(e), { shiftKey: e.shiftKey })
    reportHistoryState()
  }

  onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    engine = new CanvasEngine(canvas)

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // ── Cross-window IPC paths ─────────────────────────────────────────
    const ipcUnsubs: Array<() => void> = []
    if (window.openPenApi) {
      const onTool = window.openPenApi.onToolConfigChanged((config) => {
        applyToolConfig(config)
      })
      ipcUnsubs.push(onTool)

      const onStyle = window.openPenApi.onStrokeStyleChanged((style) => {
        currentStyle.color = style.color
        currentStyle.lineWidth = style.lineWidth
      })
      ipcUnsubs.push(onStyle)

      const onClear = window.openPenApi.onClearCanvasRequested(() => {
        engine?.clearCanvas()
        reportHistoryState()
      })
      ipcUnsubs.push(onClear)

      const onUndoIpc = window.openPenApi.onUndo(() => {
        engine?.undo()
        reportHistoryState()
      })
      ipcUnsubs.push(onUndoIpc)

      const onRedoIpc = window.openPenApi.onRedo(() => {
        engine?.redo()
        reportHistoryState()
      })
      ipcUnsubs.push(onRedoIpc)

      const onDraw = window.openPenApi.onDrawingModeChanged((enabled) => {
        isDrawingMode.value = enabled
        applyCursor()
      })
      ipcUnsubs.push(onDraw)
    }
    unsubs.push(...ipcUnsubs)

    // ── Renderer event-bus paths (module architecture) ────────────────
    unsubs.push(
      eventBusOn('tool-changed', (payload) => {
        const p = payload as { tool?: string }
        if (typeof p?.tool === 'string' && p.tool !== currentToolConfig.tool) {
          // Only react when the bus carries a tool change that didn't
          // originate from us — applyToolConfig already emits this event.
          activeToolId.value = p.tool
          syncActiveTool()
          applyCursor()
        }
      })
    )

    unsubs.push(
      eventBusOn('stroke-style-changed', (payload) => {
        const patch = payload as Partial<StrokeStyle> | null | undefined
        if (!patch || typeof patch !== 'object') return
        Object.assign(currentStyle, patch)
      })
    )

    unsubs.push(
      eventBusOn('canvas-redraw-requested', () => {
        engine?.redrawAll()
        reportHistoryState()
      })
    )

    // Apply the initial tool config so the first stroke after boot has
    // an active tool (matches the original "default freehand" behaviour).
    applyToolConfig(currentToolConfig)
  })

  watch(activeToolId, () => {
    syncActiveTool()
    applyCursor()
  })

  // Re-sync when the canvas.tools slot population changes. useCanvas
  // mounts before modules load (App.vue → initModuleRuntime is async),
  // so the initial syncActiveTool call sees an empty slot. This watcher
  // re-runs the lookup once the freehand tool (etc.) registers.
  watch(
    () => getSlotEntries<ToolContribution>('canvas.tools').value.length,
    () => {
      if (activeToolId.value) syncActiveTool()
      applyCursor()
    }
  )

  function cleanup(): void {
    const canvas = canvasRef.value
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
    rafPending = false
    pendingPointer = null
    for (const u of unsubs) u()
    unsubs.length = 0
    engine?.destroy()
    engine = null
  }

  onUnmounted(cleanup)

  return { canvasRef, cleanup }
}
