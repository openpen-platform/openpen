/**
 * Demo MCP tool — lets an AI agent call this plugin through OpenPen's local
 * MCP server (experimental; see docs/guides/mcp-tools.md).
 *
 * The tool is attached in `src/index.ts` via `contributes.mcpTools`. Agents see
 * it as `<plugin prefix>__echo_note`, e.g. `yourscope.my-plugin__echo_note`.
 * `src/mcp-demo-tool.test.ts` shows how to test it with `callMcpTool`.
 *
 * The description is written for the model: what it does, what it suits, what
 * it does not suit, and the parameter details.
 */
import { defineMcpTool, z } from '@openpen/module-api'

export const echoNoteTool = defineMcpTool({
  name: 'echo_note',
  description:
    'Echoes a short note back as plain text. ' +
    'Useful for checking that the plugin and the connection work. ' +
    'Does not draw, read the screen or change anything; the note must be plain text. ' +
    'The text parameter is the note to echo, up to a few sentences.',
  inputSchema: z.object({
    text: z.string().describe('The note to echo back, as plain text.'),
  }),
  // Unlisted fields default to the worst case (changes state, destructive,
  // open world), so declare what is true. Read-only tools stay available when
  // the user limits agents to read-only.
  annotations: { readOnly: true, destructive: false, idempotent: true, openWorld: false },
  handler: ({ text }) => text,
})
