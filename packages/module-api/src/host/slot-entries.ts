/**
 * @openpen/module-api/host — Slot Entries Reader
 *
 * Proxies getSlotEntries through the host registry so module components
 * can render UI driven by other modules' contributions to the same slot
 * (for example, the shape-picker rendering all canvas.shapes contributions).
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const getSlotEntries: ModuleHost['getSlotEntries'] = <T = unknown>(slotKey: string) =>
  _useHost().getSlotEntries<T>(slotKey)
