/**
 * Stroke fade-out: strokes drawn while fading is on disappear after their hold
 * time and cannot come back through undo or redo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CanvasEngine } from '../../src/services/canvas-engine'
import {
  addStroke,
  clearAll,
  getAllStrokes,
  hydrateState,
  serializeState,
  pushCommand,
  purgeStroke,
  resetHistory,
  undo,
  redo,
} from '../../src/services/stroke-store'
import { resetContributionStore } from '../../src/core/runtime/contribution-store'
import { DEFAULT_SETTINGS } from '../../shared/settings-defaults.js'
import type { Stroke, Tool } from '@openpen/module-api'

function stroke(id: string): Stroke {
  return {
    id,
    tool: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 40, y: 10 }],
    style: { color: '#ffd400', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
  }
}

function makeEngine() {
  const alphaAtStroke: number[] = []
  const stack: number[] = []
  const ctx = {
    globalAlpha: 1,
    save: vi.fn(() => { stack.push(ctx.globalAlpha) }),
    restore: vi.fn(() => { ctx.globalAlpha = stack.pop() ?? 1 }),
    stroke: vi.fn(() => { alphaAtStroke.push(ctx.globalAlpha) }),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  }
  const canvas = document.createElement('canvas')
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext
  const engine = new CanvasEngine(canvas)
  let clock = 0
  engine.setClock(() => clock)
  let n = 0
  const tool = {
    onPointerDown: () => {},
    onPointerMove: () => false,
    onPointerUp: () => stroke(`s${++n}`),
  } as unknown as Tool
  engine.setActiveTool(tool)
  const draw = () => {
    engine.handlePointerDown({ x: 0, y: 0 }, stroke('x').style)
    engine.handlePointerUp({ x: 1, y: 1 })
  }
  /** Move the clock forward and run the fade timers that fall due. */
  const advance = (ms: number) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  return { engine, draw, advance, alphaAtStroke }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }))
  clearAll()
  resetHistory()
  resetContributionStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('settings defaults', () => {
  it('ships with stroke fade off and a 5 second hold', () => {
    expect(DEFAULT_SETTINGS.strokeFadeEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.strokeFadeSeconds).toBe(5)
  })
})

describe('purgeStroke', () => {
  it('removes the stroke so undo and redo cannot bring it back', () => {
    const s = stroke('a')
    addStroke(s)
    pushCommand({ type: 'ADD_STROKE', stroke: s })
    purgeStroke('a')
    expect(getAllStrokes()).toHaveLength(0)
    expect(undo()).toBe(false)
    expect(redo()).toBe(false)
    expect(getAllStrokes()).toHaveLength(0)
  })

  it('keeps the other strokes of a clear-all entry restorable', () => {
    pushCommand({ type: 'CLEAR_ALL', strokes: [stroke('a'), stroke('b')] })
    purgeStroke('a')
    expect(undo()).toBe(true)
    expect(getAllStrokes().map((s) => s.id)).toEqual(['b'])
  })
})

describe('CanvasEngine stroke fade', () => {
  it('removes a stroke after its hold time and fade, not before', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(2)
    draw()
    advance(1900)
    expect(getAllStrokes()).toHaveLength(1)
    advance(1200)
    expect(getAllStrokes()).toHaveLength(0)
  })

  it('draws a stroke partly transparent while it fades', () => {
    const { engine, draw, advance, alphaAtStroke } = makeEngine()
    engine.setFadeSeconds(1)
    draw()
    advance(1500)
    expect(getAllStrokes()).toHaveLength(1)
    const last = alphaAtStroke[alphaAtStroke.length - 1]
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThan(1)
  })

  it('keeps strokes forever when fading is off', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(1)
    draw() // countdown running
    engine.setFadeSeconds(null)
    draw() // drawn while off
    advance(120_000)
    expect(getAllStrokes()).toHaveLength(2)
  })

  it('applies a changed hold time only to strokes drawn afterwards', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(2)
    draw() // s1, hold 2s
    engine.setFadeSeconds(10)
    draw() // s2, hold 10s
    advance(3500)
    expect(getAllStrokes().map((s) => s.id)).toEqual(['s2'])
  })

  it('does not bring back a faded stroke on undo', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(1)
    draw()
    advance(2500)
    expect(getAllStrokes()).toHaveLength(0)
    engine.undo()
    expect(getAllStrokes()).toHaveLength(0)
  })

  it('restarts the hold time when an undone stroke is redone', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(2)
    draw()
    advance(1500)
    engine.undo()
    engine.redo()
    advance(1900) // 3.4s after drawing, 1.9s after redo
    expect(getAllStrokes()).toHaveLength(1)
    advance(1200)
    expect(getAllStrokes()).toHaveLength(0)
  })

  it('pauses the countdown on clear and restarts it when undo restores the strokes', () => {
    const { engine, draw, advance } = makeEngine()
    engine.setFadeSeconds(2)
    draw()
    advance(1000)
    engine.clearCanvas()
    advance(5000)
    engine.undo()
    expect(getAllStrokes()).toHaveLength(1)
    advance(1900)
    expect(getAllStrokes()).toHaveLength(1)
  })
})

describe('CanvasEngine stroke fade after the drawing is restored from a snapshot', () => {
  /** Save the drawing the way the overlay does, then rebuild it in a fresh engine. */
  function saveAndRebuild(first: ReturnType<typeof makeEngine>) {
    const snapshot = JSON.parse(JSON.stringify({ ...serializeState(), fade: first.engine.getFadeHolds() }))
    first.engine.destroy()
    clearAll()
    resetHistory()
    const second = makeEngine()
    hydrateState(snapshot)
    return { second, fade: snapshot.fade as Record<string, number> }
  }

  it('keeps fading restored strokes, restarting their hold time', () => {
    const first = makeEngine()
    first.engine.setFadeSeconds(2)
    first.draw()
    first.advance(1000)
    const { second, fade } = saveAndRebuild(first)
    second.engine.setFadeSeconds(2)
    second.engine.restoreFades(fade)
    second.engine.redrawAll()
    expect(getAllStrokes()).toHaveLength(1)
    second.advance(1900)
    expect(getAllStrokes()).toHaveLength(1)
    second.advance(1200)
    expect(getAllStrokes()).toHaveLength(0)
    expect(undo()).toBe(false)
  })

  it('leaves restored strokes alone when the setting is off', () => {
    const first = makeEngine()
    first.engine.setFadeSeconds(2)
    first.draw()
    const { second, fade } = saveAndRebuild(first)
    second.engine.setFadeSeconds(null)
    second.engine.restoreFades(fade)
    second.engine.redrawAll()
    second.advance(60_000)
    expect(getAllStrokes()).toHaveLength(1)
  })
})
