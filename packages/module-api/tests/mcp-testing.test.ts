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
