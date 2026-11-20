/** Maximum length of a full tool name (`<prefix>__<tool>`). */
export const MCP_TOOL_NAME_MAX = 128
/** Maximum length of a tool description, in characters. */
export const MCP_TOOL_DESCRIPTION_MAX = 2048
/**
 * First app version that serves plugin MCP tools. Plugins that declare
 * `mcpTools` should set `minAppVersion` to at least this.
 */
export const MCP_TOOLS_MIN_APP_VERSION = '1.7.0'

const TOOL_NAME_CHARS_RE = /^[A-Za-z0-9_.-]+$/

/** `'@openpen/arrow'` → `'openpen.arrow'`: the namespace prefix of a plugin's tools. */
export function pluginToolPrefix(pluginId: string): string {
  return pluginId.replace(/^@/, '').replace('/', '.')
}

/** Checks a full tool name (prefix included) against MCP naming limits. */
export function validateMcpToolName(
  fullName: string
): { ok: true } | { ok: false; reason: 'invalid_chars' | 'too_long' } {
  if (!TOOL_NAME_CHARS_RE.test(fullName)) return { ok: false, reason: 'invalid_chars' }
  if (fullName.length > MCP_TOOL_NAME_MAX) return { ok: false, reason: 'too_long' }
  return { ok: true }
}
