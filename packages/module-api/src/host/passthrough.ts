/**
 * @openpen/module-api/host — Passthrough Guard
 *
 * Re-exports usePassthroughGuard so module components (and UIKit wrappers)
 * can import from @openpen/module-api/host without cross-layer imports.
 *
 * Exposed here so module code can import without cross-layer relative paths.
 */

export { usePassthroughGuard } from '../../../../src/composables/usePassthroughGuard'
