/**
 * host-commands.ts — centralized dispatch point for host chrome / infrastructure commands.
 *
 * pin / clear-canvas / undo-redo / drawing-mode-toggle are host infrastructure,
 * not module contributions. All host UI MUST call these commands rather than
 * calling openPenApi.xxx() IPC directly.
 *
 */

import { useCollapseMode } from '../composables/useCollapseMode'

/** Toggle the control bar pin state (renderer-only; no IPC). */
function togglePin(): void {
  useCollapseMode().togglePin()
}

/** Clear the canvas and broadcast to the overlay. */
function clearCanvas(): void {
  window.openPenApi?.clearCanvas()
}

/** Undo the last stroke. */
function undo(): void {
  window.openPenApi?.triggerUndo()
}

/** Redo the last undone stroke. */
function redo(): void {
  window.openPenApi?.triggerRedo()
}

let drawingMode = false

/** Toggle drawing mode on the overlay canvas. */
function toggleDrawingMode(): void {
  drawingMode = !drawingMode
  window.openPenApi?.setDrawingMode(drawingMode)
}

/** Set drawing mode to a specific state. */
function setDrawingMode(enabled: boolean): void {
  drawingMode = enabled
  window.openPenApi?.setDrawingMode(enabled)
}

export const hostCommands = {
  controlBar: { togglePin },
  canvas: { clear: clearCanvas },
  history: { undo, redo },
  app: { toggleDrawingMode, setDrawingMode },
} as const
