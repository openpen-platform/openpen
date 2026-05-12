/**
 * @openpen/module-api/host — Domain Event Bus
 *
 * Re-exports the renderer-side event-bus emit/on so module components
 * can publish and subscribe without reaching into host runtime internals.
 * The bus is a process-local pub/sub for cross-module coordination.
 *
 * **Host-emitted events (consume via `on(name, cb)`):**
 *
 * | Event name                | Payload shape                                   | Fires when                                                           |
 * |---------------------------|-------------------------------------------------|----------------------------------------------------------------------|
 * | `'tool-changed'`          | `{ tool: string } & Partial<ToolConfig>`        | The active drawing tool changes (user click, IPC, or shortcut)       |
 * | `'stroke-style-changed'`  | `{ color?: StrokeColor; lineWidth?: number }`   | Color or stroke width changes                                        |
 * | `'canvas-redraw-requested'` | (no payload)                                  | A module wants the canvas to repaint (eraser, transformer, etc.)     |
 *
 * **Module-emitted events:** modules MAY emit any event name they
 * choose; the bus is namespace-free. Use a prefix (e.g. `'my-plugin:'`)
 * to avoid colliding with another module's events.
 *
 * `on(name, cb)` returns an unsubscribe function — register it via
 * `ctx.onDispose(unsubscribe)` so the listener is cleaned up when the
 * module unloads.
 *
 * @example
 * ```ts
 * import { on } from '@openpen/module-api/host'
 *
 * setup(ctx) {
 *   const off = on('tool-changed', (payload) => {
 *     console.log('tool now', payload.tool)
 *   })
 *   ctx.onDispose(off)
 * }
 * ```
 */

export { emit, on } from '../../../../src/core/runtime/event-bus'
