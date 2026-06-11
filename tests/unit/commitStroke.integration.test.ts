/**
 * commitStroke integration tests.
 *
 * Exercises the REAL host `commitStroke` implementation injected by
 * `src/host-bootstrap.ts` against the REAL `src/services/stroke-store.ts`.
 * The proxy `commitStroke` from `@openpen/module-api/host` routes through the
 * registered host, so calling it runs the actual bootstrap closure:
 *   addStroke(stroke) -> pushCommand({type:'ADD_STROKE', stroke}) -> emit('canvas-redraw-requested')
 *
 * emit-count is verified by subscribing to the SAME renderer event-bus the
 * bootstrap closure emits on (`src/core/runtime/event-bus`), so the assertion
 * reflects a real broadcast, not a stubbed function.
 *
 * Undo precision is verified by driving the real store's undo/redo path: a
 * commit MUST push an ADD_STROKE command such that a single undo removes
 * exactly that stroke (by id), and a redo restores it.
 *
 * This file re-asserts the real host registration up-front so it is robust to
 * any sibling test file that swapped in a stub host within the same worker.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { commitStroke } from '@openpen/module-api/host'
import { _resetHostRegistryForTest } from '@openpen/module-api/host/registry'
import { bootstrapHost } from '../../src/host-bootstrap'
import { on } from '../../src/core/runtime/event-bus'
import {
  addStroke,
  getAllStrokes,
  clearAll,
  pushCommand,
  undo,
  redo,
  canUndo,
  canRedo,
  resetHistory,
  serializeState,
} from '../../src/services/stroke-store'
import type { Stroke } from '../../src/types/tool-types'

function makeStroke(id: string, extra: Record<string, unknown> = {}): Stroke {
  return {
    id,
    tool: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    style: { color: '#ff0000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
    ...extra,
  }
}

beforeAll(() => {
  // Guarantee the REAL bootstrap host is registered, regardless of whether a
  // sibling test file left a stub host on the shared globalThis registry.
  _resetHostRegistryForTest()
  bootstrapHost()
})

describe('commitStroke — integration with real stroke-store', () => {
  beforeEach(() => {
    clearAll()
    resetHistory()
  })

  it('appends the stroke to the store (getAllStrokes contains it)', () => {
    const strokeA = makeStroke('A')
    commitStroke(strokeA)

    const all = getAllStrokes()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('A')
    expect(all[0]).toBe(strokeA)
  })

  it('emits canvas-redraw-requested exactly once per commit', () => {
    let count = 0
    const unsubscribe = on('canvas-redraw-requested', () => {
      count += 1
    })

    commitStroke(makeStroke('A'))
    unsubscribe()

    expect(count).toBe(1)
  })

  it('emits canvas-redraw-requested once per call (two commits -> two emits)', () => {
    let count = 0
    const unsubscribe = on('canvas-redraw-requested', () => {
      count += 1
    })

    commitStroke(makeStroke('A'))
    commitStroke(makeStroke('B'))
    unsubscribe()

    expect(count).toBe(2)
    expect(getAllStrokes()).toHaveLength(2)
  })

  describe('undo precision', () => {
    it('a single undo removes exactly the committed stroke', () => {
      commitStroke(makeStroke('A'))
      expect(getAllStrokes()).toHaveLength(1)
      expect(canUndo()).toBe(true)

      const undone = undo()
      expect(undone).toBe(true)
      expect(getAllStrokes()).toHaveLength(0)
      expect(getAllStrokes().some((s) => s.id === 'A')).toBe(false)
    })

    it('undo removes only the committed stroke, leaving pre-existing strokes intact', () => {
      // A pre-existing stroke that was NOT committed via commitStroke.
      addStroke(makeStroke('pre'))
      expect(getAllStrokes()).toHaveLength(1)

      commitStroke(makeStroke('A'))
      expect(getAllStrokes()).toHaveLength(2)

      undo()

      const ids = getAllStrokes().map((s) => s.id)
      expect(ids).toEqual(['pre'])
      expect(ids).not.toContain('A')
    })

    it('redo restores the committed stroke after undo', () => {
      commitStroke(makeStroke('A'))
      undo()
      expect(getAllStrokes()).toHaveLength(0)
      expect(canRedo()).toBe(true)

      const redone = redo()
      expect(redone).toBe(true)
      const all = getAllStrokes()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe('A')
    })

    it('undoing two commits removes them in LIFO order', () => {
      commitStroke(makeStroke('A'))
      commitStroke(makeStroke('B'))
      expect(getAllStrokes().map((s) => s.id)).toEqual(['A', 'B'])

      undo()
      expect(getAllStrokes().map((s) => s.id)).toEqual(['A'])

      undo()
      expect(getAllStrokes()).toHaveLength(0)
    })
  })

  it('preserves custom open-index fields on the committed stroke (round-trip)', () => {
    const textStroke = makeStroke('T', { text: 'hello', fontSize: 24, opacity: 0.5 })
    commitStroke(textStroke)

    const stored = getAllStrokes().find((s) => s.id === 'T')
    expect(stored).toBeDefined()
    expect(stored?.text).toBe('hello')
    expect(stored?.fontSize).toBe(24)
    expect(stored?.opacity).toBe(0.5)
  })

  it('is not idempotent: committing the same stroke twice appends twice', () => {
    const strokeA = makeStroke('A')
    commitStroke(strokeA)
    commitStroke(strokeA)

    expect(getAllStrokes()).toHaveLength(2)
  })

  it('is semantically equivalent to the synchronous addStroke + pushCommand path', () => {
    // Path 1: commitStroke
    clearAll()
    resetHistory()
    commitStroke(makeStroke('A'))
    const viaCommit = serializeState()

    // Path 2: manual addStroke + ADD_STROKE pushCommand (the synchronous
    // tool-return path that canvas-engine's handlePointerUp takes). The real
    // path stores and records the SAME stroke object, so the manual path must
    // reuse one reference for both calls to mirror it.
    clearAll()
    resetHistory()
    const manualStroke = makeStroke('A')
    addStroke(manualStroke)
    pushCommand({ type: 'ADD_STROKE', stroke: manualStroke })
    const viaManual = serializeState()

    expect(viaCommit.strokes.map((s) => s.id)).toEqual(viaManual.strokes.map((s) => s.id))
    expect(viaCommit.undoStack).toEqual(viaManual.undoStack)
    expect(viaCommit.redoStack).toEqual(viaManual.redoStack)
  })
})
