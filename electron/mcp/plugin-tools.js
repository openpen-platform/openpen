/**
 * Plugin MCP tools: naming, validity, collisions and annotation defaults.
 * Pure logic (no Electron imports) so it is unit-testable.
 *
 * Plugin code runs only in the overlay renderer, so main never sees a tool's
 * zod schema or handler. The primary overlay reports plain descriptions
 * (`PluginToolReport`) and this module turns them into the tool objects the
 * HTTP endpoint lists. Executing a call is the manager's job.
 */

import { mcpPluginToolItemSchema, mcpPluginGuideSchema, MAX_MCP_TOOLS } from '../ipc-payload-schemas.js';
import {
  MCP_PLUGIN_TOOL_NAME_MAX,
  MCP_PLUGIN_TOOL_NAME_RE,
  MCP_PLUGIN_TOOL_SEPARATOR,
} from '../../shared/mcp-constants.js';

/** Why a reported tool is not exposed. Shown in the settings plugin row. */
export const PLUGIN_TOOL_ISSUE_REASONS = Object.freeze(['invalid_chars', 'too_long', 'duplicate']);

/** `'@openpen/arrow'` -> `'openpen.arrow'`. Mirrors `pluginToolPrefix` in `@openpen/module-api`. */
export function pluginToolPrefix(pluginId) {
  return pluginId.replace(/^@/, '').replace('/', '.');
}

/** Full MCP name of a plugin tool. */
export function pluginToolFullName(pluginId, localName) {
  return `${pluginToolPrefix(pluginId)}${MCP_PLUGIN_TOOL_SEPARATOR}${localName}`;
}

/** @returns {{ ok: true } | { ok: false, reason: 'invalid_chars' | 'too_long' }} */
export function validatePluginToolName(fullName) {
  if (!MCP_PLUGIN_TOOL_NAME_RE.test(fullName)) return { ok: false, reason: 'invalid_chars' };
  if (fullName.length > MCP_PLUGIN_TOOL_NAME_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true };
}

/**
 * Turn the plugin's partial annotations into MCP hints. A field the plugin did
 * not set takes the worst case, so an unannotated tool is treated as one that
 * changes state destructively (and is hidden in read-only mode).
 */
export function toMcpAnnotations(annotations = {}) {
  const a = annotations ?? {};
  return {
    readOnlyHint: a.readOnly ?? false,
    destructiveHint: a.destructive ?? true,
    idempotentHint: a.idempotent ?? false,
    openWorldHint: a.openWorld ?? true,
  };
}

/** The `displayId` parameter every plugin tool accepts; the host strips it before the plugin sees the arguments. */
export const DISPLAY_ID_PROPERTY = Object.freeze({
  type: 'integer',
  description: 'Display id from get_state; defaults to the display under the cursor.',
});

/**
 * Add the host's optional `displayId` to a plugin's JSON Schema (the host's
 * definition wins). The host removes `displayId` before the call, so the
 * plugin's own `required` must not demand it either.
 */
export function withDisplayIdProperty(inputJsonSchema) {
  const schema = inputJsonSchema && typeof inputJsonSchema === 'object' ? inputJsonSchema : {};
  const { $schema: _ignored, required, ...rest } = schema;
  const stillRequired = Array.isArray(required) ? required.filter((name) => name !== 'displayId') : [];
  return {
    ...rest,
    type: 'object',
    properties: { ...(rest.properties ?? {}), displayId: { ...DISPLAY_ID_PROPERTY } },
    ...(stillRequired.length > 0 ? { required: stillRequired } : {}),
  };
}

/**
 * Check one overlay report item by item. A tool or a guide that breaks a limit
 * is dropped with a warning; everything else in the same report still
 * registers (one oversized guide must not take other plugins' tools with it).
 *
 * @param {{ tools?: unknown[], guides?: Record<string, unknown> }} payload
 * @param {{ logger?: { warn?: (...args: any[]) => void } }} [opts]
 * @returns {{ tools: PluginToolReport[], guides: Record<string, string> }}
 */
export function sanitizePluginReport(payload, { logger } = {}) {
  const rawTools = Array.isArray(payload?.tools) ? payload.tools : [];
  if (rawTools.length > MAX_MCP_TOOLS) {
    logger?.warn?.(`[mcp] plugin report lists ${rawTools.length} tools; only the first ${MAX_MCP_TOOLS} are registered`);
  }
  const tools = [];
  for (const raw of rawTools.slice(0, MAX_MCP_TOOLS)) {
    const parsed = mcpPluginToolItemSchema.safeParse(raw);
    if (parsed.success) {
      tools.push(parsed.data);
      continue;
    }
    const who = raw && typeof raw === 'object' ? `${String(raw.pluginId ?? '?').slice(0, 80)} ${String(raw.name ?? '?').slice(0, 80)}` : '?';
    const why = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'tool'}: ${i.message}`).join('; ');
    logger?.warn?.(`[mcp] plugin tool dropped (${who}): ${why}`);
  }
  const guides = {};
  for (const [pluginId, raw] of Object.entries(payload?.guides ?? {})) {
    const parsed = mcpPluginGuideSchema.safeParse({ pluginId, guide: raw });
    if (parsed.success) guides[pluginId] = parsed.data.guide;
    else logger?.warn?.(`[mcp] plugin guide dropped (${pluginId.slice(0, 80)}): ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return { tools, guides };
}

/**
 * @typedef {{
 *   pluginId: string,
 *   name: string,
 *   title?: string,
 *   description: string,
 *   inputJsonSchema: Record<string, any>,
 *   outputJsonSchema?: Record<string, any>,
 *   annotations?: { readOnly?: boolean, destructive?: boolean, idempotent?: boolean, openWorld?: boolean },
 * }} PluginToolReport
 */

/**
 * Name, validate and de-duplicate reported plugin tools.
 *
 * Plugins are processed in plugin-id order (their own tools keep the order
 * reported), so the first registrant of a name is stable: it keeps the name,
 * a later tool with the same full name (or one equal to a built-in) is not
 * exposed and recorded as `duplicate`.
 *
 * @param {PluginToolReport[]} reports
 * A plugin schema that already defines `displayId` is overridden by the host's
 * definition (the host strips it before the plugin sees the arguments); that is
 * logged as a warning so the author can rename the parameter.
 *
 * @param {{ builtinNames?: Iterable<string>, logger?: { warn?: (...args: any[]) => void } }} [opts]
 * @returns {{
 *   tools: Array<Record<string, any>>,
 *   issues: Record<string, Array<{ tool: string, fullName: string, reason: 'invalid_chars' | 'too_long' | 'duplicate' }>>,
 * }}
 */
export function buildPluginTools(reports, { builtinNames = [], logger } = {}) {
  const taken = new Set(builtinNames);
  const tools = [];
  /** @type {Record<string, Array<{ tool: string, fullName: string, reason: string }>>} */
  const issues = {};
  const ordered = [...reports]
    .map((report, index) => ({ report, index }))
    .sort((a, b) => (a.report.pluginId < b.report.pluginId ? -1 : a.report.pluginId > b.report.pluginId ? 1 : a.index - b.index))
    .map(({ report }) => report);

  for (const report of ordered) {
    const fullName = pluginToolFullName(report.pluginId, report.name);
    const verdict = validatePluginToolName(fullName);
    const reason = verdict.ok ? (taken.has(fullName) ? 'duplicate' : null) : verdict.reason;
    if (reason) {
      (issues[report.pluginId] ??= []).push({ tool: report.name, fullName, reason });
      continue;
    }
    taken.add(fullName);
    if (report.inputJsonSchema?.properties && Object.hasOwn(report.inputJsonSchema.properties, 'displayId')) {
      logger?.warn?.(`[mcp] plugin ${report.pluginId} tool ${report.name} defines its own "displayId"; the host's definition is used and the plugin never receives it`);
    }
    const annotations = toMcpAnnotations(report.annotations);
    tools.push({
      name: fullName,
      pluginId: report.pluginId,
      localName: report.name,
      title: report.title,
      description: report.description,
      readOnly: annotations.readOnlyHint === true,
      annotations,
      inputJsonSchema: withDisplayIdProperty(report.inputJsonSchema),
      outputJsonSchema: report.outputJsonSchema,
    });
  }
  return { tools, issues };
}
