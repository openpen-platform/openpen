/**
 * Scoped module / plugin ID format: `@scope/name`
 *
 * Rules:
 * - Must start with `@`
 * - scope: lowercase ASCII alphanumeric + hyphen, starts with letter or digit,
 *   max 39 chars (mirrors GitHub username/org limits)
 * - Single `/` separator
 * - name: same charset and length limit as scope
 *
 * The same regex is used by the OpenPen CLI (`openpen-cli`) and the
 * main process plugin loader, so plugin IDs round-trip safely between
 * `plugin.json`, filesystem paths under `~/.openpen/plugins/@scope/name/`,
 * and registry lookups.
 */
export const MODULE_ID_RE =
  /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/

/**
 * Returns `true` when `id` is a non-empty string that satisfies
 * {@link MODULE_ID_RE}; acts as a type guard narrowing `unknown` → `string`.
 *
 * @example
 * isValidModuleId('@openpen/freehand') // true
 * isValidModuleId('@alice/todo-app')   // true
 * isValidModuleId('freehand')          // false — must be scoped @scope/name
 * isValidModuleId('')                  // false — empty string rejected
 */
export function isValidModuleId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && MODULE_ID_RE.test(id)
}
