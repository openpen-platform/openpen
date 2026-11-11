/**
 * The engine's default polyline renderer honours `Stroke.opacity`; strokes
 * without it keep the opaque look every existing tool and plugin relies on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CanvasEngine } from '../../src/services/canvas-engine'
import {
  addStroke,
  clearAll,
  pushCommand,
  resetHistory,
  undo,
  redo,
} from '../../src/services/stroke-store'
import { registerContribution, resetContributionStore } from '../../src/core/runtime/contribution-store'
import type { Stroke } from '@openpen/module-api'

/** Records `globalAlpha` at the moment each path is stroked, honouring save/restore. */
function makeRecordingCtx() {
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
  return { ctx, alphaAtStroke }
}

function makeEngine() {
  const { ctx, alphaAtStroke } = makeRecordingCtx()
  const canvas = document.createElement('canvas')
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext
  const engine = new CanvasEngine(canvas)
  return { engine, ctx, alphaAtStroke }
}

function stroke(id: string, extra: Partial<Stroke> = {}): Stroke {
  return {
    id,
    tool: 'highlighter',
    points: [{ x: 0, y: 0 }, { x: 40, y: 10 }],
    style: { color: '#ffd400', lineWidth: 12, lineCap: 'round', lineJoin: 'round' },
    ...extra,
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }))
  clearAll()
  resetHistory()
  resetContributionStore()
})

describe('canvas-engine default renderer + Stroke.opacity', () => {
  it('draws a stroke at its opacity, and keeps doing so after undo / redo (history parity with plain strokes)', () => {
    const { engine, alphaAtStroke } = makeEngine()
    const s = stroke('h1', { opacity: 0.4 })
    addStroke(s)
    pushCommand({ type: 'ADD_STROKE', stroke: s })

    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(alphaAtStroke).toEqual([0.4])

    undo()
    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(alphaAtStroke).toEqual([])

    redo()
    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(alphaAtStroke).toEqual([0.4])
  })

  it('strokes without opacity (plain pen, existing plugins) are drawn fully opaque and do not leak alpha to the next stroke', () => {
    const { engine, alphaAtStroke, ctx } = makeEngine()
    addStroke(stroke('h2', { opacity: 0.4 }))
    addStroke(stroke('p1', { tool: 'freehand' }))

    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(alphaAtStroke).toEqual([0.4, 1])
    expect(ctx.globalAlpha).toBe(1)
  })

  it('clamps opacity outside 0..1 back into range and ignores non-finite values, as the slot docs state', () => {
    const { engine, alphaAtStroke } = makeEngine()
    addStroke(stroke('c1', { opacity: 1.5 }))
    addStroke(stroke('c2', { opacity: -0.2 }))
    addStroke(stroke('c3', { opacity: Number.NaN }))

    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(alphaAtStroke).toEqual([1, 0, 1])
  })

  it('does not wrap a tool that ships its own renderStroke: the custom renderer runs and the engine applies no alpha of its own', () => {
    const { engine, alphaAtStroke } = makeEngine()
    const custom = vi.fn()
    registerContribution('canvas.tools', 'mod', { id: 'my-plugin-tool', renderStroke: custom })
    addStroke(stroke('x1', { tool: 'my-plugin-tool', opacity: 0.4 }))

    alphaAtStroke.length = 0
    engine.redrawAll()
    expect(custom).toHaveBeenCalledTimes(1)
    expect(alphaAtStroke).toEqual([])
  })
})
