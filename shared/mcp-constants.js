/**
 * mcp-constants.js — constants shared by the MCP server (main process) and any
 * renderer that shows connection details. Free of Node.js / Electron imports.
 */

export const MCP_HOST = '127.0.0.1'
/** Fixed port, no auto-pick: AI apps store the URL, so it must not drift. */
export const MCP_PORT = 17639
export const MCP_PATH = '/mcp'
/** Request body cap; larger bodies get 413. */
export const MCP_MAX_BODY_BYTES = 1048576
export const MCP_TOOL_PREFIX = 'openpen__'
