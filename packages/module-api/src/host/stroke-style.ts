/**
 * @openpen/module-api/host — Stroke Style
 *
 * Proxies the useStrokeStyle composable through the host registry so
 * module components can read + write the global stroke style without
 * reaching past the package boundary. The reactive refs returned by
 * useStrokeStyle stay live across the proxy because the host registry
 * returns the singleton refs the host owns.
 *
 * initStrokeStyleFromSettings is host-boot-only and intentionally
 * NOT exposed here.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const useStrokeStyle: ModuleHost['useStrokeStyle'] = () =>
  _useHost().useStrokeStyle()

// Re-export the StrokeColor type via the public SDK types (not host internals).
export type { StrokeColor } from '../types/tool'
