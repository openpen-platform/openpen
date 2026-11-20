import { describe, it, expect, vi } from 'vitest'
import { createBuiltinTools } from '../../electron/mcp/tools.js'

const DISPLAY = { id: 7, pixelWidth: 1920, pixelHeight: 1080, scaleFactor: 1, isCursorDisplay: true }

function makeHost() {
  return {
    getState: () => ({ drawingMode: true, tool: 'freehand', displays: [DISPLAY] }),
    setDrawingMode: vi.fn(),
    setTool: vi.fn(),
    runOnOverlay: vi.fn(async () => ({ id: 'stroke-1' })),
    screenshot: vi.fn(async () => ({ data: 'AAAA', mimeType: 'image/png', width: 1920, height: 1080, displayId: 7 })),
  }
}
const byName = (tools, name) => tools.find((t) => t.name === name)
const textOf = (res) => res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')

const VALID_ARGS = {
  openpen__draw_rect: { x: 100, y: 100, width: 200, height: 100 },
  openpen__draw_freehand: { points: [{ x: 10, y: 10 }, { x: 200, y: 120 }, { x: 400, y: 60 }] },
}

const drawRect = (color) => {
  const host = makeHost()
  return byName(createBuiltinTools(host), 'openpen__draw_rect')
    .handler({ ...VALID_ARGS.openpen__draw_rect, color })
    .then((res) => ({ res, host }))
}

const COLORS = [
  'rgb(255,0,0)',
  'rgba(150,105,60,0.45)',
  'hsl(200,50%,50%)',
  'hsla(200,50%,50%,0.4)',
  '#FF000080',
  'red',
]

describe('AC-21 every documented colour notation is drawn as given', () => {
  it('AC-21 rgb / rgba / hsl / hsla / 8-digit hex / name are accepted and forwarded unchanged', async () => {
    for (const toolName of Object.keys(VALID_ARGS)) {
      for (const color of COLORS) {
        const host = makeHost()
        const res = await byName(createBuiltinTools(host), toolName).handler({ ...VALID_ARGS[toolName], color })
        expect(res.isError, `${toolName} ${color}: ${textOf(res)}`).not.toBe(true)
        expect(host.runOnOverlay, `${toolName} ${color}`).toHaveBeenCalledTimes(1)
        const command = host.runOnOverlay.mock.calls[0][1]
        expect(command.color).toBe(color.trim())
      }
    }
  })

  it('AC-21 a non-colour string is still rejected with a colour error and nothing is drawn', async () => {
    const { res, host } = await drawRect('notacolor')
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/colour/i)
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })

  // Regression: a hostile colour string must not trigger catastrophic regex backtracking.
  it('AC-21 a pathological colour string is rejected quickly, and an over-long one is rejected as a colour error', async () => {
    const n = '1'.repeat(500)
    const evil = 'rgb(' + [n, n, n, n].join(',') + 'x'
    const start = performance.now()
    const { res, host } = await drawRect(evil)
    const elapsed = performance.now() - start
    expect(res.isError).toBe(true)
    expect(elapsed, `took ${elapsed}ms`).toBeLessThan(200)
    expect(host.runOnOverlay).not.toHaveBeenCalled()

    const long = await drawRect('#' + 'a'.repeat(64))
    expect(long.res.isError).toBe(true)
    expect(textOf(long.res)).toMatch(/colour/i)
    expect(long.host.runOnOverlay).not.toHaveBeenCalled()
  }, 5000)

  // Regression: notations canvas does not understand would silently draw as another colour.
  it('AC-21 rejects notations canvas would silently misread', async () => {
    for (const color of ['hsl(200,50,50)', 'rgb(1,2 3)', 'rgb(10deg,2,3)', 'hsl(50%,50%,50%)', 'rgb(1.,2,3)']) {
      const { res, host } = await drawRect(color)
      expect(res.isError, `${color} should be rejected`).toBe(true)
      expect(host.runOnOverlay, color).not.toHaveBeenCalled()
    }
  })

  it('AC-21 accepts the further notations canvas understands', async () => {
    for (const color of ['rgb(1 2 3 / 50%)', 'hsl(200deg 50% 50%)', 'hsl(200,50%,50%)', 'RGB(255,0,0)', '#f008', 'rgb(100%,0%,0%)']) {
      const { res, host } = await drawRect(color)
      expect(res.isError, `${color}: ${textOf(res)}`).not.toBe(true)
      expect(host.runOnOverlay, color).toHaveBeenCalledTimes(1)
    }
  })
})
