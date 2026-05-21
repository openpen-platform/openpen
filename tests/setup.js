/**
 * Vitest global test setup.
 *
 * - Polyfills browser APIs that jsdom does not implement but are used by
 *   third-party libraries (e.g. Reka UI SliderRoot uses ResizeObserver).
 * - Registers the host implementation against @openpen/module-api/host so
 *   the host-subpath proxies resolve. Production registers the same shape
 *   from src/main.ts at app boot.
 */
import { bootstrapHost } from '../src/host-bootstrap'

// ── ResizeObserver mock (required by Reka UI SliderRoot) ──────────────────────
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this._callback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

bootstrapHost()
