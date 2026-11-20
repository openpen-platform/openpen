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
