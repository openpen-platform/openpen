/**
 * Built-in module registry.
 *
 * Hand-maintained list of first-party modules shipped with OpenPen.
 * Adding a new built-in module = creating `src/core/modules/<id>/index.ts`
 * (default export must `satisfies OpenPenModule`) and pushing it here.
 *
 * Insertion order is the load order. Order matters when modules consume
 * each other's contributions during `setup()`.
 *
 * Host infrastructure exceptions:
 * pin / clear-canvas / undo-redo / drawing-mode-toggle / theme / language
 * belong to host chrome / infrastructure and are not implemented as modules;
 * exposed via src/services/host-commands.ts instead.
 */
import type { OpenPenModule } from '@openpen/module-api'
import freehand from './freehand'
import line from './line'
import shape from './shape'
import eraser from './eraser'
import strokeEraser from './stroke-eraser'
import strokeWidth from './stroke-width'
import color from './color'
import summonToCursor from './summon-to-cursor'

export const BUILT_IN_MODULES: readonly OpenPenModule[] = [
  freehand,
  line,
  shape,
  eraser,
  strokeEraser,
  strokeWidth,
  color,
  summonToCursor,
]
