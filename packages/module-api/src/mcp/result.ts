/** Image payload a tool handler can return; build it with {@link image}. */
export interface McpImage {
  readonly type: 'image'
  /** Base64-encoded image bytes. */
  readonly data: string
  readonly mimeType: string
}

export type McpToolReturn =
  | string
  | Record<string, unknown>
  | McpImage
  | Array<string | Record<string, unknown> | McpImage>

export type McpErrorKind =
  | 'invalid_params'
  | 'not_found'
  | 'user_action_required'
  | 'unavailable'
  | 'internal'

export type McpContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

/** Result of one tool call, shaped like an MCP `CallToolResult`. */
export interface McpCallResult {
  content: McpContentItem[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  errorKind?: McpErrorKind
}

/** Wraps base64 image data so a handler can return it. */
export function image(data: string, mimeType: string): McpImage {
  return { type: 'image', data, mimeType }
}

export function isMcpImage(value: unknown): value is McpImage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as McpImage).type === 'image' &&
    typeof (value as McpImage).data === 'string' &&
    typeof (value as McpImage).mimeType === 'string'
  )
}
