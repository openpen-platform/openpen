/**
 * @openpen/module-api/host — Host Services Sub-module
 *
 * Exposes host shared services to module components via a clean sub-path
 * export. Module code MUST import from here instead of using cross-layer
 * '../../../' relative imports into src/composables or src/services.
 *
 * Module code MUST import from `@openpen/module-api/host` instead of
 * using cross-layer relative imports into src/.
 *
 * Design principle: this sub-module MUST NOT leak host internal
 * implementation types. All types are OpenPen SDK types (from ../types/).
 */

// ── Stroke Style ──────────────────────────────────────────────────────────────
export { useStrokeStyle } from './stroke-style'
export type { StrokeColor } from './stroke-style'

// ── Color Utilities ───────────────────────────────────────────────────────────
export {
  resolveColorStyle,
  hexToRgb,
  rgbToHex,
  hsvToRgb,
  rgbToHsv,
  hexToHsv,
  hsvToHex,
  isValidHex,
} from './color-utils'

// ── Stroke Store ──────────────────────────────────────────────────────────────
export { getAllStrokes, removeStrokeById, pushCommand, commitStroke } from './stroke-store'
export type { Stroke } from './stroke-store'

// ── Popup Anchor ──────────────────────────────────────────────────────────────
export { usePopupAnchor, calculatePopupAnchor } from './popup-anchor'

// ── Passthrough Guard ─────────────────────────────────────────────────────────
export { usePassthroughGuard } from './passthrough'

// ── Host Commands ─────────────────────────────────────────────────────────────
export { hostCommands } from './host-commands'

// ── Event Bus ─────────────────────────────────────────────────────────────────
export { emit, on } from './event-bus'

// ── Slot Entries ──────────────────────────────────────────────────────────────
export { getSlotEntries } from './slot-entries'

// ── Module Context Registry ───────────────────────────────────────────────────
// Used by the renderer host (module-loader.ts) to populate/clear the registry
// that backs `useModuleContext`. Plugin code MUST NOT import these directly.
export { setModuleContext, clearModuleContext } from './module-context-registry'
