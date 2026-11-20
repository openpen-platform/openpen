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

// ── Web Storage from jsdom ────────────────────────────────────────────────────
// Node 25+ defines its own `localStorage` / `sessionStorage` globals, which are
// undefined unless Node runs with --localstorage-file. Vitest's jsdom
// environment does not copy window keys the Node global already has, so the
// Node getters shadow jsdom's and renderer code reading `localStorage` throws.
// Rebind both to the jsdom window's Storage. No-op on Node <25 and in the node
// environment (no `jsdom` global there).
if (globalThis.jsdom?.window) {
  for (const key of ['localStorage', 'sessionStorage']) {
    if (globalThis[key] instanceof globalThis.jsdom.window.Storage) continue
    Object.defineProperty(globalThis, key, {
      get: () => globalThis.jsdom.window[key],
      configurable: true,
      enumerable: true,
    })
  }
}

bootstrapHost()
