/**
 * Unit tests for the overlay `paint` command in mcp-tool-bridge.ts and
 * batch undo/redo/purge behavior (ADD_STROKES) in stroke-store.ts.
 *
 * Expected overlay command wire shape (per build-plan.md <Interfaces>):
 * {
 *   type: 'paint',
 *   offset?: { x: number; y: number },
 *   items: Array<PaintStrokeItem | PaintFillItem>,
 * } -> { ids: string[] }
 *
 * Proposed item discriminant (see report for TL alignment between RD1 and RD2):
 * - PaintStrokeItem: { kind: 'brush', points, smooth?, color?, width?, opacity?, hardness? }
 * - PaintFillItem:   { kind: 'fill', shape: 'polygon', points, smooth?, holes?, color?, opacity?, hardness? }
 *                  | { kind: 'fill', shape: 'rect' | 'ellipse', x, y, width, height, holes?, color?, opacity?, hardness? }
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { on } from '../../src/core/runtime/event-bus'
import { executeMcpCommand } from '../../src/services/mcp-tool-bridge'
import { getAllStrokes, clearAll, resetHistory, canUndo, canRedo } from '../../src/services/stroke-store'

const DPR = 2

function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true, writable: true })
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

describe('AC-4 overlay paint batch command', () => {
  it('AC-4: paint adds all items in order with CSS-pixel coords, triggers one redraw, lists kind/source, and undoes/redoes the whole batch in one step', async () => {
    // Seed one earlier annotation to prove batch undo leaves prior strokes intact.
    const earlier = (await executeMcpCommand({
      type: 'draw',
      shape: 'rect',
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    })) as { id: string }

    let redrawRequests = 0
    const off = on('canvas-redraw-requested', (payload) => {
      redrawRequests++
      ;(payload as { onPainted?: () => void } | undefined)?.onPainted?.()
    })

    try {
      const reply = (await executeMcpCommand({
        type: 'paint',
        items: [
          {
            kind: 'brush',
            points: [{ x: 100, y: 200 }, { x: 300, y: 400 }],
            smooth: true,
            color: '#ff0000',
            width: { start: 4, end: 12 },
            opacity: { start: 0.3, end: 0.9 },
            hardness: 0.5,
          },
          {
            kind: 'fill',
            shape: 'polygon',
            points: [{ x: 20, y: 20 }, { x: 220, y: 20 }, { x: 220, y: 220 }, { x: 20, y: 220 }],
            smooth: false,
            holes: [{ points: [{ x: 60, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 140 }] }],
            color: '#00aa00',
            opacity: 0.7,
            hardness: 1,
          },
          {
            kind: 'fill',
            shape: 'rect',
            x: 400,
            y: 100,
            width: 200,
            height: 100,
            color: '#0000ff',
          },
        ],
      } as never)) as { ids: string[] }

      expect(redrawRequests, 'batch triggers exactly one redraw').toBe(1)
      expect(reply.ids).toHaveLength(3)
      expect(new Set(reply.ids).size).toBe(3)

      const strokes = getAllStrokes()
      expect(strokes.map((s) => s.id)).toEqual([earlier.id, ...reply.ids])

      // Verify tool ids, DPR coordinate conversion (screenshot px / DPR), and preserved paint metadata.
      const brushStroke = strokes[1] as unknown as Record<string, unknown>
      expect(strokes[1].tool).toBe('mcp-paint-brush')
      expect(strokes[1].points).toEqual([{ x: 50, y: 100 }, { x: 150, y: 200 }])
      expect(brushStroke.smooth).toBe(true)
      // Widths are screenshot px too: 4 and 12 at DPR 2 are 2 and 6 CSS px.
      expect(brushStroke.width).toEqual({ start: 2, end: 6 })
      expect(brushStroke.hardness).toBe(0.5)
      expect(brushStroke.opacityRange).toEqual({ start: 0.3, end: 0.9 })
      expect(strokes[1].opacity).toBeUndefined()

      const polyFill = strokes[2] as unknown as Record<string, unknown>
      expect(strokes[2].tool).toBe('mcp-paint-fill')
      expect(strokes[2].points).toEqual([
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 110 },
        { x: 10, y: 110 },
      ])
      const holes = polyFill.holes as Array<{ points: Array<{ x: number; y: number }> }>
      expect(holes).toHaveLength(1)
      expect(holes[0].points).toEqual([{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }])

      const rectFill = strokes[3] as unknown as Record<string, unknown>
      expect(strokes[3].tool).toBe('mcp-paint-fill')
      expect(rectFill.shapeType).toBe('rect')
      const rectXs = strokes[3].points.map((p) => p.x)
      const rectYs = strokes[3].points.map((p) => p.y)
      expect(strokes[3].points.length).toBeGreaterThanOrEqual(2)
      expect(Math.min(...rectXs)).toBeCloseTo(200, 5)
      expect(Math.min(...rectYs)).toBeCloseTo(50, 5)
      expect(Math.max(...rectXs)).toBeCloseTo(300, 5)
      expect(Math.max(...rectYs)).toBeCloseTo(100, 5)

      // list_annotations reports kind 'brush' / 'fill', sourcePlugin 'openpen', and bounds in screenshot px.
      const listed = (await executeMcpCommand({ type: 'list' })) as {
        annotations: Array<{
          id: string
          kind: string
          sourcePlugin: string
          bounds: { x: number; y: number; width: number; height: number }
        }>
      }
      const byId = new Map(listed.annotations.map((a) => [a.id, a]))
      expect(byId.get(reply.ids[0])?.kind).toBe('brush')
      expect(byId.get(reply.ids[0])?.sourcePlugin).toBe('openpen')
      expect(byId.get(reply.ids[0])?.bounds).toEqual({ x: 100, y: 200, width: 200, height: 200 })
      expect(byId.get(reply.ids[1])?.kind).toBe('fill')
      expect(byId.get(reply.ids[1])?.sourcePlugin).toBe('openpen')
      expect(byId.get(reply.ids[2])?.kind).toBe('fill')
      expect(byId.get(reply.ids[2])?.sourcePlugin).toBe('openpen')

      // Single undo removes the entire batch while keeping the earlier stroke.
      expect(canUndo()).toBe(true)
      await executeMcpCommand({ type: 'undo' })
      expect(getAllStrokes().map((s) => s.id)).toEqual([earlier.id])

      // Single redo restores the entire batch in the original order.
      expect(canRedo()).toBe(true)
      await executeMcpCommand({ type: 'redo' })
      expect(getAllStrokes().map((s) => s.id)).toEqual([earlier.id, ...reply.ids])

      // Deleting one stroke from the batch also purges it from the ADD_STROKES history entry.
      const del = (await executeMcpCommand({ type: 'delete', id: reply.ids[1] })) as { deleted: boolean }
      expect(del.deleted).toBe(true)
      await executeMcpCommand({ type: 'undo' })
      expect(getAllStrokes().map((s) => s.id)).toEqual([earlier.id])
      await executeMcpCommand({ type: 'redo' })
      expect(getAllStrokes().map((s) => s.id)).toEqual([earlier.id, reply.ids[0], reply.ids[2]])
    } finally {
      off()
    }
  })

  it('AC-4: if any item in a paint batch fails to build, no strokes are added and existing strokes remain unchanged', async () => {
    await executeMcpCommand({ type: 'draw', shape: 'rect', x: 10, y: 10, width: 40, height: 40 })
    const before = JSON.stringify(getAllStrokes())

    await expect(
      executeMcpCommand({
        type: 'paint',
        items: [
          {
            kind: 'brush',
            points: [{ x: 10, y: 10 }, { x: 80, y: 80 }],
            color: '#ff0000',
          },
          // Invalid item: polygon requires at least 3 points.
          {
            kind: 'fill',
            shape: 'polygon',
            points: [{ x: 10, y: 10 }],
          },
        ],
      } as never),
    ).rejects.toThrow()

    expect(JSON.stringify(getAllStrokes())).toBe(before)
  })
})
