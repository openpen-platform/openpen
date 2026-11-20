import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { PassThrough } from 'node:stream'
import { createMcpHttpServer } from '../../electron/mcp/http-server.js'
import { createBuiltinTools } from '../../electron/mcp/tools.js'
import { MCP_HOST, MCP_PORT, MCP_PATH } from '../../shared/mcp-constants.js'
import {
  createBridge,
  attachStdio,
  DEFAULT_URL,
  CHECK_TOOL,
} from '../../claude-desktop/server/bridge.mjs'
import { installClaudeDesktopBundle } from '../../electron/mcp/claude-desktop-bundle.js'

const ROOT = path.resolve(__dirname, '../..')
const KEY = 'opk_' + 'a'.repeat(32)
const WRONG = 'opk_' + 'z'.repeat(32)

const host = {
  getState: () => ({ drawingMode: false, tool: 'freehand', displays: [] }),
  setDrawingMode() {},
  setTool() {},
  runOnOverlay: async () => ({}),
  screenshot: async () => ({ data: '', mimeType: 'image/png', width: 1, height: 1, displayId: 1 }),
}
const silent = { info() {}, warn() {}, error() {}, debug() {} }

const servers = []
async function startOpenPen(port = 0) {
  const srv = createMcpHttpServer({
    port,
    getConfig: () => ({ enabled: true, apiKey: KEY, readOnly: false, exposeAll: true, enabledPlugins: [] }),
    getTools: () => createBuiltinTools(host),
    logger: silent,
  })
  servers.push(srv)
  await srv.start()
  return srv
}
afterEach(async () => {
  while (servers.length) await servers.pop().stop()
})

/** A loopback port nothing listens on (OpenPen not running / MCP switch off). */
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } } }
const list = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
const call = (name, args = {}) => ({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })
const textOf = (res) => res.result.content.map((c) => c.text).join('\n')

describe('AC-1/AC-2 the .mcpb connects Claude Desktop to the local OpenPen', () => {
  it('relays initialize, tools/list and tools/call over stdio to OpenPen when the key is right', async () => {
    const srv = await startOpenPen()
    const bridge = createBridge({ url: srv.status().url, apiKey: KEY, logger: silent })
    const input = new PassThrough()
    const output = new PassThrough()
    attachStdio(bridge, input, output)
    const lines = []
    output.on('data', (c) => lines.push(...String(c).split('\n').filter(Boolean)))

    input.write(JSON.stringify(initialize) + '\n')
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    input.write(JSON.stringify(list) + '\n')
    input.write(JSON.stringify(call('openpen__get_state')) + '\n')
    await expect.poll(() => lines.length, { timeout: 5000 }).toBe(3)

    const byId = Object.fromEntries(lines.map((l) => JSON.parse(l)).map((m) => [m.id, m]))
    expect(byId[1].result.serverInfo.name).toBe('openpen')
    expect(byId[1].result.instructions).toMatch(/openpen__get_guide/)
    const names = byId[2].result.tools.map((t) => t.name)
    expect(names).toContain('openpen__draw_ellipse')
    expect(names).not.toContain(CHECK_TOOL)
    expect(byId[3].result.isError).toBeFalsy()
  })

  it('ships an official-format manifest that passes the key to the bridge and targets the fixed local endpoint', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'claude-desktop/manifest.json'), 'utf8'))
    for (const field of ['manifest_version', 'name', 'version', 'description', 'author', 'server']) {
      expect(manifest[field], field).toBeTruthy()
    }
    expect(manifest.server.type).toBe('node')
    expect(fs.existsSync(path.join(ROOT, 'claude-desktop', manifest.server.entry_point))).toBe(true)
    expect(manifest.server.mcp_config.args).toEqual([`\${__dirname}/${manifest.server.entry_point}`])
    expect(manifest.server.mcp_config.env.OPENPEN_API_KEY).toBe('${user_config.api_key}')
    expect(manifest.user_config.api_key).toMatchObject({ type: 'string', sensitive: true, required: true })
    expect(manifest.compatibility.platforms).toEqual(expect.arrayContaining(['darwin', 'win32']))
    expect(DEFAULT_URL).toBe(`http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`)
  })

  // Regression (review): the key must only ever be sent to OpenPen on this computer.
  it('refuses any target other than loopback HTTP', () => {
    expect(() => createBridge({ url: 'http://example.com:17639/mcp', apiKey: KEY })).toThrow(/this computer/)
    expect(() => createBridge({ url: 'https://127.0.0.1:17639/mcp', apiKey: KEY })).toThrow(/this computer/)
  })
})

describe('AC-3 wrong key', () => {
  it('stays connected and answers a tool call with isError telling the user to copy the key from OpenPen settings', async () => {
    const srv = await startOpenPen()
    const bridge = createBridge({ url: srv.status().url, apiKey: WRONG, logger: silent })

    const init = await bridge.handle(initialize)
    expect(init.result.serverInfo.name).toBe('openpen')
    const tools = (await bridge.handle(list)).result.tools.map((t) => t.name)
    expect(tools).toEqual([CHECK_TOOL])

    for (const name of [CHECK_TOOL, 'openpen__draw_ellipse']) {
      const res = await bridge.handle(call(name))
      expect(res.result.isError).toBe(true)
      expect(textOf(res)).toMatch(/API key/)
      expect(textOf(res)).toMatch(/OpenPen Settings > MCP/)
      expect(textOf(res)).toMatch(/copy/i)
    }
  })
})

describe('AC-4 OpenPen not running or MCP switched off', () => {
  it('answers a tool call with isError telling the user to turn on MCP in OpenPen settings', async () => {
    const bridge = createBridge({ url: `http://127.0.0.1:${await freePort()}/mcp`, apiKey: KEY, logger: silent })

    expect((await bridge.handle(initialize)).result.serverInfo.name).toBe('openpen')
    expect((await bridge.handle(list)).result.tools.map((t) => t.name)).toEqual([CHECK_TOOL])
    const res = await bridge.handle(call('openpen__draw_ellipse'))
    expect(res.result.isError).toBe(true)
    expect(textOf(res)).toMatch(/OpenPen Settings > MCP/)
    expect(textOf(res)).toMatch(/Enable MCP server/)
  })

  it('recovers without restarting once MCP is turned on, and tells Claude the tool list changed', async () => {
    const port = await freePort()
    const notified = []
    const bridge = createBridge({ url: `http://127.0.0.1:${port}/mcp`, apiKey: KEY, logger: silent, notify: (m) => notified.push(m) })
    await bridge.handle(initialize)
    await bridge.handle(list)

    await startOpenPen(port)
    const res = await bridge.handle(call(CHECK_TOOL))
    expect(res.result.isError).toBeFalsy()
    expect(notified.map((m) => m.method)).toContain('notifications/tools/list_changed')
    const tools = (await bridge.handle(list)).result.tools.map((t) => t.name)
    expect(tools).toContain('openpen__draw_ellipse')
  })
})

describe('AC-7 the settings button hands the bundled installer to Claude Desktop', () => {
  it('opens the bundled OpenPen.mcpb from the installed app resources, or from the build output in development', async () => {
    const opened = []
    const deps = { exists: () => true, openPath: async (p) => { opened.push(p); return '' } }
    expect(await installClaudeDesktopBundle({ isPackaged: true, resourcesPath: '/Apps/OpenPen.app/Contents/Resources', appPath: '/x' }, deps)).toEqual({ ok: true })
    expect(await installClaudeDesktopBundle({ isPackaged: false, resourcesPath: '/r', appPath: '/repo' }, deps)).toEqual({ ok: true })
    expect(opened).toEqual([
      path.join('/Apps/OpenPen.app/Contents/Resources', 'claude-desktop', 'OpenPen.mcpb'),
      path.join('/repo', 'build', 'claude-desktop', 'OpenPen.mcpb'),
    ])
  })

  it('reports why nothing opened when the bundle is missing or the system cannot open it', async () => {
    const env = { isPackaged: true, resourcesPath: '/R', appPath: '/x' }
    expect(await installClaudeDesktopBundle(env, { exists: () => false, openPath: async () => '' })).toEqual({ ok: false, error: 'missing' })
    expect(await installClaudeDesktopBundle(env, { exists: () => true, openPath: async () => 'No application knows how to open' }))
      .toEqual({ ok: false, error: 'open-failed', message: 'No application knows how to open' })
  })
})
