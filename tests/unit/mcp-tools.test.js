import { describe, it, expect, vi } from 'vitest'
import {
  BUILTIN_TOOL_NAMES,
  createBuiltinTools,
} from '../../electron/mcp/tools.js'

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

describe('AC-15 usage guide', () => {
  it('AC-15 get_guide returns usage text that mentions every body tool', async () => {
    const tools = createBuiltinTools(makeHost())
    const res = await byName(tools, 'openpen__get_guide').handler({})
    expect(res.isError).not.toBe(true)
    const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    for (const name of BUILTIN_TOOL_NAMES) expect(text).toContain(name)
  })
})

describe('AC-16 invalid arguments => error with next step, canvas untouched', () => {
  it('AC-16 missing required field => isError with guidance, runOnOverlay never called', async () => {
    const host = makeHost()
    const res = await byName(createBuiltinTools(host), 'openpen__draw_rect').handler({ x: 10, y: 10, height: 50 })
    expect(res.isError).toBe(true)
    const text = res.content[0].text
    expect(text).toContain('1920')
    expect(text).toContain('1080')
    expect(text).toMatch(/screenshot/i)
    expect(text).toMatch(/range/i)
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })

  it('AC-16 coordinates outside the display => isError with guidance, runOnOverlay never called', async () => {
    const host = makeHost()
    const res = await byName(createBuiltinTools(host), 'openpen__draw_rect').handler({ x: 5000, y: 10, width: 50, height: 50 })
    expect(res.isError).toBe(true)
    const text = res.content[0].text
    expect(text).toContain('1920')
    expect(text).toContain('1080')
    expect(text).toMatch(/screenshot/i)
    expect(text).toMatch(/range/i)
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })
})
