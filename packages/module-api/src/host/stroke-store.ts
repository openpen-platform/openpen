/**
 * @openpen/module-api/host — Stroke Store
 *
 * Re-exports the stroke store APIs that module tools need.
 * Only the minimum surface required by stroke-eraser (and similar tools)
 * is exposed: getAllStrokes, removeStrokeById, pushCommand.
 *
 * Host-internal state mutation helpers (clearAll, addStroke, undo, redo)
 * are intentionally NOT exported — modules must use hostCommands for
 * undo/redo and canvas clear.
 */

export {
  getAllStrokes,
  removeStrokeById,
  pushCommand,
} from '../../../../src/services/stroke-store'

// Re-export Stroke type via the public SDK types, not host internals.
export type { Stroke } from '../types/tool'
