import { describe, it, expect, vi } from 'vitest'
import { createBuiltinTools, SERVER_INSTRUCTIONS } from '../../electron/mcp/tools.js'

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

const DRAW_TOOLS = ['draw_freehand', 'draw_line', 'draw_rect', 'draw_ellipse', 'draw_highlighter']
const PURPOSE = /good for|best for|use (it )?for|suited|suitable|ideal for|useful for/i

describe('AC-22 get_guide states tool limits and what each tool is for', () => {
  it('AC-22 guide covers outline-only shapes, round caps, translucent colours, per-tool purpose line and section order', async () => {
    const res = await byName(createBuiltinTools(makeHost()), 'openpen__get_guide').handler({})
    expect(res.isError).not.toBe(true)
    const text = textOf(res)
    const lines = text.split('\n')
    const drawNamesIn = (s) => s.match(/draw_[a-z]+/g) ?? []

    // rect / ellipse: outline only, not filled (stated on the line naming the tool)
    for (const tool of ['draw_rect', 'draw_ellipse']) {
      expect(
        lines.some((s) => s.includes(tool) && /outline/i.test(s) && /not filled|no fill|outline only|unfilled/i.test(s)),
        `${tool} outline-only`,
      ).toBe(true)
    }
    // round line ends
    expect(text).toMatch(/\bround\b[^\n.]*\b(cap|caps|end|ends)\b|\b(cap|caps|end|ends)\b[^\n.]*\bround\b/i)
    // translucent notations spelled out with alpha: rgba, hsla and 8-digit hex
    expect(/rgba/i.test(text) && /hsla/i.test(text) && /8-digit hex|#RRGGBBAA|eight[- ]digit/i.test(text), 'rgba/hsla/8-digit hex').toBe(true)
    expect(lines.some((s) => /alpha/i.test(s) && /rgba/i.test(s)), 'alpha explained next to rgba').toBe(true)

    // each of the five drawing tools has its own line saying what it is good for
    for (const tool of DRAW_TOOLS) {
      expect(
        lines.some((s) => s.length >= 20 && s.length <= 400 && s.includes(tool) && drawNamesIn(s).length === 1 && PURPOSE.test(s)),
        `${tool} has its own purpose line`,
      ).toBe(true)
    }

    // section headings: only "## " lines count, and they must be exactly these six, in this order
    const headings = lines.filter((s) => s.startsWith('## ')).map((s) => s.trim())
    expect(headings).toEqual([
      '## Coordinates and colours',
      '## Tools: limits and what each is good for',
      '## Composing a drawing',
      '## Painting',
      '## Example',
      '## Checking your work',
      '## Common mistakes',
    ])

    // concrete content the guide must spell out
    expect(text, 'lineWidth must be > 0').toMatch(/lineWidth[^\n]*(>\s*0|greater than (0|zero)|positive|above (0|zero))/i)
    expect(text, 'list before delete').toMatch(/list[^\n]*(before|first)[^\n]*delet|delet[^\n]*(after|only after)[^\n]*list|before[^\n]*delet[^\n]*list/i)
    expect(text, 'background to foreground').toMatch(/background[^\n]*(to|then|before)[^\n]*foreground/i)
    expect(text, 'curves use freehand with many points').toMatch(/(curve|organic)[^\n]*freehand|freehand[^\n]*(curve|organic)/i)
    expect(text, 'no separate opacity parameter').toMatch(/no (separate|standalone|dedicated|independent)[^\n]*(opacity|alpha|transparency)|(opacity|alpha|transparency) (parameter|param)[^\n]*(not|no)|there is no[^\n]*(opacity|transparency)/i)
    expect(text, 'alpha range 0 to 1').toMatch(/alpha[^\n]*\b0\b[^\n]*\b1\b|\b0\b[^\n]*\b1\b[^\n]*alpha/i)

    // plugins are not part of this batch
    expect(text).not.toMatch(/plugin/i)
  })

  it('AC-22 instructions and tool descriptions stay within size, carry each tool\'s own limit and never name other tools', () => {
    // server instructions
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(1000)
    expect(SERVER_INSTRUCTIONS.startsWith('Before you start, call openpen__get_guide.')).toBe(true)
    expect(SERVER_INSTRUCTIONS).not.toMatch(/plugin/i)

    const tools = createBuiltinTools(makeHost())
    const shortNames = tools.map((t) => t.name.replace(/^openpen__/, ''))
    const namedTools = shortNames.filter((n) => n.includes('_'))
    for (const tool of tools) {
      const own = tool.name.replace(/^openpen__/, '')
      const d = tool.description
      expect(d.length, `${own} description length`).toBeLessThanOrEqual(2048)
      expect(d, `${own} mentions no plugin`).not.toMatch(/plugin/i)
      expect(d, `${own} has no openpen__ prefix`).not.toContain('openpen__')
      for (const other of namedTools.filter((n) => n !== own)) {
        expect(d, `${own} names ${other}`).not.toContain(other)
      }
    }

    // each drawing tool states its own limit
    const desc = (n) => byName(tools, 'openpen__' + n).description
    for (const n of ['draw_rect', 'draw_ellipse']) {
      expect(desc(n), `${n} outline`).toMatch(/outline/i)
      expect(desc(n), `${n} not filled`).toMatch(/not filled|no fill|unfilled|does not fill/i)
    }
    for (const n of ['draw_freehand', 'draw_line']) {
      expect(desc(n), `${n} round ends`).toMatch(/\bround\b[^.]*\b(cap|caps|end|ends)\b|\b(cap|caps|end|ends)\b[^.]*\bround\b/i)
    }
    expect(desc('draw_highlighter')).toMatch(/translucent|semi-transparent/i)
  })
})
