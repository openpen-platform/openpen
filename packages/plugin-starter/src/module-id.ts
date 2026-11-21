/**
 * Canonical plugin id — MUST match the `id` field in plugin.json.
 *
 * Import from any component to avoid duplicating the string:
 *   import { MODULE_ID } from './module-id'
 *   const ctx = useModuleContext(MODULE_ID)
 */
export const MODULE_ID = '@your-scope/your-plugin-name'

/**
 * Prefix for every control-bar item, tool, cursor and popover id this plugin
 * registers, derived from `MODULE_ID` (`@acme/notes` → `acme.notes`). Control-bar
 * item ids must be unique across ALL loaded plugins, and the host skips the
 * plugins that share one, so never hard-code a bare id like `'my-button'` —
 * build it from this prefix: `` `${ID_PREFIX}.my-button` ``.
 */
export const ID_PREFIX = MODULE_ID.slice(1).replace('/', '.')
