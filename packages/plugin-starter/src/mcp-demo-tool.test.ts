import { expect, it, vi } from 'vitest'
import { callMcpTool } from '@openpen/module-api/testing'
import { echoNoteTool } from './mcp-demo-tool'

it('AC-12 echoes a note as text', async () => {
  const result = await callMcpTool(echoNoteTool, { text: 'Hello, OpenPen!' })

  expect(echoNoteTool.name).toBe('echo_note')
  expect(echoNoteTool.annotations?.readOnly).toBe(true)
  expect(result.content).toEqual([{ type: 'text', text: 'Hello, OpenPen!' }])
})

it('AC-13 rejects a non-text note without calling the handler', async () => {
  const handler = vi.fn(echoNoteTool.handler)
  const result = await callMcpTool({ ...echoNoteTool, handler }, { text: 42 })

  expect(result).toMatchObject({ isError: true, errorKind: 'invalid_params' })
  expect(handler).not.toHaveBeenCalled()
})
