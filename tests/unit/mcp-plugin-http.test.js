// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { defineMcpTool } from '@openpen/module-api'
import { executeMcpCommand } from '../../src/services/mcp-tool-bridge'
import { registerContribution, unregisterModule } from '../../src/core/runtime/contribution-store'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { initModuleManifestLoader, PLUGINS_DIR, rescanPlugins } from '../../electron/module-manifest-loader.js'
import { initMcpServerManager } from '../../electron/mcp-server-manager.js'
import { createBuiltinTools, READ_ONLY_TOOL_NAMES } from '../../electron/mcp/tools.js'
import { CURRENT_CONFIG_VERSION } from '../../electron/settings-migrations.js'
import { flushWrites, initSettingsStore } from '../../electron/settings-store.js'

const electron = vi.hoisted(() => ({
  handlers: new Map(),
  listeners: new Map(),
  overlays: new Map(),
  displays: [1, 2].map(id => ({
    id, scaleFactor: 1, size: { width: 800, height: 600 },
    workArea: { x: 0, y: 0 }, bounds: { x: 0, y: 0 },
  })),
  userData: '',
  cursorDisplayIndex: 0,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.7.0',
    getPath: () => electron.userData,
    getLocale: () => 'en',
    on() {},
  },
  BrowserWindow: { getAllWindows: () => [...electron.overlays.values()] },
  ipcMain: {
    handle: (channel, handler) => electron.handlers.set(channel, handler),
    on: (channel, listener) => electron.listeners.set(channel, listener),
  },
  nativeTheme: { on() {}, shouldUseDarkColors: false },
  screen: {
    getAllDisplays: () => electron.displays,
    getPrimaryDisplay: () => electron.displays[0],
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => electron.displays[electron.cursorDisplayIndex],
  },
}))
vi.mock('../../electron/logger.js', () => ({ log: electron.log }))
vi.mock('electron-log/main.js', () => ({ default: electron.log }))
vi.mock('../../electron/diagnostics-manager.js', () => ({ recordDiagnosticsEvent() {} }))
vi.mock('../../electron/tray-manager.js', () => ({ refreshTrayLocale() {} }))
vi.mock('../../electron/window-manager.js', () => ({
  applyToolConfigFromMain() {},
  getActiveToolConfig: () => ({ tool: 'freehand' }),
  getDrawingMode: () => false,
  getOverlayWindowForDisplay: id => electron.overlays.get(id),
  setDrawingMode() {},
}))
vi.mock('../../electron/plugin-meta-manager.js', () => ({
  ensurePluginInstalledAt: vi.fn(),
  getPluginInstalledAt: () => null,
}))
vi.mock('node:fs', async (importOriginal) => {
  const { default: fs } = await importOriginal()
  const dir = name => ({ name, isDirectory: () => true })
  return {
    default: {
      ...fs,
      existsSync: filename => manifestFixtures.has(filename) || filename === PLUGINS_DIR || fs.existsSync(filename),
      readdirSync(directory, ...options) {
        if (directory === PLUGINS_DIR) return [dir('@openpen')]
        if (directory === join(PLUGINS_DIR, '@openpen')) return [dir('arrow'), dir('ruler')]
        return fs.readdirSync(directory, ...options)
      },
      readFileSync: (filename, ...options) => manifestFixtures.has(filename)
        ? JSON.stringify(manifestFixtures.get(filename))
        : fs.readFileSync(filename, ...options),
    },
  }
})

const arrow = '@openpen/arrow'
const ruler = '@openpen/ruler'
const draw = 'openpen.arrow__draw'
const measure = 'openpen.ruler__measure'
const guide = 'openpen__get_guide'
const arrowGuide = 'Arrow-only usage guide.'
const rulerGuide = 'Ruler-only usage guide.'
const arrowSummary = 'Creates arrows on the canvas.'
const rulerSummary = 'Measures lengths on the canvas.'
const manifestFixtures = new Map([[arrow, arrowSummary], [ruler, rulerSummary]].map(([id, description]) => {
  const name = id.split('/')[1]
  return [join(PLUGINS_DIR, id, 'plugin.json'), { id, name, version: '1.0.0', description }]
}))
const guides = { [arrow]: arrowGuide, [ruler]: rulerGuide }
const builtinNames = createBuiltinTools({}).map(tool => tool.name)
const settings = { enabled: true, apiKey: '', readOnly: false, exposeAll: true, enabledPlugins: [] }
const fixture = (pluginId, name, overrides = {}) => ({
  pluginId, name, description: `Run ${name}.`, annotations: {},
  inputJsonSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  ...overrides,
})
const arrowTool = fixture(arrow, 'draw')
const rulerTool = fixture(ruler, 'measure', { annotations: { readOnly: true, destructive: false } })
const textResult = text => ({ content: [{ type: 'text', text }] })

const send = (channel, sender, payload) => electron.listeners.get(channel)({ sender }, payload)
const invoke = (channel, payload) => electron.handlers.get(channel)({}, payload)
let server
let client
let transport
let eventStream

async function start({
  run = () => textResult('drawn'),
  cancel = () => {},
  ping = () => ({}),
  onCancellation = () => {},
  disabledAtBoot,
  ...config
} = {}) {
  vi.stubEnv('OPENPEN_MCP_PORT', '0')
  electron.userData = await mkdtemp(join(tmpdir(), 'openpen-mcp-plugin-'))
  if (disabledAtBoot) {
    await writeFile(join(electron.userData, 'config.json'), JSON.stringify({
      configVersion: CURRENT_CONFIG_VERSION,
      disabledModules: disabledAtBoot,
    }))
  }
  for (const { id } of electron.displays) {
    const webContents = {
      id,
      once() {},
      isDestroyed: () => false,
      isLoading: () => false,
      send(channel, payload) {
        if (channel !== 'mcp:command') return
        const { requestId, command } = payload
        if (command.type === 'plugin-tool-cancel') cancel(id, command)
        void Promise.resolve().then(() => {
          if (command.type === 'plugin-tool-call') return run(id, command)
          if (command.type === 'ping') return ping(id)
          return {}
        }).then(
          value => send('mcp:command-result', webContents, { requestId, ok: true, result: value }),
          error => send('mcp:command-result', webContents, { requestId, ok: false, error: error.message }),
        )
      },
    }
    electron.overlays.set(id, { id, webContents, isDestroyed: () => false })
  }
  initSettingsStore()
  await initModuleManifestLoader()
  await rescanPlugins()
  const manager = initMcpServerManager({ captureDisplayImage: vi.fn() })
  server = manager.server
  await invoke('settings:set', { mcp: { ...settings, ...config } })
  const apiKey = await invoke('mcp:regenerate-key')

  client = new Client({ name: 'openpen-plugin-test', version: '1.0.0' })
  eventStream = vi.fn()
  transport = new StreamableHTTPClientTransport(new URL(server.status().url), {
    async fetch(url, options) {
      const response = await globalThis.fetch(url, options)
      if (options?.method === 'GET' && response.headers.get('content-type')?.startsWith('text/event-stream')) {
        eventStream()
      }
      if (typeof options?.body === 'string'
        && JSON.parse(options.body).method === 'notifications/cancelled') {
        onCancellation(response.status)
      }
      return response
    },
    requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
  })
  await client.connect(transport)
}

function register(tools, displayId = 1, pluginGuides = guides) {
  send('mcp:plugin-tools', electron.overlays.get(displayId).webContents, { displayId, tools, guides: pluginGuides })
}

async function listed() {
  return (await client.listTools()).tools.map(({ name }) => name).sort()
}

function call(name, args = { text: 'arrow' }, options) {
  return client.callTool({ name, arguments: args }, undefined, options)
}

const failText = result => result.content.map(item => item.text).join('\n')

afterEach(async () => {
  try {
    await transport?.terminateSession()
  } finally {
    await client?.close()
    await server?.stop()
    await flushWrites()
    if (electron.userData) await rm(electron.userData, { recursive: true, force: true })
    electron.userData = ''
    electron.cursorDisplayIndex = 0
    server = client = transport = undefined
    electron.handlers.clear()
    electron.listeners.clear()
    electron.overlays.clear()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  }
})

describe('plugin tools over Streamable HTTP', () => {
  it('AC-1 lists the scoped name from the primary overlay registration', async () => {
    await start()
    register([rulerTool], 2)
    expect(await listed()).toEqual([...builtinNames].sort())
    register([arrowTool])
    expect(await listed()).toEqual([...builtinNames, draw].sort())
  })

  it('AC-1 regression: an oversized plugin guide does not discard other plugins’ tools', async () => {
    await start()
    register([arrowTool, rulerTool], 1, { ...guides, [arrow]: 'x'.repeat(16 * 1024 + 1) })

    expect(await listed()).toContain(measure)
  })

  it('AC-2 exposes a 128-character name and reports invalid and 129-character names', async () => {
    await start()
    const prefix = 'openpen.arrow__'
    const maxName = 'a'.repeat(128 - prefix.length)
    const longName = maxName + 'a'
    register([fixture(arrow, 'bad/name'), fixture(arrow, longName), fixture(arrow, maxName)])

    expect(await listed()).toEqual([...builtinNames, prefix + maxName].sort())
    const { pluginToolIssues } = await invoke('mcp:get-status')
    expect(Object.keys(pluginToolIssues)).toEqual([arrow])
    expect([...pluginToolIssues[arrow]].sort((a, b) => a.reason.localeCompare(b.reason))).toEqual([
      { tool: 'bad/name', fullName: prefix + 'bad/name', reason: 'invalid_chars' },
      { tool: longName, fullName: prefix + longName, reason: 'too_long' },
    ])
  })

  it('AC-3 routes calls to the requested display and forwards text, structured data and images', async () => {
    const results = {
      text: textResult('drawn'),
      object: { ...textResult('{"count":2}'), structuredContent: { count: 2 } },
      image: { content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }] },
    }
    electron.cursorDisplayIndex = 1
    const run = vi.fn((_id, { args }) => results[args.text])
    await start({ run })
    register([arrowTool])
    const { tools } = await client.listTools()
    const schema = tools.find(tool => tool.name === draw)?.inputSchema
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        text: { type: 'string' },
        displayId: {
          type: 'integer',
          description: 'Display id from get_state; defaults to the display under the cursor.',
        },
      },
      required: ['text'],
    })
    for (const [text, result] of Object.entries(results)) {
      expect(await call(draw, { displayId: 1, text })).toMatchObject(result)
      expect(run).toHaveBeenLastCalledWith(1, expect.objectContaining({
        type: 'plugin-tool-call', pluginId: arrow, name: 'draw', args: { text },
      }))
    }
    expect(await call(draw, { text: 'text' })).toMatchObject(results.text)
    expect(run).toHaveBeenLastCalledWith(2, expect.objectContaining({ args: { text: 'text' } }))
  })

  it('AC-3 regression: a plugin cannot make the host displayId required', async () => {
    const inputSchema = z.object({ text: z.string(), displayId: z.number().int() })
    const handler = vi.fn(({ text }) => text)
    const tool = defineMcpTool({ ...arrowTool, inputSchema, handler })
    registerContribution('system.mcp.tools', arrow, tool)

    try {
      await start({
        run(id, command) {
          vi.stubGlobal('window', { location: { search: `?window=overlay&displayId=${id}` } })
          return executeMcpCommand(command)
        },
      })
      register([{ ...arrowTool, inputJsonSchema: z.toJSONSchema(inputSchema) }])
      const { tools } = await client.listTools()
      const schema = tools.find(entry => entry.name === draw)?.inputSchema
      const results = [
        await call(draw, { text: 'default' }),
        await call(draw, { text: 'explicit', displayId: 2 }),
      ]

      expect.soft(schema?.required).toEqual(['text'])
      expect.soft(results).toMatchObject([textResult('default'), textResult('explicit')])
      expect(handler).toHaveBeenCalledTimes(2)
    } finally {
      unregisterModule(arrow)
    }
  })

  it('AC-4 forwards the complete overlay validation error for mismatched arguments', async () => {
    const result = {
      ...textResult('text must be a string. Next step: Resend text as a string according to the input schema.'),
      isError: true,
      errorKind: 'invalid_params',
    }
    const run = vi.fn(() => result)
    await start({ run })
    register([arrowTool])

    expect(await call(draw, { text: 42 })).toMatchObject(result)
    expect(run).toHaveBeenCalledWith(1, expect.objectContaining({ args: { text: 42 } }))
  })

  it('AC-5 forwards recoverable errors and logs an unexpected overlay error', async () => {
    const nextStep = 'Open the canvas and retry.'
    const kinds = ['invalid_params', 'not_found', 'user_action_required', 'unavailable']
    await start({
      run(_id, { args }) {
        if (args.text === 'internal') {
          return { ...textResult('The tool failed unexpectedly.'), isError: true, errorKind: 'internal' }
        }
        return {
          ...textResult(`Canvas request failed. Next step: ${nextStep}`),
          isError: true,
          errorKind: args.text,
        }
      },
    })
    register([arrowTool])
    for (const errorKind of kinds) {
      expect(await call(draw, { text: errorKind })).toMatchObject({
        ...textResult(`Canvas request failed. Next step: ${nextStep}`), isError: true, errorKind,
      })
    }
    const result = await call(draw, { text: 'internal' })
    expect(result).toMatchObject({ ...textResult('The tool failed unexpectedly.'), isError: true })
    const logs = [electron.log.info, electron.log.warn, electron.log.error]
      .flatMap(logger => logger.mock.calls.map(args => args.join(' ')))
    expect(logs).toContainEqual(expect.stringMatching(
      /^\[mcp\] plugin-tool @openpen\/arrow draw \d+ms error:internal$/,
    ))
  })

  it('AC-6 publishes conservative defaults and hides unannotated tools in read-only mode', async () => {
    await start()
    register([arrowTool, rulerTool])
    const tools = (await client.listTools()).tools
    expect(tools.find(tool => tool.name === draw)?.annotations).toEqual({
      readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true,
    })
    await invoke('settings:set', { mcp: { ...settings, readOnly: true } })
    expect(await listed()).toEqual([...READ_ONLY_TOOL_NAMES, measure].sort())
  })

  it('AC-8 exposes newly installed plugin tools on the next boot registration', async () => {
    await start({ exposeAll: true, enabledPlugins: [ruler] })
    expect(await listed()).toEqual([...builtinNames].sort())
    register([arrowTool, rulerTool])
    expect(await listed()).toEqual([...builtinNames, draw, measure].sort())
  })

  it('AC-9 AC-10 notifies clients on disable and rejects calls using the old tool name', async () => {
    const run = vi.fn()
    await start({ run })
    expect(client.getServerCapabilities()?.tools).toMatchObject({ listChanged: true })
    const notification = vi.fn()
    client.setNotificationHandler(ToolListChangedNotificationSchema, notification)
    await vi.waitFor(() => expect(eventStream).toHaveBeenCalled())
    register([arrowTool, rulerTool])
    expect(await listed()).toContain(draw)
    await vi.waitFor(() => expect(notification).toHaveBeenCalledWith(expect.objectContaining({
      method: 'notifications/tools/list_changed',
    })))
    notification.mockClear()

    await invoke('settings:set', { disabledModules: [arrow] })
    await vi.waitFor(() => expect(notification).toHaveBeenCalledWith(expect.objectContaining({
      method: 'notifications/tools/list_changed',
    })))
    expect(await listed()).toEqual([...builtinNames, measure].sort())
    const result = await call(draw)
    expect(result.isError).toBe(true)
    expect(failText(result)).toContain('Plugin is disabled')
    expect(run).not.toHaveBeenCalled()
  })

  it('AC-10 regression: a stale tool name reports its plugin disabled after a cold boot', async () => {
    await start({ disabledAtBoot: [arrow] })
    const manifests = await invoke('module:get-manifests')
    expect(manifests.map(({ id }) => id)).toContain(arrow)
    register([rulerTool])
    expect(await listed()).not.toContain(draw)

    const result = await call(draw)
    expect(result.isError).toBe(true)
    expect(failText(result)).toContain('Plugin is disabled')
  })

  it('AC-15 logs plugin id, local tool name, duration and outcome for each call', async () => {
    await start({
      async run(_id, { args }) {
        await new Promise(resolve => setTimeout(resolve, 50))
        return args.text === 'fail'
          ? { ...textResult('Unavailable. Next step: Retry.'), errorKind: 'unavailable', isError: true }
          : textResult('drawn')
      },
    })
    register([arrowTool])
    await call(draw)
    await call(draw, { text: 'fail' })
    const logs = [...electron.log.info.mock.calls, ...electron.log.warn.mock.calls, ...electron.log.error.mock.calls]
      .map(args => args.join(' '))
      .filter(line => line.startsWith('[mcp] plugin-tool '))
    expect(logs).toHaveLength(2)
    for (const outcome of ['ok', 'error:unavailable']) {
      const line = logs.find(entry => entry.endsWith(` ${outcome}`))
      const match = line?.match(/^\[mcp\] plugin-tool @openpen\/arrow draw (\d+)ms (?:ok|error:unavailable)$/)
      expect(Number(match?.[1])).toBeGreaterThanOrEqual(40)
    }
  })

  it('AC-19 forwards cancellation for the same call to the executing overlay', async () => {
    const started = Promise.withResolvers()
    const finished = Promise.withResolvers()
    const cancelled = vi.fn()
    await start({
      run(id, command) {
        started.resolve({ id, callId: command.callId })
        return finished.promise
      },
      cancel(id, command) {
        cancelled(id, command)
        finished.resolve(textResult('cancelled'))
      },
    })
    register([arrowTool])
    const controller = new AbortController()
    const rejection = expect(call(draw, { displayId: 2, text: 'arrow' }, { signal: controller.signal })).rejects.toBeDefined()
    try {
      const { id, callId } = await Promise.race([
        started.promise,
        rejection.then(() => { throw new Error('Tool call ended before reaching the overlay') }),
      ])
      expect(id).toBe(2)
      expect(callId).toEqual(expect.any(String))
      controller.abort()
      await rejection
      await vi.waitFor(() => expect(cancelled).toHaveBeenCalledWith(2, { type: 'plugin-tool-cancel', callId }))
    } finally {
      finished.resolve(textResult('finished'))
    }
  })

  it('AC-19 regression: cancellation before overlay readiness prevents dispatch', async () => {
    const pingStarted = vi.fn()
    const acknowledgePing = Promise.withResolvers()
    const cancellationReceived = vi.fn()
    const run = vi.fn((_id, { args }) => textResult(args.text))
    await start({
      run,
      ping(id) {
        pingStarted(id)
        return acknowledgePing.promise
      },
      onCancellation: cancellationReceived,
    })
    register([arrowTool])
    const controller = new AbortController()
    const cancelledCall = call(draw, { displayId: 2, text: 'cancelled' }, { signal: controller.signal })
      .then(() => false, () => true)
    try {
      await vi.waitFor(() => expect(pingStarted).toHaveBeenCalledWith(2))
      controller.abort()
      expect(await cancelledCall).toBe(true)
      await vi.waitFor(() => expect(cancellationReceived).toHaveBeenCalledWith(202))
      expect(run).not.toHaveBeenCalled()
      acknowledgePing.resolve({})
      expect(await call(draw, { displayId: 2, text: 'ready' })).toMatchObject(textResult('ready'))
      expect(run.mock.calls.map(([, command]) => command.args.text)).toEqual(['ready'])
    } finally {
      controller.abort()
      acknowledgePing.resolve({})
    }
  })

  it('AC-20 separates server instructions, the guide index and plugin detail', async () => {
    await start({ exposeAll: false, enabledPlugins: [arrow] })
    register([arrowTool, rulerTool])
    const instructions = client.getInstructions()
    expect(instructions.length).toBeLessThanOrEqual(1000)
    expect(instructions).toContain('<plugin>__<tool>')
    expect(instructions).toContain(guide)
    expect(instructions).toMatch(/plugin/i)
    expect(instructions).not.toContain(arrowGuide)
    const index = failText(await call(guide, {}))
    expect(index).toContain('Plugins')
    expect(index).toContain(arrow)
    expect(index).toContain(arrowSummary)
    expect(index).not.toContain(rulerSummary)
    expect(index).not.toContain(ruler)
    expect(index).not.toContain(arrowGuide)
    expect(index).not.toContain(rulerGuide)

    const detail = failText(await call(guide, { plugin: arrow }))
    const [heading, ...body] = detail.split('\n')
    expect(heading).toBe(`Guide from plugin ${arrow} (tools: ${draw})`)
    expect(body.join('\n').trim()).toBe(arrowGuide)
  })

  it('AC-20 explains when a plugin is unexposed or has no guide', async () => {
    await start({ exposeAll: false, enabledPlugins: [arrow] })
    register([arrowTool, rulerTool], 1, { [ruler]: rulerGuide })
    expect(await listed()).toContain(draw)

    for (const [plugin, message] of [
      [ruler, `Plugin ${ruler} is not exposed.`],
      [arrow, `Plugin ${arrow} provides no guide.`],
    ]) {
      const result = await call(guide, { plugin })
      expect(result.isError).toBe(true)
      expect(failText(result)).toContain(message)
      expect(failText(result)).toContain('Next step: ')
    }
  })
})
