import { expect, it, vi } from 'vitest'
import { defineMcpTool, z } from '@openpen/module-api'
import { callMcpTool } from '@openpen/module-api/testing'

it('AC-13 rejects invalid demo tool arguments before running the handler', async () => {
  const handler = vi.fn(() => 'echoed')
  const tool = defineMcpTool({
    name: 'echo_note',
    description: 'Echo a note.',
    inputSchema: z.object({ text: z.string() }),
    handler,
  })

  const result = await callMcpTool(tool, { text: 42 })

  expect(result).toMatchObject({ isError: true, errorKind: 'invalid_params' })
  expect(handler).not.toHaveBeenCalled()
})

it('gives the fake context a toCanvas that returns the point unchanged unless overridden', async () => {
  const tool = defineMcpTool({
    name: 'mark',
    description: 'Mark a point.',
    inputSchema: z.object({ x: z.number(), y: z.number() }),
    handler: ({ x, y }, ctx) => ({ ...ctx.toCanvas({ x, y }) }),
  })

  expect(await callMcpTool(tool, { x: 30, y: 40 })).toMatchObject({ structuredContent: { x: 30, y: 40 } })
  const halve = (p: { x: number; y: number }) => ({ x: p.x / 2, y: p.y / 2 })
  expect(await callMcpTool(tool, { x: 30, y: 40 }, { toCanvas: halve })).toMatchObject({
    structuredContent: { x: 15, y: 20 },
  })
})
