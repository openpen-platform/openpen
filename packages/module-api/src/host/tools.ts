/**
 * @openpen/module-api — public tool activation
 *
 * Re-exported from the package's main entry (not from `./index.ts` of this
 * folder) because the plugin runtime import map only resolves the main entry
 * and `/uikit`.
 */
import { _useHost } from './registry'

/**
 * Make `toolId` the active tool. The matching control bar button lights up
 * on every display and every canvas switches to the tool.
 *
 * `toolId` must be the `id` of a `canvas.tools` contribution (built-in or
 * from any loaded module). An unknown id is ignored with a console warning
 * and changes nothing.
 */
export function activateTool(toolId: string): void {
  _useHost().hostCommands.tools.activate(toolId)
}
