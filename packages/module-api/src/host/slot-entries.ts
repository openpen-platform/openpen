/**
 * @openpen/module-api/host — Slot Entries Reader
 *
 * Re-exports getSlotEntries so module components can render UI driven
 * by other modules' contributions to the same slot (for example,
 * the shape-picker rendering all canvas.shapes contributions).
 */

export { getSlotEntries } from '../../../../src/core/runtime/contribution-store'
