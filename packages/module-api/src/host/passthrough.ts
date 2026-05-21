/**
 * @openpen/module-api/host — Passthrough Guard
 *
 * Proxies usePassthroughGuard through the host registry so module
 * components (and UIKit wrappers) can use it without reaching past the
 * package boundary.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const usePassthroughGuard: ModuleHost['usePassthroughGuard'] = (target) =>
  _useHost().usePassthroughGuard(target)
