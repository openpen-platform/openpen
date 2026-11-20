/**
 * Classified errors a tool handler can throw to tell the calling agent
 * what went wrong and what to do next. Anything that is NOT one of these
 * is reported to the agent as a generic internal error (the original
 * exception goes to the log only), so internals never leak.
 */

export type McpToolErrorKind =
  | 'invalid_params'
  | 'not_found'
  | 'user_action_required'
  | 'unavailable'

/**
 * Brand checked by {@link isMcpToolError}. A plugin bundle may carry its own
 * copy of this module, so `instanceof` alone is not reliable across the
 * host/plugin boundary.
 */
const MCP_TOOL_ERROR_BRAND = Symbol.for('openpen.mcp.tool-error')

export class McpToolError extends Error {
  readonly kind: McpToolErrorKind
  /** What the agent should do next. Required and non-empty. */
  readonly nextStep: string
  readonly [MCP_TOOL_ERROR_BRAND] = true

  constructor(kind: McpToolErrorKind, message: string, nextStep: string) {
    if (typeof nextStep !== 'string' || nextStep.trim() === '') {
      throw new TypeError(
        `[@openpen/module-api] ${kind} errors require a non-empty nextStep telling the agent what to do next.`
      )
    }
    super(message)
    this.name = new.target.name
    this.kind = kind
    this.nextStep = nextStep
  }

  /** Text handed to the agent: the message followed by the next step. */
  toAgentText(): string {
    return `${this.message} Next step: ${this.nextStep}`
  }
}

/** The arguments are well-formed but unacceptable (e.g. a value out of range). */
export class InvalidParamsError extends McpToolError {
  constructor(message: string, nextStep: string) {
    super('invalid_params', message, nextStep)
  }
}

/** The thing the call refers to does not exist. */
export class NotFoundError extends McpToolError {
  constructor(message: string, nextStep: string) {
    super('not_found', message, nextStep)
  }
}

/** The call cannot proceed until the human user does something. */
export class UserActionRequiredError extends McpToolError {
  constructor(message: string, nextStep: string) {
    super('user_action_required', message, nextStep)
  }
}

/** A temporary condition; retrying later may succeed. */
export class UnavailableError extends McpToolError {
  constructor(message: string, nextStep: string) {
    super('unavailable', message, nextStep)
  }
}

export function isMcpToolError(value: unknown): value is McpToolError {
  if (value instanceof McpToolError) return true
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[MCP_TOOL_ERROR_BRAND] === true &&
    typeof (value as McpToolError).nextStep === 'string' &&
    typeof (value as McpToolError).kind === 'string'
  )
}
