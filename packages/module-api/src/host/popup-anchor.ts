/**
 * @openpen/module-api/host — Popup Anchor
 *
 * Proxies the `usePopupAnchor` composable and the `calculatePopupAnchor`
 * pure helper through the host registry so module components can position
 * popups relative to anchor elements without reaching past the package
 * boundary.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const usePopupAnchor: ModuleHost['usePopupAnchor'] = (options) =>
  _useHost().usePopupAnchor(options)

export const calculatePopupAnchor: ModuleHost['calculatePopupAnchor'] = (options) =>
  _useHost().calculatePopupAnchor(options)
