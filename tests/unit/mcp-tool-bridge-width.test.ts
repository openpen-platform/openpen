import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { executeMcpCommand } from '../../src/services/mcp-tool-bridge'
import { getAllStrokes, clearAll, resetHistory } from '../../src/services/stroke-store'

// Widths are screenshot pixels like coordinates. A screenshot pixel is one
// physical pixel, so on a 150% display the overlay (CSS px) must use width/1.5
// to look as thick as the same request does at 100%.
function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true, writable: true })
}

let originalDpr: number
beforeEach(() => {
  originalDpr = window.devicePixelRatio
  clearAll()
  resetHistory()
})
afterEach(() => {
  setDpr(originalDpr)
  clearAll()
  resetHistory()
})

/** Physical (screen) thickness of the stroke just drawn: CSS width times the display scale. */
async function physicalWidth(dpr: number, command: Record<string, unknown>): Promise<number> {
  setDpr(dpr)
  clearAll()
  await executeMcpCommand(command as never)
  const stroke = getAllStrokes()[0]
  const w = typeof stroke.width === 'number' ? stroke.width : stroke.style.lineWidth
  return w * dpr
}

const FREEHAND = { type: 'draw', shape: 'freehand', points: [{ x: 10, y: 10 }, { x: 90, y: 40 }], lineWidth: 6 }

describe('stroke width follows the display scale', () => {
  it('draw: the same lineWidth is the same physical thickness at 100% and 150%', async () => {
    const at100 = await physicalWidth(1, FREEHAND)
    const at150 = await physicalWidth(1.5, FREEHAND)
    expect(at100).toBeCloseTo(6, 6)
    expect(at150).toBeCloseTo(at100, 6)
  })

  it('draw: the stored CSS width is smaller at 150% (negative: not left unscaled)', async () => {
    setDpr(1.5)
    await executeMcpCommand(FREEHAND as never)
    expect(getAllStrokes()[0].style.lineWidth).toBeCloseTo(4, 6)
  })
})
