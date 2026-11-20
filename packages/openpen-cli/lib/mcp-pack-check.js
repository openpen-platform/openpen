/**
 * `openpen pack` check for plugin MCP tools (the `system.mcp.tools` slot).
 *
 * Imports `dist/renderer.js` in a child process (stubbed `vue` and
 * `@openpen/module-api`, see mcp-pack-hooks.js), reads `contributes.mcpTools`
 * and reports every tool whose full name is invalid, whose description is
 * missing or too long, or whose plugin.json `minAppVersion` is too old.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Mirrors MCP_TOOL_NAME_MAX, MCP_TOOL_DESCRIPTION_MAX, MCP_TOOLS_MIN_APP_VERSION,
// pluginToolPrefix and validateMcpToolName in packages/module-api/src/mcp/naming.ts.
// The CLI does not depend on module-api (it would pull in vue), so keep the two in sync.
export const MCP_TOOL_NAME_MAX = 128
export const MCP_TOOL_DESCRIPTION_MAX = 2048
export const MCP_TOOLS_MIN_APP_VERSION = '1.7.0'

const TOOL_NAME_CHARS_RE = /^[A-Za-z0-9_.-]+$/
const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-pack-runner.js')
const RESULT_MARKER = '@@openpen-mcp-tools@@'
const STUBBED_SPECIFIER_RE = /^(?:vue|reka-ui|@openpen\/module-api)(?:\/|$)/
const RUN_TIMEOUT_MS = 30_000

function pluginToolPrefix(pluginId) {
  return pluginId.replace(/^@/, '').replace('/', '.')
}

/**
 * Compares two semver strings and returns >0, 0 or <0. Build metadata (`+…`) is
 * ignored; a pre-release (`1.7.0-beta.1`) sorts below the release of the same
 * `major.minor.patch`, and pre-release identifiers compare as in semver.org §11.
 */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, ...rest] = String(v).split('+')[0].split('-')
    return {
      nums: core.split('.').map((n) => parseInt(n, 10) || 0),
      pre: rest.length > 0 ? rest.join('-').split('.') : null,
    }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (pa.pre === null && pb.pre === null) return 0
  if (pa.pre === null) return 1
  if (pb.pre === null) return -1
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/**
 * Pure rule check. `tools` is `[{ name, description }]`; returns one
 * human-readable line per problem, each naming the tool and the broken rule.
 */
export function validateMcpTools(pluginId, minAppVersion, tools) {
  const prefix = pluginToolPrefix(pluginId)
  const problems = []
  for (const tool of tools) {
    const label = `Tool "${tool.name}"`
    if (typeof tool.name !== 'string' || tool.name === '') {
      problems.push('A tool has no name.')
      continue
    }
    const fullName = `${prefix}__${tool.name}`
    if (!TOOL_NAME_CHARS_RE.test(fullName)) {
      problems.push(`${label}: the full name "${fullName}" has invalid characters (allowed: A-Z a-z 0-9 _ - .).`)
    } else if (fullName.length > MCP_TOOL_NAME_MAX) {
      problems.push(`${label}: the full name "${fullName}" is too long (${fullName.length} characters; the maximum is ${MCP_TOOL_NAME_MAX}).`)
    }
    if (typeof tool.description !== 'string' || tool.description.trim() === '') {
      problems.push(`${label}: description is missing. Describe what the tool does for the model.`)
    } else if (tool.description.length > MCP_TOOL_DESCRIPTION_MAX) {
      problems.push(`${label}: description is too long (${tool.description.length} characters; the maximum is ${MCP_TOOL_DESCRIPTION_MAX}).`)
    }
    if (typeof minAppVersion !== 'string' || minAppVersion === '') {
      problems.push(`${label}: plugin.json has no minAppVersion; plugins with MCP tools need ${MCP_TOOLS_MIN_APP_VERSION} or higher.`)
    } else if (compareVersions(minAppVersion, MCP_TOOLS_MIN_APP_VERSION) < 0) {
      problems.push(`${label}: plugin.json minAppVersion is "${minAppVersion}"; plugins with MCP tools need ${MCP_TOOLS_MIN_APP_VERSION} or higher.`)
    }
  }
  return problems
}

/** Names imported from stubbed modules, by scanning the bundle's import/export-from statements. */
function collectImportedNames(source) {
  const names = {}
  const re = /\b(?:import|export)\s*([\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g
  for (const [, , list, specifier] of source.matchAll(re)) {
    if (!STUBBED_SPECIFIER_RE.test(specifier)) continue
    const set = (names[specifier] ??= [])
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name && name !== 'default') set.push(name)
    }
  }
  return names
}

/**
 * Checks the built plugin in `cwd`. Returns `{ problems }` (empty when the
 * plugin is fine or declares no tools) and, when the bundle cannot be imported
 * but mentions `mcpTools`, `{ problems }` with one explanatory line instead.
 */
export function checkMcpTools(cwd, manifest) {
  const bundlePath = path.join(cwd, 'dist', 'renderer.js')
  const source = fs.readFileSync(bundlePath, 'utf-8')
  const run = spawnSync(
    process.execPath,
    [RUNNER, bundlePath, JSON.stringify(collectImportedNames(source))],
    { cwd, encoding: 'utf-8', timeout: RUN_TIMEOUT_MS },
  )

  const line = (run.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith(RESULT_MARKER))
  if (run.status === 0 && line) {
    const tools = JSON.parse(line.slice(RESULT_MARKER.length))
    return { problems: validateMcpTools(manifest.id, manifest.minAppVersion, tools) }
  }

  // The bundle could not be imported. Without MCP tools there is nothing to
  // check; with them, refuse rather than ship tools that were never inspected.
  if (!source.includes('mcpTools')) return { problems: [] }
  const reason = (run.error?.message ?? run.stderr ?? '').trim().split(/\r?\n/).filter(Boolean).pop() ?? 'unknown error'
  return {
    problems: [
      `Could not check the MCP tools: importing dist/renderer.js failed (${reason}). ` +
        'The bundle mentions mcpTools, so pack stops instead of skipping the check. ' +
        'Make the bundle importable in Node (no top-level browser-only code) and run pack again.',
    ],
  }
}
