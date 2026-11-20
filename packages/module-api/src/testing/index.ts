/**
 * Test helpers for plugin authors: `import { callMcpTool } from '@openpen/module-api/testing'`.
 * Runs a tool through the same `runMcpTool` the app uses, with a fake context.
 */
import type { McpToolContext, McpToolDefinition } from '../mcp/define-tool'
import type { McpCallResult } from '../mcp/result'
import { runMcpTool } from '../mcp/run-tool'

export interface McpTestLogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface McpTestProgressEntry {
  progress: number
  total?: number
  message?: string
}

/** Tool result plus what the handler reported through its context. */
export type McpTestCallResult = McpCallResult & {
  /** Every `ctx.log` call, in order. */
  logs: McpTestLogEntry[]
  /** Every `ctx.reportProgress` call, in order. */
  progress: McpTestProgressEntry[]
}

/**
 * Calls a tool as the app would: arguments are validated against
 * `inputSchema` first, so wrong arguments return an `invalid_params` error
 * and the handler does not run. `ctx` overrides the fake defaults
 * (displayId 0, an unaborted signal); caller-supplied `log` and
 * `reportProgress` are still invoked in addition to being recorded.
 */
export async function callMcpTool(
  tool: McpToolDefinition,
  args: unknown,
  ctx: Partial<McpToolContext> = {}
): Promise<McpTestCallResult> {
  const logs: McpTestLogEntry[] = []
  const progress: McpTestProgressEntry[] = []
  const context: McpToolContext = {
    displayId: ctx.displayId ?? 0,
    signal: ctx.signal ?? new AbortController().signal,
    reportProgress(value, total, message) {
      progress.push({ progress: value, total, message })
      ctx.reportProgress?.(value, total, message)
    },
    log(level, message) {
      logs.push({ level, message })
      ctx.log?.(level, message)
    },
  }
  const result = await runMcpTool(tool, args, context)
  return { ...result, logs, progress }
}
