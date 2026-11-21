// @vitest-environment node
/**
 * The screenshot guard on painting calls: the quota is kept per client (MCP
 * session), a screenshot only restores the quota of the client that took it,
 * and one batch can never carry a client past the limit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpHttpServer } from '../../electron/mcp/http-server.js'
import { STROKES_BEFORE_SCREENSHOT, createBuiltinTools } from '../../electron/mcp/tools.js'

const DISPLAY = { id: 7, pixelWidth: 1920, pixelHeight: 1080, scaleFactor: 1, isCursorDisplay: true }
const KEY = 'opk_' + 'c'.repeat(32)

function makeHost() {
  return {
    getState: () => ({ drawingMode: true, tool: 'freehand', displays: [DISPLAY] }),
    setDrawingMode: vi.fn(),
    setTool: vi.fn(),
    runOnOverlay: vi.fn(async (_id, command) => ({ ids: (command.items ?? []).map((_, i) => `p-${i}`) })),
    screenshot: vi.fn(async (displayId) => ({ data: 'PNG', mimeType: 'image/png', width: 1920, height: 1080, displayId })),
  }
}

const byName = (tools, name) => tools.find((t) => t.name === name)
const textOf = (res) => res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const strokes = (n) => Array.from({ length: n }, (_, i) => ({ points: [{ x: 10 + i, y: 20 }, { x: 50 + i, y: 60 }] }))

describe('screenshot guard quota (handler level)', () => {
  it('refuses a single batch that would pass the limit, without drawing anything', async () => {
    const host = makeHost()
    const paint = byName(createBuiltinTools(host), 'openpen__paint_strokes')
    const c = { clientId: 'agent-a' }
    await paint.handler({ strokes: strokes(STROKES_BEFORE_SCREENSHOT - 10) }, c)
    const calls = host.runOnOverlay.mock.calls.length

    const res = await paint.handler({ strokes: strokes(11) }, c)

    expect(res.isError).toBe(true)
    expect(textOf(res)).toContain('Send at most 10')
    expect(host.runOnOverlay).toHaveBeenCalledTimes(calls)
    // Boundary: exactly the remaining 10 is accepted.
    const exact = await paint.handler({ strokes: strokes(10) }, c)
    expect(exact.isError).not.toBe(true)
    expect(JSON.parse(textOf(exact)).strokesSinceScreenshot).toBe(STROKES_BEFORE_SCREENSHOT)
  })

})

describe('screenshot guard quota (two MCP sessions over HTTP)', () => {
  const open = []
  afterEach(async () => {
    while (open.length) await open.pop()()
  })

  async function connect(url) {
    const client = new Client({ name: 'agent', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${KEY}` } },
    })
    await client.connect(transport)
    open.push(() => client.close())
    return client
  }

  it('two agents painting at the same time each get their own quota', async () => {
    const tools = createBuiltinTools(makeHost())
    const srv = createMcpHttpServer({
      port: 0,
      getConfig: () => ({ enabled: true, apiKey: KEY, readOnly: false, exposeAll: true, enabledPlugins: [] }),
      getTools: () => tools,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    })
    open.push(() => srv.stop())
    await srv.start()
    const url = srv.status().url
    const a = await connect(url)
    const b = await connect(url)
    const call = (c, n) => c.callTool({ name: 'openpen__paint_strokes', arguments: { strokes: strokes(n) } })

    const [fillA, fillB] = await Promise.all([call(a, STROKES_BEFORE_SCREENSHOT), call(b, STROKES_BEFORE_SCREENSHOT)])
    expect(fillA.isError).not.toBe(true)
    expect(fillB.isError).not.toBe(true)

    await a.callTool({ name: 'openpen__screenshot', arguments: {} })
    expect((await call(a, 1)).isError).not.toBe(true)
    expect((await call(b, 1)).isError).toBe(true)
  })
})
