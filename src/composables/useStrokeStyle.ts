/**
 * useStrokeStyle — global stroke style state (singleton composable).
 *
 * Backed by the renderer event bus: writes emit
 * `stroke-style-changed` (consumed by useCanvas) and reads expose a
 * readonly view of the local mirror. ControlBar / Settings tabs use
 * this composable; canvas-engine / overlay reads via the same
 * `stroke-style-changed` events into its own merged style object.
 */

import { ref, readonly } from 'vue'
import type { StrokeColor } from '../types/tool-types'
import { emit as eventBusEmit, on as eventBusOn } from '../core/runtime/event-bus'

const colorRef = ref<StrokeColor>('#818cf8')
const lineWidthRef = ref(4)

// Stay in sync with patches emitted by other consumers (e.g. modules
// that ship their own pickers in the future).
eventBusOn('stroke-style-changed', (payload) => {
  const patch = payload as { color?: StrokeColor; lineWidth?: number } | null
  if (!patch || typeof patch !== 'object') return
  if (patch.color !== undefined) colorRef.value = patch.color
  if (typeof patch.lineWidth === 'number') {
    lineWidthRef.value = Math.max(1, Math.min(20, Math.round(patch.lineWidth)))
  }
})

function plainColor(color: StrokeColor): StrokeColor {
  // Linear gradient objects are reactive proxies inside Vue; emit a
  // plain copy so downstream code never accidentally mutates the source.
  return typeof color === 'object' && color !== null
    ? { type: color.type, from: color.from, to: color.to }
    : color
}


function broadcast(): void {
  // Cross-window: ControlBar lives in the main window; the canvas in
  // the overlay window. The IPC broadcast keeps the overlay's mirror
  // in sync.
  window.openPenApi?.setStrokeStyle({
    color: plainColor(colorRef.value),
    lineWidth: lineWidthRef.value,
  })
}

export function useStrokeStyle() {
  function setColor(color: StrokeColor): void {
    colorRef.value = color
    eventBusEmit('stroke-style-changed', { color: plainColor(color) })
    broadcast()
  }

  function setLineWidth(w: number): void {
    const clamped = Math.max(1, Math.min(20, Math.round(w)))
    lineWidthRef.value = clamped
    eventBusEmit('stroke-style-changed', { lineWidth: clamped })
    broadcast()
  }

  return {
    color: readonly(colorRef),
    lineWidth: readonly(lineWidthRef),
    setColor,
    setLineWidth,
  }
}
