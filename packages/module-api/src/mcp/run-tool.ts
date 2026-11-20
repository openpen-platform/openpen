import type { z } from 'zod'
import type { McpToolContext, McpToolDefinition } from './define-tool'
import { isMcpToolError } from './errors'
import { isMcpImage } from './result'
import type { McpCallResult, McpContentItem, McpImage } from './result'

const INTERNAL_ERROR_TEXT = 'The tool failed unexpectedly.'

function errorResult(errorKind: NonNullable<McpCallResult['errorKind']>, text: string): McpCallResult {
  return { content: [{ type: 'text', text }], isError: true, errorKind }
}

function describeIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map(String).join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  try {
    return String(error)
  } catch {
    return 'Unprintable thrown value'
  }
}

function toContentItem(part: string | Record<string, unknown> | McpImage): McpContentItem {
  if (typeof part === 'string') return { type: 'text', text: part }
  if (isMcpImage(part)) return { type: 'image', data: part.data, mimeType: part.mimeType }
  return { type: 'text', text: JSON.stringify(part) }
}

/**
 * Validates `rawArgs`, runs the handler and converts its return value or
 * thrown error into an MCP-shaped result. Never throws. The host overlay and
 * `@openpen/module-api/testing` both call this, so what an author tests is
 * what the app runs.
 */
export async function runMcpTool(
  tool: McpToolDefinition,
  rawArgs: unknown,
  ctx: McpToolContext
): Promise<McpCallResult> {
  // A call without arguments arrives as `undefined` and means "no arguments";
  // `null` is a malformed value and must fail validation like any other.
  let parsed: ReturnType<typeof tool.inputSchema.safeParse>
  try {
    parsed = tool.inputSchema.safeParse(rawArgs === undefined ? {} : rawArgs)
  } catch (error) {
    // A refine()/transform() in the schema threw: a plugin bug, not bad input.
    ctx.log('error', `Tool "${tool.name}" input validation threw: ${describeUnknownError(error)}`)
    return errorResult('internal', INTERNAL_ERROR_TEXT)
  }
  if (!parsed.success) {
    return errorResult(
      'invalid_params',
      `Invalid arguments for "${tool.name}": ${describeIssues(parsed.error.issues)}. ` +
        `Next step: Correct the listed parameters and call the tool again, following the tool's inputSchema.`
    )
  }

  let returned: unknown
  try {
    returned = await tool.handler(parsed.data, ctx)
  } catch (error) {
    if (isMcpToolError(error)) {
      return errorResult(error.kind, `${error.message} Next step: ${error.nextStep}`)
    }
    ctx.log('error', `Tool "${tool.name}" threw: ${describeUnknownError(error)}`)
    return errorResult('internal', INTERNAL_ERROR_TEXT)
  }

  try {
    return convertReturn(tool, returned, ctx)
  } catch (error) {
    ctx.log('error', `Tool "${tool.name}" returned an unusable value: ${describeUnknownError(error)}`)
    return errorResult('internal', INTERNAL_ERROR_TEXT)
  }
}

function convertReturn(tool: McpToolDefinition, returned: unknown, ctx: McpToolContext): McpCallResult {
  if (Array.isArray(returned)) {
    return { content: returned.map(toContentItem) }
  }
  if (typeof returned === 'string') {
    return { content: [{ type: 'text', text: returned }] }
  }
  if (isMcpImage(returned)) {
    return { content: [toContentItem(returned)] }
  }
  if (typeof returned === 'object' && returned !== null) {
    if (tool.outputSchema) {
      const checked = tool.outputSchema.safeParse(returned)
      if (!checked.success) {
        ctx.log(
          'error',
          `Tool "${tool.name}" returned a value that does not match its outputSchema: ${describeIssues(checked.error.issues)}`
        )
        return errorResult('internal', INTERNAL_ERROR_TEXT)
      }
    }
    const structured = returned as Record<string, unknown>
    return {
      content: [{ type: 'text', text: JSON.stringify(structured) }],
      structuredContent: structured,
    }
  }
  throw new TypeError(`handler returned ${returned === null ? 'null' : typeof returned}`)
}
