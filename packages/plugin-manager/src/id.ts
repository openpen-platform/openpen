import path from 'node:path'
import os from 'node:os'


/**
 * Regex for a valid scoped plugin id.
 *
 * Format: @<scope>/<name>
 * - scope and name: lowercase ASCII letters, digits, hyphens
 * - must start with a letter or digit (no leading hyphen)
 * - max 39 chars each (aligns with GitHub username/org limits)
 *
 * Mirrors MODULE_ID_RE in packages/module-api/src/validation.ts — keep in sync.
 */
export const PLUGIN_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/

/** Decompose a validated plugin id into its two parts. */
export function parsePluginId(id: string): { scope: string; name: string } {
  const m = PLUGIN_ID_RE.exec(id)
  if (!m) {
    throw new Error(
      `Invalid plugin id: "${id}". Expected @scope/name (e.g. @alice/my-plugin).` +
      ' Both scope and name must be lowercase ASCII letters, digits, or hyphens,' +
      ' starting with a letter or digit.'
    )
  }
  return { scope: m[1], name: m[2] }
}

/**
 * Compute the install directory for a given plugin id.
 *
 * base defaults to ~/.openpen/plugins.
 * Result: <base>/@<scope>/<name>
 */
export function pluginsDirFor(id: string, base?: string): string {
  const { scope, name } = parsePluginId(id)
  const root = base ?? path.join(os.homedir(), '.openpen', 'plugins')
  return path.join(root, `@${scope}`, name)
}
