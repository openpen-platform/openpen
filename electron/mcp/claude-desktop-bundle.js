/**
 * Hands the bundled Claude Desktop extension (OpenPen.mcpb) to the operating
 * system, which opens it with Claude Desktop and starts the install.
 *
 * Installed app: `<resources>/claude-desktop/OpenPen.mcpb` (package.json
 * build.extraResources). Development: `build/claude-desktop/OpenPen.mcpb`
 * from `npm run build:mcpb`. Pure Node so it runs under vitest.
 */

import fs from 'node:fs';
import path from 'node:path';

export const BUNDLE_FILE = 'OpenPen.mcpb';

/**
 * @param {{ isPackaged: boolean, resourcesPath: string, appPath: string }} env
 * @returns {string}
 */
export function bundlePath({ isPackaged, resourcesPath, appPath }) {
  return isPackaged
    ? path.join(resourcesPath, 'claude-desktop', BUNDLE_FILE)
    : path.join(appPath, 'build', 'claude-desktop', BUNDLE_FILE);
}

/**
 * @param {{ isPackaged: boolean, resourcesPath: string, appPath: string }} env
 * @param {{ exists?: (p: string) => boolean, openPath: (p: string) => Promise<string> }} deps
 *   `openPath` follows Electron's `shell.openPath`: resolves to '' on success, an error message otherwise.
 * @returns {Promise<{ ok: true } | { ok: false, error: 'missing' } | { ok: false, error: 'open-failed', message: string }>}
 */
export async function installClaudeDesktopBundle(env, { exists = fs.existsSync, openPath }) {
  const file = bundlePath(env);
  if (!exists(file)) return { ok: false, error: 'missing' };
  const message = await openPath(file);
  return message ? { ok: false, error: 'open-failed', message } : { ok: true };
}
