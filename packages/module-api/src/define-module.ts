import { isValidModuleId } from './validation'
import { CONTRIBUTION_KEY_TO_SLOT_ID } from './slots'
import type { OpenPenModule } from './types/module'

/**
 * Identity helper for declaring an OpenPen module with full type
 * inference and runtime sanity checks. Throws `Error` (preflight) when:
 *
 *   - `id` is missing or has invalid characters
 *   - `contributes` is missing entirely
 *   - `contributes` has no contribution fields
 *   - `contributes` references a slot key not in the catalogue
 *
 * This is intentionally a small surface — full validation
 * (id collisions across modules, slot quota, settingsSchema parse, etc.)
 * happens later in the host app's `module-validator`. This helper
 * catches the obvious developer mistakes at the module's own boundary
 * so errors surface in the module's repo, not deep inside OpenPen.
 */
export function defineModule<TModule extends OpenPenModule>(
  spec: TModule
): TModule {
  if (!isValidModuleId(spec.id)) {
    throw new Error(
      `[@openpen/module-api] Invalid module id: ${JSON.stringify(spec.id)}. ` +
        `Module ids must use \`@scope/name\` format with lowercase ASCII alphanumeric + hyphen, ` +
        `max 39 chars per segment (e.g. \`@alice/my-plugin\`).`
    )
  }

  if (!spec.contributes || typeof spec.contributes !== 'object') {
    throw new Error(
      `[@openpen/module-api] Module "${spec.id}" must declare a non-empty 'contributes' object.`
    )
  }

  const keys = Object.keys(spec.contributes)
  if (keys.length === 0) {
    throw new Error(
      `[@openpen/module-api] Module "${spec.id}" must contribute to at least one slot. ` +
        `Add at least one field to 'contributes' (e.g. 'tools', 'settingsTabs', 'shortcuts').`
    )
  }

  for (const key of keys) {
    if (!(key in CONTRIBUTION_KEY_TO_SLOT_ID)) {
      throw new Error(
        `[@openpen/module-api] Module "${spec.id}" contributes to unknown slot key '${key}'. ` +
          `Known keys: ${Object.keys(CONTRIBUTION_KEY_TO_SLOT_ID).sort().join(', ')}.`
      )
    }
  }

  return spec
}
