/**
 * TASK-241: committed strokes are kept in an offscreen cache, so adding a
 * stroke draws only that stroke instead of every stroke on screen; external
 * redraw requests are merged into one per frame; a restored GPU context
 * repaints from the stroke store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CanvasEngine } from '../../src/services/canvas-engine'
import { addStroke, clearAll, pushCommand, resetHistory, undo } from '../../src/services/stroke-store'
import { resetContributionStore } from '../../src/core/runtime/contribution-store'
import type { Stroke } from '@openpen/module-api'

/** Every 2D context records the x of each stroked path's first point. */
const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof makeCtx>>()
const strokedX: number[] = []
let mainClears = 0

function makeCtx(canvas: HTMLCanvasElement) {
  let firstX = 0
  return {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(() => { if (canvas.dataset.main) mainClears++ }),
    beginPath: vi.fn(),
    moveTo: vi.fn((x: number) => { firstX = x }),
    lineTo: vi.fn(),
    stroke: vi.fn(() => { strokedX.push(firstX) }),
    drawImage: vi.fn(),
  }
}

function stroke(i: number): Stroke {
  return {
    id: `s${i}`,
    tool: 'freehand',
    points: [{ x: i, y: 0 }, { x: i + 5, y: 10 }],
    style: { color: '#f00', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
  }
}

function add(i: number): void {
  const s = stroke(i)
  addStroke(s)
  pushCommand({ type: 'ADD_STROKE', stroke: s })
}

function makeEngine() {
  const canvas = document.createElement('canvas')
  canvas.dataset.main = '1'
  return { engine: new CanvasEngine(canvas), canvas }
}

let rafQueue: FrameRequestCallback[] = []
function runFrame(): void {
  const q = rafQueue
  rafQueue = []
  for (const cb of q) cb(performance.now())
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this)
    if (!ctx) { ctx = makeCtx(this); contexts.set(this, ctx) }
    return ctx as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement['getContext'])
  clearAll()
  resetHistory()
  resetContributionStore()
  strokedX.length = 0
  mainClears = 0
  rafQueue = []
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('canvas-engine committed-stroke cache (TASK-241)', () => {
  it('draws only the new stroke when one is added on top of many', () => {
    const { engine } = makeEngine()
    for (let i = 0; i < 200; i++) add(i)
    engine.redrawAll()
    strokedX.length = 0

    add(999)
    engine.redrawAll()
    expect(strokedX).toEqual([999])
  })

  it('rebuilds from the store when a stroke is removed, so the removed stroke is gone', () => {
    const { engine } = makeEngine()
    for (let i = 0; i < 5; i++) add(i)
    engine.redrawAll()
    undo() // removes s4
    strokedX.length = 0

    engine.redrawAll()
    expect(strokedX).toEqual([0, 1, 2, 3])
  })

  it('merges several redraw requests in one frame into a single repaint', () => {
    const { engine } = makeEngine()
    add(1)
    mainClears = 0
    engine.requestRedraw()
    engine.requestRedraw()
    engine.requestRedraw()
    expect(mainClears).toBe(0)
    runFrame()
    expect(mainClears).toBe(1)
  })

  it('does not wipe a stroke being drawn when a merged repaint lands mid-stroke; repaints on pointer-up instead', () => {
    const { engine } = makeEngine()
    add(1)
    engine.redrawAll()
    const directTool = {
      id: 'pen',
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(() => null),
    }
    engine.setActiveTool(directTool as never)
    engine.handlePointerDown({ x: 0, y: 0 }, { color: '#f00', lineWidth: 4, lineCap: 'round', lineJoin: 'round' })
    add(2) // e.g. an agent adds a stroke while the user is drawing
    mainClears = 0
    engine.requestRedraw()
    runFrame()
    expect(mainClears).toBe(0)
    engine.handlePointerUp({ x: 1, y: 1 })
    expect(mainClears).toBe(1)
  })

  it('repaints every stroke from the store after the GPU context is restored', () => {
    const { engine, canvas } = makeEngine()
    for (let i = 0; i < 3; i++) add(i)
    engine.redrawAll()
    strokedX.length = 0

    canvas.dispatchEvent(new Event('contextrestored'))
    runFrame()
    expect(strokedX).toEqual([0, 1, 2])
  })
})
