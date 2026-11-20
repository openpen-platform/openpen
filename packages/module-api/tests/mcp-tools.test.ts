import { describe, expect, it, vi } from 'vitest'
import {
  defineMcpTool,
  defineModule,
  image,
  InvalidParamsError,
  NotFoundError,
  pluginToolPrefix,
  runMcpTool,
  UnavailableError,
  UserActionRequiredError,
  validateMcpToolName,
  z,
  type McpToolContext,
} from '@openpen/module-api'

const inputSchema = z.object({ text: z.string() })

function makeContext() {
  return {
    displayId: 7,
    signal: new AbortController().signal,
    reportProgress: vi.fn(),
    log: vi.fn(),
  } satisfies McpToolContext
}

describe('MCP tool naming and contributions', () => {
  it('AC-1 accepts an MCP tool contribution with a valid plugin-prefixed name', () => {
    const tool = defineMcpTool({
      name: 'draw',
      description: 'Draw an arrow.',
      inputSchema,
      handler: ({ text }) => text,
    })
    const mod = defineModule({ id: '@openpen/arrow', contributes: { mcpTools: [tool] } })

    expect(mod.contributes?.mcpTools).toEqual([tool])
    const prefix = pluginToolPrefix(mod.id)
    expect(prefix).toBe('openpen.arrow')
    const fullName = `${prefix}__${tool.name}`
    expect(fullName).toBe('openpen.arrow__draw')
    expect(validateMcpToolName(fullName)).toEqual({ ok: true })
  })

  it('AC-2 reports invalid characters and names longer than 128 characters', () => {
    expect(validateMcpToolName('openpen.arrow__draw!')).toEqual({
      ok: false,
      reason: 'invalid_chars',
    })
    expect(validateMcpToolName('a'.repeat(129))).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })
})

describe('runMcpTool', () => {
  it('AC-4 rejects invalid arguments with guidance before running the handler', async () => {
    const handler = vi.fn(() => 'drawn')
    const tool = defineMcpTool({ name: 'draw', description: 'Draw an arrow.', inputSchema, handler })

    const result = await runMcpTool(tool, { text: 42 }, makeContext())

    expect(result).toMatchObject({ isError: true, errorKind: 'invalid_params' })
    expect(result.content).toEqual([{ type: 'text', text: expect.any(String) }])
    const [content] = result.content
    if (content.type === 'text') {
      const [message, nextStep] = content.text.split(/Next step:([\s\S]*)/, 2)
      expect(message).toMatch(/\btext\b/)
      expect(nextStep).toMatch(/\binputSchema\b/)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('AC-4 regression: null arguments are rejected', async () => {
    const handler = vi.fn(() => 'drawn')
    const tool = defineMcpTool({
      name: 'draw',
      description: 'Draw an arrow.',
      inputSchema: z.object({}),
      handler,
    })

    const result = await runMcpTool(tool, null, makeContext())

    expect.soft(result).toMatchObject({ isError: true, errorKind: 'invalid_params' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('AC-5 passes all four classified errors and their next steps to the caller', async () => {
    const cases = [
      [new InvalidParamsError('Unsupported label.', 'Use plain text.'), 'invalid_params', 'Unsupported label. Next step: Use plain text.'],
      [new NotFoundError('Arrow missing.', 'Select an existing arrow.'), 'not_found', 'Arrow missing. Next step: Select an existing arrow.'],
      [new UserActionRequiredError('Canvas is locked.', 'Unlock the canvas.'), 'user_action_required', 'Canvas is locked. Next step: Unlock the canvas.'],
      [new UnavailableError('Canvas is loading.', 'Retry after it loads.'), 'unavailable', 'Canvas is loading. Next step: Retry after it loads.'],
    ] as const

    for (const [error, errorKind, text] of cases) {
      const tool = defineMcpTool({
        name: 'draw',
        description: 'Draw an arrow.',
        inputSchema,
        handler() {
          throw error
        },
      })

      expect(await runMcpTool(tool, { text: 'arrow' }, makeContext())).toMatchObject({
        isError: true,
        errorKind,
        content: [{ type: 'text', text }],
      })
    }
  })

  it('AC-5 returns a generic internal error and logs the original exception', async () => {
    const ctx = makeContext()
    const tool = defineMcpTool({
      name: 'draw',
      description: 'Draw an arrow.',
      inputSchema,
      async handler() {
        throw new Error('Canvas renderer failed.')
      },
    })

    expect(await runMcpTool(tool, { text: 'arrow' }, ctx)).toMatchObject({
      isError: true,
      errorKind: 'internal',
      content: [{ type: 'text', text: 'The tool failed unexpectedly.' }],
    })
    expect(ctx.log).toHaveBeenCalledWith('error', expect.stringContaining('Canvas renderer failed.'))
  })

  it('AC-5 regression: a throwing refinement becomes a generic internal error', async () => {
    const ctx = makeContext()
    const tool = defineMcpTool({
      name: 'draw',
      description: 'Draw an arrow.',
      inputSchema: inputSchema.refine(() => {
        throw new Error('Arrow validation failed.')
      }),
      handler: () => 'drawn',
    })

    await expect(runMcpTool(tool, { text: 'arrow' }, ctx)).resolves.toMatchObject({
      isError: true,
      errorKind: 'internal',
      content: [{ type: 'text', text: 'The tool failed unexpectedly.' }],
    })
    expect(ctx.log).toHaveBeenCalledWith('error', expect.stringContaining('Arrow validation failed.'))
  })

  it('AC-3 returns structured content and JSON text for an object', async () => {
    const tool = defineMcpTool({
      name: 'echo_note',
      description: 'Echo a note.',
      inputSchema,
      handler: ({ text }) => ({ text }),
    })

    const result = await runMcpTool(tool, { text: 'hello' }, makeContext())

    expect(result.structuredContent).toEqual({ text: 'hello' })
    expect(result.content).toEqual([{ type: 'text', text: expect.any(String) }])
    const [content] = result.content
    if (content.type === 'text') {
      expect(JSON.parse(content.text)).toEqual({ text: 'hello' })
    }
  })

  it('AC-3 converts text and image returns to MCP content', async () => {
    const tool = defineMcpTool({
      name: 'draw',
      description: 'Return text and an image.',
      inputSchema,
      handler: ({ text }) => [text, image('AAAA', 'image/png')],
    })

    const result = await runMcpTool(tool, { text: 'arrow' }, makeContext())

    expect(result.content).toEqual([
      { type: 'text', text: 'arrow' },
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ])
  })
})
