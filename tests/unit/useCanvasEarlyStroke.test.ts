/**
 * useCanvasEarlyStroke.test.ts: a stroke drawn before the drawing tools are
 * registered is kept.
 *
 * After the overlay renderer reloads (crash recovery), the canvas mounts and
 * takes drawing mode before the module runtime registers the tools in
 * `canvas.tools`. A stroke drawn in that gap must still land once the tool
 * is there.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

// Stand-in for CanvasEngine with the same contract as the real one: pointer
// input is ignored while no tool is active, and setting a tool aborts the
// stroke in flight. Records the strokes it actually committed.
const { engines, FakeEngine } = vi.hoisted(() => {
  const engines: InstanceType<typeof FakeEngine>[] = []
  class FakeEngine {
    activeTool: unknown = null
    drawing = false
    current: Array<{ x: number; y: number }> = []
    committed: Array<Array<{ x: number; y: number }>> = []
    constructor() { engines.push(this) }
    setFadeRemovedListener() {}
    setFadeSeconds() {}
    getFadeHolds() { return {} }
    setActiveTool(tool: unknown) { this.drawing = false; this.activeTool = tool }
    handlePointerDown(p: { x: number; y: number }) {
      if (!this.activeTool) return
      this.drawing = true
      this.current = [p]
    }
    handlePointerMove(p: { x: number; y: number }) {
      if (!this.activeTool || !this.drawing) return
      this.current.push(p)
    }
    handlePointerUp(p: { x: number; y: number }) {
      if (!this.activeTool || !this.drawing) return
      this.drawing = false
      this.current.push(p)
      this.committed.push(this.current)
    }
    destroy() {}
  }
  return { engines, FakeEngine }
})
vi.mock('../../src/services/canvas-engine', () => ({ CanvasEngine: FakeEngine }))

import { useCanvas } from '../../src/composables/useCanvas'
import { registerContribution, resetContributionStore } from '../../src/core/runtime/contribution-store'

const Host = defineComponent({
  setup() {
    const { canvasRef } = useCanvas()
    return () => h('canvas', { ref: canvasRef })
  },
})

function fire(canvas: Element, type: string, x: number, y: number): void {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as MouseEvent & { pointerId: number }
  Object.defineProperty(e, 'pointerId', { value: 1 })
  canvas.dispatchEvent(e)
}

describe('useCanvas: stroke drawn before the tools register', () => {
  beforeEach(() => {
    engines.length = 0
    resetContributionStore()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  })

  it('keeps a stroke drawn in the gap and draws it once the tool registers', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const canvas = wrapper.element
    const engine = engines[0]

    fire(canvas, 'pointerdown', 10, 10)
    fire(canvas, 'pointermove', 20, 15)
    fire(canvas, 'pointerup', 30, 20)
    expect(engine.committed).toEqual([])

    registerContribution('canvas.tools', '@openpen/freehand', { id: 'freehand' })
    // A later tool registering must not abort or duplicate the replayed stroke.
    registerContribution('canvas.tools', '@openpen/highlighter', { id: 'highlighter' })
    await nextTick()

    expect(engine.committed).toEqual([[{ x: 10, y: 10 }, { x: 20, y: 15 }, { x: 30, y: 20 }]])
    wrapper.unmount()
  })

  it('still commits a long gap stroke whose moves overflow the buffer', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const canvas = wrapper.element
    const engine = engines[0]

    fire(canvas, 'pointerdown', 0, 0)
    for (let i = 1; i <= 10_050; i++) fire(canvas, 'pointermove', i % 500, 5)
    fire(canvas, 'pointerup', 400, 300)

    registerContribution('canvas.tools', '@openpen/freehand', { id: 'freehand' })
    await nextTick()

    expect(engine.committed).toHaveLength(1)
    expect(engine.committed[0].at(-1)).toEqual({ x: 400, y: 300 })
    wrapper.unmount()
  })

  it('on Linux keeps the stroke-in-progress hold until the gap stroke is replayed', async () => {
    const notifyStrokeActive = vi.fn()
    const api = new Proxy({} as Record<string, unknown>, {
      get(_, prop: string) {
        if (prop === 'platform') return 'linux'
        if (prop === 'notifyStrokeActive') return notifyStrokeActive
        if (prop === 'getSettings') return () => Promise.resolve(null)
        if (prop.startsWith('on')) return () => () => {}
        return () => {}
      },
    })
    vi.stubGlobal('openPenApi', api)
    try {
      const wrapper = mount(Host, { attachTo: document.body })
      const canvas = wrapper.element

      fire(canvas, 'pointerdown', 10, 10)
      fire(canvas, 'pointerup', 30, 20)
      // Not committed yet: main must still see the stroke as in progress.
      expect(notifyStrokeActive.mock.calls).toEqual([[true]])

      registerContribution('canvas.tools', '@openpen/freehand', { id: 'freehand' })
      await nextTick()

      expect(engines[0].committed).toHaveLength(1)
      expect(notifyStrokeActive.mock.calls).toEqual([[true], [false]])
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
