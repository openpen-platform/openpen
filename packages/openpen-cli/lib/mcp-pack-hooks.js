/**
 * Node ESM loader hooks used by `openpen pack` to import a built plugin bundle
 * without the plugin's dependencies installed. `vue`, `reka-ui` and
 * `@openpen/module-api` (and its sub-paths) resolve to generated stubs:
 * `defineModule` / `defineMcpTool` return their argument unchanged, `z` is the
 * real zod, and every other imported name is an inert placeholder. Nothing is
 * ever mounted or run; the check only reads `contributes.mcpTools`.
 */
const STUB_SCHEME = 'openpen-pack-stub:'

let stubNames = {}
let zodUrl = 'zod'

export function initialize(data) {
  stubNames = data?.names ?? {}
  zodUrl = data?.zodUrl ?? 'zod'
}

function isStubbed(specifier) {
  return (
    specifier === 'vue' || specifier.startsWith('vue/') ||
    specifier === 'reka-ui' || specifier.startsWith('reka-ui/') ||
    specifier === '@openpen/module-api' || specifier.startsWith('@openpen/module-api/')
  )
}

export async function resolve(specifier, context, nextResolve) {
  if (isStubbed(specifier)) {
    return { url: STUB_SCHEME + encodeURIComponent(specifier), shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith(STUB_SCHEME)) return nextLoad(url, context)
  const specifier = decodeURIComponent(url.slice(STUB_SCHEME.length))
  return { format: 'module', source: stubSource(specifier), shortCircuit: true }
}

function stubSource(specifier) {
  const lines = [
    // Callable, indexable placeholder: calling it returns its first argument
    // (so `defineComponent(options)` keeps working) or itself.
    'const noop = new Proxy(function () {}, { get: () => noop, apply: (_t, _this, args) => args[0] ?? noop })',
    'export default noop',
  ]
  const exported = new Set(['default'])
  if (specifier === '@openpen/module-api') {
    lines.push(
      `import { z as zod } from ${JSON.stringify(zodUrl)}`,
      'export const z = zod',
      'export const defineModule = (spec) => spec',
      'export const defineMcpTool = (def) => def',
    )
    exported.add('z').add('defineModule').add('defineMcpTool')
  }
  for (const name of stubNames[specifier] ?? []) {
    if (exported.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue
    exported.add(name)
    lines.push(`export const ${name} = noop`)
  }
  return lines.join('\n')
}
