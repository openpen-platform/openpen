/**
 * Convert a scoped module id to a vue-i18n-safe namespace key.
 *
 * vue-i18n uses `.` as path separator, so a raw id like `@openpen/freehand`
 * would be misinterpreted as a three-level path `['@openpen', 'freehand']`.
 * Stripping `@` and replacing `/` with `.` produces `openpen.freehand`,
 * which resolves correctly as a two-level namespace.
 *
 * @example
 * sanitizeIdForI18n('@openpen/freehand') // 'openpen.freehand'
 * sanitizeIdForI18n('@alice/todo')       // 'alice.todo'
 */
export function sanitizeIdForI18n(moduleId: string): string {
  return moduleId.replace(/^@/, '').replace(/\//g, '.')
}

/**
 * Maps a BCP-47 locale tag (e.g. `'en'`, `'zh-TW'`) to a localised string.
 *
 * Modules use this to declare i18n display names without coupling
 * themselves to the host app's i18n framework. The OpenPen registry
 * resolves the value at render time based on the active locale.
 */
export type LocaleMap = Record<string, string>

/**
 * Resolve a `string | LocaleMap` to a single string for a given locale.
 *
 * Resolution order (first match wins):
 *   1. Plain string → returned as-is
 *   2. Exact tag match (e.g. `'zh-TW'`)
 *   3. Language prefix match (e.g. `'zh'` for `'zh-Hans-CN'`)
 *   4. English fallback (`'en'`)
 *   5. First declared value in the map
 *   6. Empty string (only when the map is `{}`)
 */
export function resolveLabel(
  input: string | LocaleMap,
  locale: string
): string {
  if (typeof input === 'string') return input

  if (input[locale] !== undefined) return input[locale]

  const lang = locale.split('-')[0]
  if (lang !== locale && input[lang] !== undefined) return input[lang]

  if (input.en !== undefined) return input.en

  const first = Object.values(input)[0]
  return first ?? ''
}
