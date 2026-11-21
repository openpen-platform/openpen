import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { on } from '../../src/core/runtime/event-bus'
import { executeMcpCommand } from '../../src/services/mcp-tool-bridge'
import { getAllStrokes, clearAll, resetHistory, canUndo, canRedo } from '../../src/services/stroke-store'

// Expected values derive from the acceptance criteria and the "Interfaces"
// section of build-plan.md: command coordinates are screenshot pixels, the
// overlay works in CSS pixels, so overlay = pixel / devicePixelRatio.
const DPR = 2

function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true, writable: true })
}

function bbox(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

async function drawRect(x: number, y: number, width: number, height: number) {
  return (await executeMcpCommand({ type: 'draw', shape: 'rect', x, y, width, height })) as { id: string }
}

let originalDpr: number

beforeEach(() => {
  originalDpr = window.devicePixelRatio
  setDpr(DPR)
  clearAll()
  resetHistory()
})

afterEach(() => {
  setDpr(originalDpr)
  clearAll()
  resetHistory()
})

describe('mcp-tool-bridge', () => {
  describe('AC-6 draw at the screenshot position', () => {
    it('AC-6: each of the five shapes lands at screenshot pixels / devicePixelRatio', async () => {
      const cases: Array<[string, Record<string, unknown>, { x0: number; y0: number; x1: number; y1: number }]> = [
        ['freehand', { points: [{ x: 100, y: 200 }, { x: 300, y: 260 }, { x: 400, y: 600 }] }, { x0: 100, y0: 200, x1: 400, y1: 600 }],
        ['line', { from: { x: 120, y: 80 }, to: { x: 520, y: 480 } }, { x0: 120, y0: 80, x1: 520, y1: 480 }],
        ['rect', { x: 200, y: 300, width: 400, height: 100 }, { x0: 200, y0: 300, x1: 600, y1: 400 }],
        ['ellipse', { x: 50, y: 70, width: 300, height: 200 }, { x0: 50, y0: 70, x1: 350, y1: 270 }],
        ['highlighter', { points: [{ x: 10, y: 20 }, { x: 410, y: 20 }] }, { x0: 10, y0: 20, x1: 410, y1: 20 }]
      ]
      for (const [shape, args, px] of cases) {
        clearAll()
        await executeMcpCommand({ type: 'draw', shape, ...args } as never)
        const strokes = getAllStrokes()
        expect(strokes, shape).toHaveLength(1)
        const b = bbox(strokes[0].points)
        expect(b.minX, shape).toBeCloseTo(px.x0 / DPR, 5)
        expect(b.minY, shape).toBeCloseTo(px.y0 / DPR, 5)
        expect(b.maxX, shape).toBeCloseTo(px.x1 / DPR, 5)
        expect(b.maxY, shape).toBeCloseTo(px.y1 / DPR, 5)
        // Same bounding box also fits a different shape, so check the kind too.
        const listed = (await executeMcpCommand({ type: 'list' })) as { annotations: Array<{ kind: string }> }
        expect(listed.annotations.map((x) => x.kind), shape).toEqual([shape])
      }
    })

    it('AC-6: draw adds exactly one stroke and returns its id; earlier strokes stay put', async () => {
      const first = await drawRect(10, 10, 100, 100)
      const before = getAllStrokes().map((s) => ({ id: s.id, points: JSON.stringify(s.points) }))
      const second = await drawRect(500, 500, 40, 40)
      const after = getAllStrokes()
      expect(after).toHaveLength(2)
      expect(after.map((s) => s.id)).toContain(second.id)
      expect(second.id).not.toBe(first.id)
      expect(after.slice(0, 1).map((s) => ({ id: s.id, points: JSON.stringify(s.points) }))).toEqual(before)
    })
  })

  describe('AC-9 list annotations', () => {
    it('AC-9: list returns id, kind, bounds (screenshot pixels) and sourcePlugin for every annotation', async () => {
      const a = await drawRect(200, 300, 400, 100)
      const b = (await executeMcpCommand({
        type: 'draw', shape: 'line', from: { x: 20, y: 20 }, to: { x: 220, y: 20 }
      })) as { id: string }
      const result = (await executeMcpCommand({ type: 'list' })) as {
        annotations: Array<{ id: string; kind: string; bounds: { x: number; y: number; width: number; height: number }; sourcePlugin: unknown }>
      }
      expect(result.annotations).toHaveLength(2)
      const byId = new Map(result.annotations.map((x) => [x.id, x]))
      expect([...byId.keys()].sort()).toEqual([a.id, b.id].sort())
      expect(byId.get(a.id)!.kind).toBe('rect')
      expect(byId.get(a.id)!.sourcePlugin).toBe('@openpen/shape')
      expect(byId.get(b.id)!.kind).toBe('line')
      expect(byId.get(b.id)!.sourcePlugin).toBe('@openpen/line')
      // Bounds are reported back in the same pixel space the agent drew in.
      const rect = byId.get(a.id)!.bounds
      expect(rect.x).toBeCloseTo(200, 0)
      expect(rect.y).toBeCloseTo(300, 0)
      expect(rect.width).toBeCloseTo(400, 0)
      expect(rect.height).toBeCloseTo(100, 0)
    })

    it('AC-9: an empty canvas lists no annotations', async () => {
      const result = (await executeMcpCommand({ type: 'list' })) as { annotations: unknown[] }
      expect(result.annotations).toEqual([])
    })
  })

  describe('AC-10 delete one annotation by id', () => {
    it('AC-10: deleting one id removes only that stroke', async () => {
      const a = await drawRect(10, 10, 50, 50)
      const b = await drawRect(100, 100, 50, 50)
      const c = await drawRect(200, 200, 50, 50)
      const result = (await executeMcpCommand({ type: 'delete', id: b.id })) as { deleted: boolean }
      expect(result.deleted).toBe(true)
      expect(getAllStrokes().map((s) => s.id)).toEqual([a.id, c.id])
    })

    it('AC-10: an unknown id deletes nothing and reports deleted:false', async () => {
      const a = await drawRect(10, 10, 50, 50)
      const result = (await executeMcpCommand({ type: 'delete', id: 'no-such-id' })) as { deleted: boolean }
      expect(result.deleted).toBe(false)
      expect(getAllStrokes().map((s) => s.id)).toEqual([a.id])
    })
  })

  describe('AC-11 clear / undo / redo mirror the manual operations', () => {
    it('AC-11: clear empties the canvas and is undoable; undo restores, redo clears again', async () => {
      const a = await drawRect(10, 10, 50, 50)
      const b = await drawRect(100, 100, 50, 50)

      await executeMcpCommand({ type: 'clear' })
      expect(getAllStrokes()).toHaveLength(0)

      await executeMcpCommand({ type: 'undo' })
      expect(getAllStrokes().map((s) => s.id).sort()).toEqual([a.id, b.id].sort())
      expect(canRedo()).toBe(true)

      await executeMcpCommand({ type: 'redo' })
      expect(getAllStrokes()).toHaveLength(0)
    })

    it('AC-11: a stroke drawn by the agent is undoable and redoable like a manual one', async () => {
      const mine = await drawRect(10, 10, 50, 50)
      expect(canUndo()).toBe(true)
      await executeMcpCommand({ type: 'undo' })
      expect(getAllStrokes()).toHaveLength(0)
      await executeMcpCommand({ type: 'redo' })
      expect(getAllStrokes().map((s) => s.id)).toEqual([mine.id])
    })
  })


  describe('the canvas shows the stroke when draw returns', () => {
    it('draw resolves only after the overlay reports the repaint done', async () => {
      let painted: (() => void) | null = null
      const off = on('canvas-redraw-requested', (payload) => {
        painted = (payload as { onPainted?: () => void } | undefined)?.onPainted ?? null
      })
      try {
        let settled = false
        const pending = executeMcpCommand({ type: 'draw', shape: 'rect', x: 0, y: 0, width: 10, height: 10 }).then(() => { settled = true })
        await new Promise((r) => setTimeout(r, 20))
        expect(settled).toBe(false)
        expect(painted).not.toBeNull()
        painted!()
        await pending
        expect(settled).toBe(true)
      } finally {
        off()
      }
    })

    it('ping replies once the repaint is reported, without waiting for another frame', async () => {
      const off = on('canvas-redraw-requested', (payload) => {
        (payload as { onPainted?: () => void } | undefined)?.onPainted?.()
      })
      vi.stubGlobal('requestAnimationFrame', () => 0) // frames never come
      try {
        const started = Date.now()
        await executeMcpCommand({ type: 'ping' })
        expect(Date.now() - started).toBeLessThan(50)
      } finally {
        vi.unstubAllGlobals()
        off()
      }
    })

    it('replies without waiting when the overlay is hidden, while still asking for the repaint', async () => {
      const requests: unknown[] = []
      const off = on('canvas-redraw-requested', (payload) => { requests.push(payload) })
      const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      try {
        const reply = await executeMcpCommand({ type: 'draw', shape: 'rect', x: 0, y: 0, width: 10, height: 10 })
        expect(reply).toHaveProperty('id')
        expect(requests).toHaveLength(1)
      } finally {
        if (visibility) Object.defineProperty(document, 'visibilityState', visibility)
        else delete (document as unknown as Record<string, unknown>).visibilityState
        off()
      }
    })
  })
})
