/**
 * Child-process entry for the `openpen pack` MCP tool check. Imports the built
 * bundle with `vue` / `@openpen/module-api` stubbed (see mcp-pack-hooks.js) and
 * prints the declared tools on one marker-prefixed line. Runs in its own
 * process so a bundle with side effects cannot affect `pack` itself.
 *
 * Usage: node mcp-pack-runner.js <bundle path> <json: imported names per specifier>
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

export const RESULT_MARKER = '@@openpen-mcp-tools@@'

const [bundlePath, namesJson] = process.argv.slice(2)

register('./mcp-pack-hooks.js', {
  parentURL: import.meta.url,
  data: { names: JSON.parse(namesJson ?? '{}'), zodUrl: import.meta.resolve('zod') },
})

const mod = await import(pathToFileURL(bundlePath).href)
const tools = mod.default?.contributes?.mcpTools
const list = Array.isArray(tools) ? tools : []
console.log(
  RESULT_MARKER +
    JSON.stringify(list.map((tool) => ({ name: tool?.name, description: tool?.description }))),
)
process.exit(0)
