/**
 * @openpen/module-api/host — Stroke Style
 *
 * Re-exports the public API of the host useStrokeStyle composable.
 * Module components MUST import from here, not from src/composables directly.
 *
 * Exposed here so module components can access it without cross-layer imports.
 */

// Re-export the public API functions that modules need.
// initStrokeStyleFromSettings is host-boot-only and intentionally NOT exported here.
export { useStrokeStyle } from '../../../../src/composables/useStrokeStyle'

// Re-export the StrokeColor type via the public SDK types (not host internals).
export type { StrokeColor } from '../types/tool'
