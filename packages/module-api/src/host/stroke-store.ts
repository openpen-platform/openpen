/**
 * @openpen/module-api/host — Stroke Store
 *
 * Proxies the stroke store read + history APIs through the host registry.
 * Only the minimum surface required by stroke-eraser (and similar tools)
 * is exposed: getAllStrokes, removeStrokeById, pushCommand.
 *
 * Host-internal state mutation helpers (clearAll, addStroke, undo, redo)
 * are intentionally NOT exposed here — modules must use hostCommands for
 * undo/redo and canvas clear.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const getAllStrokes: ModuleHost['getAllStrokes'] = () =>
  _useHost().getAllStrokes()

export const removeStrokeById: ModuleHost['removeStrokeById'] = (id) =>
  _useHost().removeStrokeById(id)

export const pushCommand: ModuleHost['pushCommand'] = (command) =>
  _useHost().pushCommand(command)

// Re-export Stroke type via the public SDK types, not host internals.
export type { Stroke } from '../types/tool'
