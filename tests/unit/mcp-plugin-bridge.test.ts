import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineMcpTool } from '@openpen/module-api'
import { initMcpToolBridge } from '../../src/services/mcp-tool-bridge'
import { registerContribution, unregisterModule } from '../../src/core/runtime/contribution-store'

const pluginId = '@openpen/arrow'

function connectBridge(handler: (args: { text: string }, ctx: { signal: AbortSignal; displayId: number }) => unknown) {
  registerContribution('system.mcp.tools', pluginId, {
    name: 'draw',
    description: 'Draw an arrow.',
    inputSchema: z.object({ text: z.string() }),
    handler,
  })
  const onMcpCommand = vi.fn<
    (callback: (command: Record<string, unknown>) => unknown) => () => void
  >(() => () => {})
  vi.stubGlobal('openPenApi', { onMcpCommand })
  const disconnect = initMcpToolBridge()
  return { receive: onMcpCommand.mock.calls[0]![0], disconnect }
}

const command = (text: unknown) => ({
  type: 'plugin-tool-call', callId: 'arrow-call', pluginId, name: 'draw', args: { text },
})

afterEach(() => {
  unregisterModule(pluginId)
  vi.unstubAllGlobals()
})

describe('overlay plugin tool bridge', () => {
  it('AC-1 reports the SDK tool schema and the current overlay display ID', async () => {
    const description = 'Return an arrow label.'
    const annotations = { readOnly: true, destructive: false }
    const tool = defineMcpTool({
      name: 'draw',
      description,
      inputSchema: z.object({ text: z.string().describe('Arrow label.') }),
      annotations,
      handler: ({ text }) => text,
    })
    registerContribution('system.mcp.tools', pluginId, tool)
    const mcpReportPluginTools = vi.fn()
    vi.stubGlobal('openPenApi', { mcpReportPluginTools })

    const previousUrl = window.location.href
    try {
      const { reportPluginTools } = await import('../../src/services/mcp-tool-bridge')
      for (const displayId of [1, 2]) {
        window.history.replaceState(null, '', `?window=overlay&displayId=${displayId}`)
        mcpReportPluginTools.mockClear()
        reportPluginTools()

        expect(mcpReportPluginTools).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
          displayId,
          tools: [{
            pluginId,
            name: 'draw',
            description,
            annotations,
            inputJsonSchema: expect.objectContaining({
              type: 'object',
              properties: { text: { type: 'string', description: 'Arrow label.' } },
              required: ['text'],
            }),
          }],
        }))
      }
    } finally {
      window.history.replaceState(null, '', previousUrl)
    }
  })

  it('AC-4 rejects invalid arguments before invoking the plugin handler', async () => {
    const handler = vi.fn(({ text }: { text: string }) => `Drew ${text}`)
    const { receive, disconnect } = connectBridge(handler)
    try {
      expect(await receive(command(42))).toMatchObject({
        isError: true,
        errorKind: 'invalid_params',
        content: [{ type: 'text', text: expect.stringMatching(/text[\s\S]*Next step: /i) }],
      })
      expect(handler).not.toHaveBeenCalled()
      expect(await receive(command('arrow'))).toMatchObject({
        content: [{ type: 'text', text: 'Drew arrow' }],
      })
    } finally {
      disconnect()
    }
  })

  it('AC-3 supplies the overlay display ID in context without adding it to plugin arguments', async () => {
    const previousUrl = window.location.href
    window.history.replaceState(null, '', '?window=overlay&displayId=2')
    let disconnect: (() => void) | undefined
    try {
      const handler = vi.fn((args: { text: string }, ctx: { displayId: number }) => ({
        args,
        displayId: ctx.displayId,
      }))
      const bridge = connectBridge(handler)
      disconnect = bridge.disconnect
      expect(await bridge.receive(command('arrow'))).toMatchObject({
        structuredContent: { args: { text: 'arrow' }, displayId: 2 },
      })
      expect(handler).toHaveBeenCalledWith({ text: 'arrow' }, expect.objectContaining({ displayId: 2 }))
    } finally {
      disconnect?.()
      window.history.replaceState(null, '', previousUrl)
    }
  })

  it('forwards ctx.log info lines to the main-process log with the plugin prefix', async () => {
    const recordError = vi.fn()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { receive, disconnect } = connectBridge((_args, ctx) => {
      (ctx as unknown as { log(level: string, message: string): void }).log('info', 'hello from the tool')
      return 'ok'
    })
    vi.stubGlobal('openPenApi', { ...(window as unknown as { openPenApi: object }).openPenApi, recordError })
    try {
      await receive(command('arrow'))
      expect(recordError).toHaveBeenCalledWith({
        level: 'info',
        message: `[mcp] plugin ${pluginId}: hello from the tool`,
        source: 'mcp-plugin-tool',
      })
    } finally {
      disconnect()
      info.mockRestore()
    }
  })

  it('cuts an oversized ctx.log message so main still receives the prefixed line', async () => {
    const recordError = vi.fn()
    const { receive, disconnect } = connectBridge((_args, ctx) => {
      (ctx as unknown as { log(level: string, message: string): void }).log('info', 'x'.repeat(200_000))
      return 'ok'
    })
    vi.stubGlobal('openPenApi', { ...(window as unknown as { openPenApi: object }).openPenApi, recordError })
    try {
      await receive(command('arrow'))
      const sent = recordError.mock.calls[0]![0] as { message: string }
      expect(sent.message.startsWith(`[mcp] plugin ${pluginId}: xxx`)).toBe(true)
      expect(sent.message.length).toBeLessThan(65_536)
    } finally {
      disconnect()
    }
  })

  it('converts screenshot pixels to canvas points with the offset main sent and the device pixel ratio', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const { receive, disconnect } = connectBridge((_args, ctx) =>
      (ctx as unknown as { toCanvas(p: { x: number; y: number }): { x: number; y: number } }).toCanvas({ x: 220, y: 450 }))
    try {
      expect(await receive({ ...command('arrow'), offset: { x: 20, y: 50 } })).toMatchObject({
        structuredContent: { x: 100, y: 200 },
      })
      // No offset (overlay covers the whole display): only the pixel ratio applies.
      expect(await receive(command('arrow'))).toMatchObject({
        structuredContent: { x: 110, y: 225 },
      })
    } finally {
      disconnect()
    }
  })

  it('AC-19 aborts the matching in-flight handler and reports its result', async () => {
    let signal: AbortSignal | undefined
    let finish: ((value: string) => void) | undefined
    const { receive, disconnect } = connectBridge((_args, ctx) => {
      signal = ctx.signal
      return new Promise<string>(resolve => {
        finish = resolve
        ctx.signal.addEventListener('abort', () => resolve('Handler received cancellation.'), { once: true })
      })
    })
    try {
      const pending = Promise.resolve(receive(command('arrow')))
      await vi.waitFor(() => expect(signal?.aborted).toBe(false))
      await receive({ type: 'plugin-tool-cancel', callId: 'different-call' })
      expect(signal?.aborted).toBe(false)
      await receive({ type: 'plugin-tool-cancel', callId: 'arrow-call' })
      expect(signal?.aborted).toBe(true)
      expect(await pending).toMatchObject({
        content: [{ type: 'text', text: 'Handler received cancellation.' }],
      })
    } finally {
      finish?.('Handler finished.')
      disconnect()
    }
  })
})
