/**
 * mcp-constants.js — constants shared by the MCP server (main process) and any
 * renderer that shows connection details. Free of Node.js / Electron imports.
 */

export const MCP_HOST = '127.0.0.1'
/** Default port, no auto-pick: AI apps store the URL, so it must not drift. Users may pick another one in settings. */
export const MCP_PORT = 17639
/** Ports the user may pick: below 1024 needs admin rights on some systems. */
export const MCP_PORT_MIN = 1024
export const MCP_PORT_MAX = 65535

/** Whether `value` is a port the user may save. */
export function isValidMcpPort(value) {
  return Number.isInteger(value) && value >= MCP_PORT_MIN && value <= MCP_PORT_MAX
}
export const MCP_PATH = '/mcp'
/** Request body cap; larger bodies get 413. */
export const MCP_MAX_BODY_BYTES = 1048576
export const MCP_TOOL_PREFIX = 'openpen__'
/** Full plugin tool names (`<prefix>__<tool>`) may be at most this long. Mirrors `MCP_TOOL_NAME_MAX` in `@openpen/module-api` (main never imports the SDK). */
export const MCP_PLUGIN_TOOL_NAME_MAX = 128
/** Characters MCP clients accept in a tool name. Mirrors `validateMcpToolName` in `@openpen/module-api`. */
export const MCP_PLUGIN_TOOL_NAME_RE = /^[A-Za-z0-9_.-]+$/
/** Separator between a plugin's prefix and its tool name. */
export const MCP_PLUGIN_TOOL_SEPARATOR = '__'
