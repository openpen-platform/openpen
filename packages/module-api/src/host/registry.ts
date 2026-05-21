/**
 * @openpen/module-api/host — Host runtime registry
 *
 * The host (OpenPen renderer process) calls `registerHost(impl)` once at
 * boot to inject its concrete implementation of the `ModuleHost` contract.
 * Module / plugin code consumes the surface through the proxy exports in
 * `./index.ts`, which fetch the registered implementation via `_useHost()`.
 *
 * This file is intentionally **not** re-exported from the package's `.`
 * entry. The renderer host imports it via the `@openpen/module-api/host/registry`
 * subpath; plugin code MUST NOT import from this path.
 *
 * The pattern follows the same dependency direction as VS Code's extension
 * host, Figma's plugin sandbox, Obsidian's plugin API, and Penpot's plugin
 * types: the SDK package owns the contract, the host injects the runtime.
 */
import type { ModuleHost } from './types'

/**
 * Module-scope state cannot live as a top-level `let` because production
 * bundles can load this file more than once (main app bundle + runtime
 * uikit bundle each carry their own copy when the host subpath is not
 * externalized in the import-map). Multiple copies of the module each get
 * their own `let registered`, so `registerHost()` writes one slot and
 * `_useHost()` reads the other — both raise the unregistered-host error.
 *
 * Stash the slot on globalThis under a unique Symbol so every copy of this
 * file resolves to the same store. Vue uses the same trick for shared
 * globals across bundlers (see VUE_OPTIONS_API symbol in @vue/runtime-core).
 */
interface HostStore {
  registered: ModuleHost | null
}

const HOST_STORE_KEY = Symbol.for('openpen.module-api.host-store') as unknown as PropertyKey

function getStore(): HostStore {
  type GlobalWithStore = typeof globalThis & { [k: PropertyKey]: HostStore | undefined }
  const g = globalThis as GlobalWithStore
  let store = g[HOST_STORE_KEY]
  if (!store) {
    store = { registered: null }
    g[HOST_STORE_KEY] = store
  }
  return store
}

/**
 * Inject the host's concrete `ModuleHost` implementation. **MUST** be called
 * exactly once, at app boot in `src/main.ts`, before any module/plugin code
 * imports from `@openpen/module-api/host`.
 *
 * @throws if called more than once.
 */
export function registerHost(impl: ModuleHost): void {
  const store = getStore()
  if (store.registered !== null) {
    throw new Error(
      '@openpen/module-api/host: registerHost called more than once. ' +
      'The host MUST register exactly once at boot.',
    )
  }
  store.registered = impl
}

/**
 * Internal: fetch the registered host implementation. Called by every proxy
 * in `./index.ts`. Plugin / module code MUST NOT import this directly —
 * use the proxies instead.
 *
 * @throws if `registerHost()` has not been called yet (fail-fast: catches
 * boot-order bugs before silent state corruption).
 */
export function _useHost(): ModuleHost {
  const store = getStore()
  if (store.registered === null) {
    throw new Error(
      '@openpen/module-api/host: host not registered. ' +
      'Call registerHost() at app boot (src/main.ts) before any module ' +
      'or plugin code imports from this subpath.',
    )
  }
  return store.registered
}

/**
 * Test-only: clears the registered host so a fresh `registerHost()` call
 * can be made in the next test. MUST NOT be called from production code.
 */
export function _resetHostRegistryForTest(): void {
  getStore().registered = null
}
