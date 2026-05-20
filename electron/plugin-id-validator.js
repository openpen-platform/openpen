/**
 * Shared plugin ID validation for the main process.
 *
 * The regex mirrors MODULE_ID_RE in packages/module-api/src/validation.ts.
 * Both must be kept in sync — the canonical definition lives in the
 * module-api package; this copy serves Electron's CommonJS/ESM main process
 * which cannot directly import from the TypeScript package at runtime.
 */

/** Scoped plugin ID pattern: `@scope/name` (lowercase, hyphen-only). */
export const MODULE_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/

/** Returns `true` when `id` is a valid scoped plugin identifier. */
export function isValidPluginId(id) {
  return typeof id === 'string' && MODULE_ID_RE.test(id)
}
