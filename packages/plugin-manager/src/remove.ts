import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { pluginsDirFor } from './id.js'

/**
 * Remove an installed plugin by id.
 *
 * Throws if the plugin directory does not exist.
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
}
