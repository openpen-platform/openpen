import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { PluginEntry } from './types.js'
import { PLUGIN_ID_RE } from './id.js'

/**
 * Return all installed plugins by scanning the two-level directory tree:
 * <pluginsDir>/@<scope>/<name>/plugin.json
 */
export async function listInstalled(opts?: { pluginsDir?: string }): Promise<PluginEntry[]> {
  const pluginsDir = opts?.pluginsDir ?? path.join(os.homedir(), '.openpen', 'plugins')
  const results: PluginEntry[] = []

  if (!fs.existsSync(pluginsDir)) return results

  const scopeEntries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('@'))

  for (const scopeEntry of scopeEntries) {
    const scopeDir = path.join(pluginsDir, scopeEntry.name)
    const nameEntries = fs.readdirSync(scopeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())

    for (const nameEntry of nameEntries) {
      const pluginDir = path.join(scopeDir, nameEntry.name)
      const manifestPath = path.join(pluginDir, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const json = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>
        if (!json.id || !json.name || !json.version) continue

        const id = json.id as string
        if (!PLUGIN_ID_RE.test(id)) continue

        const [, scope, name] = PLUGIN_ID_RE.exec(id)!
        results.push({
          id,
          scope,
          name,
          version: json.version as string,
          // installedAt is not persisted in plugin.json; use mtime as best-effort.
          installedAt: fs.statSync(manifestPath).mtime.toISOString(),
        })
      } catch {
        // Skip malformed manifests silently — caller sees only valid entries.
      }
    }
  }

  return results
}
