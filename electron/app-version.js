/**
 * openpen's own version, independent of how Electron was launched.
 *
 * `app.getVersion()` reads the version from the app's package.json only when
 * Electron is started with the app folder (`electron .`, `npm run dev`, the
 * packaged app). Started with a file path (`electron electron/main.js`, as the
 * e2e harness does), Electron finds no app package.json and reports its own
 * version (e.g. 42.x), which silently lets every plugin past `minAppVersion`.
 *
 * The root package.json sits next to `electron/` both in the repo and inside
 * the packaged app (electron-builder `files` includes it), so read it directly.
 */
import { app } from 'electron'
import { createRequire } from 'node:module'

/** @type {string | null} */
let cached = null

/** @returns {string} */
export function getAppVersion() {
  if (cached) return cached
  try {
    const { version } = createRequire(import.meta.url)('../package.json')
    if (typeof version === 'string' && version.length > 0) cached = version
  } catch {
    // Fall through to Electron's answer below.
  }
  cached ??= app.getVersion()
  return cached
}
