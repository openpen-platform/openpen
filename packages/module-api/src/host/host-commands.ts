/**
 * @openpen/module-api/host — Host Commands
 *
 * Proxies hostCommands through the host registry so module components
 * can trigger host infrastructure actions (pin toggle, canvas clear,
 * undo/redo, drawing mode toggle) without reaching past the package
 * boundary. The exported object is a Proxy so every property access
 * fetches the live `hostCommands` from the registered host.
 */
import { _useHost } from './registry'
import type { ModuleHost } from './types'

export const hostCommands = new Proxy({} as ModuleHost['hostCommands'], {
  get(_target, prop) {
    return Reflect.get(_useHost().hostCommands as object, prop)
  },
})
