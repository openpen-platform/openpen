import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { createMcpHttpServer } from '../../electron/mcp/http-server.js'
import { createBuiltinTools } from '../../electron/mcp/tools.js'

const KEY_OLD = 'opk_' + 'a'.repeat(32)
const KEY_NEW = 'opk_' + 'b'.repeat(32)

const host = {
  getState: () => ({ drawingMode: false, tool: 'freehand', displays: [] }),
  setDrawingMode() {},
  setTool() {},
  runOnOverlay: async () => ({}),
  screenshot: async () => ({ data: '', mimeType: 'image/png', width: 1, height: 1, displayId: 1 }),
}
const silentLogger = { info() {}, warn() {}, error() {}, debug() {} }

const servers = []
function makeServer(config) {
  const state = { config: { enabled: true, apiKey: KEY_OLD, readOnly: false, exposeAll: true, enabledPlugins: [], ...config } }
  const srv = createMcpHttpServer({
    port: 0,
    getConfig: () => state.config,
    getTools: () => createBuiltinTools(host),
    logger: silentLogger,
  })
  servers.push(srv)
  return { srv, state }
}

// node:http (not fetch) so Host / Origin headers can be set freely.
function post(port, { headers = {}, body, path = '/mcp' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body ?? { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => resolve({ status: res.statusCode, text }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

// boundAddress() is only the host string; the port comes from status().url.
const portOf = (srv) => Number(new URL(srv.status().url).port)

function parseRpc(text) {
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'))
  return JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
}

function canConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
  })
}

afterEach(async () => {
  while (servers.length) await servers.pop().stop()
})

describe('AC-2 MCP switch off => no local entrance', () => {
  it('AC-2 a server that was never started has no bound address and is not running', async () => {
    const { srv } = makeServer({ enabled: false })
    expect(srv.boundAddress()).toBeNull()
    expect(srv.status().running).toBe(false)
  })

  it('AC-2 after stop() the previous port refuses connections', async () => {
    const { srv } = makeServer()
    await srv.start()
    const port = portOf(srv)
    expect(await canConnect(port)).toBe(true)
    await srv.stop()
    expect(srv.status().running).toBe(false)
    expect(await canConnect(port)).toBe(false)
  })
})

describe('AC-3 missing / wrong key => rejected', () => {
  it('AC-3 request without Authorization header gets 401', async () => {
    const { srv } = makeServer()
    await srv.start()
    const res = await post(portOf(srv))
    expect(res.status).toBe(401)
  })

  it('AC-3 request with a wrong bearer key gets 401', async () => {
    const { srv } = makeServer()
    await srv.start()
    const res = await post(portOf(srv), { headers: { authorization: 'Bearer opk_wrong' } })
    expect(res.status).toBe(401)
  })
})

describe('AC-4 browser origin / non-local host => rejected', () => {
  it('AC-4 request carrying an Origin header gets 403 even with a valid key', async () => {
    const { srv } = makeServer()
    await srv.start()
    const res = await post(portOf(srv), {
      headers: { authorization: `Bearer ${KEY_OLD}`, origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('AC-4 request whose Host is not 127.0.0.1/localhost gets 403 even with a valid key', async () => {
    const { srv } = makeServer()
    await srv.start()
    const res = await post(portOf(srv), {
      headers: { authorization: `Bearer ${KEY_OLD}`, host: 'evil.example:80' },
    })
    expect(res.status).toBe(403)
    // bound to loopback only, never 0.0.0.0 / LAN
    expect(srv.boundAddress()).toBe('127.0.0.1')
  })
})

describe('AC-5 regenerate key => old key dead immediately', () => {
  it('AC-5 old key is rejected right after config key changes; new key is accepted', async () => {
    const { srv, state } = makeServer()
    await srv.start()
    const port = portOf(srv)
    const before = await post(port, { headers: { authorization: `Bearer ${KEY_OLD}` } })
    expect(before.status).toBe(200)

    state.config = { ...state.config, apiKey: KEY_NEW }

    const oldRes = await post(port, { headers: { authorization: `Bearer ${KEY_OLD}` } })
    expect(oldRes.status).toBe(401)
    const newRes = await post(port, { headers: { authorization: `Bearer ${KEY_NEW}` } })
    expect(newRes.status).toBe(200)
  })
})

describe('AC-15 connection instructions reach the AI app', () => {
  it('AC-15 initialize result.instructions starts with the get_guide request', async () => {
    const { srv } = makeServer()
    await srv.start()
    const res = await post(portOf(srv), {
      headers: { authorization: `Bearer ${KEY_OLD}` },
      body: { jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    })
    expect(res.status).toBe(200)
    const { instructions } = parseRpc(res.text).result
    expect(instructions.trim().startsWith('Before you start, call openpen__get_guide.')).toBe(true)
  })
})

describe('AC-14 read-only switch (over the wire)', () => {
  it('AC-14 tools/list in read-only mode exposes only the 4 read tools', async () => {
    const { srv } = makeServer({ readOnly: true })
    await srv.start()
    const res = await post(portOf(srv), { headers: { authorization: `Bearer ${KEY_OLD}` } })
    expect(res.status).toBe(200)
    const names = parseRpc(res.text).result.tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'openpen__get_guide', 'openpen__get_state', 'openpen__list_annotations', 'openpen__screenshot',
    ])
  })

  it('AC-14 tools/call of a drawing tool in read-only mode does not succeed', async () => {
    const { srv } = makeServer({ readOnly: true })
    await srv.start()
    const res = await post(portOf(srv), {
      headers: { authorization: `Bearer ${KEY_OLD}` },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'openpen__clear_canvas', arguments: {} } },
    })
    const msg = parseRpc(res.text)
    const failed = msg.error != null || msg.result?.isError === true
    expect(failed).toBe(true)
  })
})
