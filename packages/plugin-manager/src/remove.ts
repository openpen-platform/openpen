import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { pluginsDirFor } from './id.js'

/** Files the OS drops into folders on its own; a scope holding only these counts as empty. */
const OS_METADATA_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/**
 * Remove an installed plugin by id.
 *
 * Throws if the plugin directory does not exist. The enclosing @scope
 * directory is removed as well once it holds nothing but OS metadata files.
 */
export async function removePlugin(
  id: string,
  opts?: { pluginsDir?: string },
): Promise<void> {
  const pluginsDir = opts?.pluginsDir ?? path.join(os.homedir(), '.openpen', 'plugins')
  const destDir = pluginsDirFor(id, pluginsDir)
  if (!fs.existsSync(destDir)) {
    throw new Error(`Plugin not installed: ${id}`)
  }
  fs.rmSync(destDir, { recursive: true })

  const scopeDir = path.dirname(destDir)
  const entries = fs.readdirSync(scopeDir)
  if (entries.every((entry) => OS_METADATA_FILES.has(entry))) {
    for (const entry of entries) {
      fs.rmSync(path.join(scopeDir, entry))
    }
    fs.rmdirSync(scopeDir)
  }
}
