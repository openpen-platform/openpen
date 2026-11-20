import type { z } from 'zod'
import type { Point } from '../types/tool'
import type { McpToolReturn } from './result'

export interface McpToolAnnotations {
  /** The tool does not change anything. Default when omitted: false. */
  readOnly?: boolean
  /** The tool may destroy or overwrite data. Default when omitted: true. */
  destructive?: boolean
  /** Calling twice with the same arguments has no further effect. Default when omitted: false. */
  idempotent?: boolean
  /** The tool reaches outside the app (network, other systems). Default when omitted: true. */
  openWorld?: boolean
}

export interface McpToolContext {
  /** Display the call targets. */
  displayId: number
  /** Aborted when the AI app cancels the call. */
  signal: AbortSignal
  reportProgress(progress: number, total?: number, message?: string): void
  log(level: 'info' | 'warn' | 'error', message: string): void
  /**
   * Converts a point the agent gave in screenshot pixels of the target
   * display (origin at the screenshot's top-left, the coordinates every
   * OpenPen tool uses) into a canvas point for the strokes your plugin
   * draws. Accounts for the menu bar, the taskbar or dock, the display
   * scale factor and which display the call targets. Lengths such as a
   * line width are not converted.
   *
   * @example
   * const start = ctx.toCanvas({ x: args.x1, y: args.y1 })
   */
  toCanvas(point: Point): Point
}

/**
 * One MCP tool contributed through `contributes.mcpTools`
 * (slot `system.mcp.tools`, experimental).
 */
export interface McpToolDefinition<S extends z.ZodObject = z.ZodObject> {
  /** Name without the plugin prefix. Characters: A-Za-z0-9_-. */
  name: string
  /**
   * Human-readable title. Looked up as a key in the plugin's
   * `system.locales` for the app's current language; shown as-is when
   * no entry exists.
   */
  title?: string
  /** Description for the model. English, required, at most 2048 characters. */
  description: string
  /** zod 4 object schema. `.describe()` becomes the parameter description. */
  inputSchema: S
  outputSchema?: z.ZodObject
  annotations?: McpToolAnnotations
  handler(args: z.infer<S>, ctx: McpToolContext): McpToolReturn | Promise<McpToolReturn>
}

/**
 * Identity helper that infers handler argument types from `inputSchema`.
 * Only structural problems throw here; name and description limits are
 * reported by the host and by `openpen pack`.
 */
export function defineMcpTool<S extends z.ZodObject>(
  def: McpToolDefinition<S>
): McpToolDefinition<S> {
  if (!def || typeof def !== 'object') {
    throw new Error('[@openpen/module-api] defineMcpTool expects a tool definition object.')
  }
  if (typeof def.name !== 'string' || def.name === '') {
    throw new Error('[@openpen/module-api] defineMcpTool: `name` must be a non-empty string.')
  }
  const label = `MCP tool "${def.name}"`
  if (typeof def.description !== 'string') {
    throw new Error(`[@openpen/module-api] ${label}: \`description\` is required.`)
  }
  if (!def.inputSchema || typeof def.inputSchema.safeParse !== 'function') {
    throw new Error(`[@openpen/module-api] ${label}: \`inputSchema\` must be a zod object schema.`)
  }
  if (typeof def.handler !== 'function') {
    throw new Error(`[@openpen/module-api] ${label}: \`handler\` must be a function.`)
  }
  return def
}
