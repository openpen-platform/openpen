import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { MCP_TOOLS_MIN_APP_VERSION } from '@openpen/module-api'
import { compareSemver } from '../../../src/composables/usePluginMarketplace'

const CLI_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/openpen.js')

it('AC-12 scaffolds the MCP demo tool and its test with a compatible app version', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-create-mcp-'))
  try {
    const { status, stderr } = spawnSync(process.execPath, [CLI_BIN, 'create', '@demo/mcp-example'], {
      cwd,
      encoding: 'utf8',
    })
    expect(status, stderr).toBe(0)

    const pluginDir = path.join(cwd, 'mcp-example')
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'))
    expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/)
    const [appVersion] = manifest.minAppVersion.split('+')
    expect.soft(compareSemver(appVersion, MCP_TOOLS_MIN_APP_VERSION),
      `Expected minAppVersion ${appVersion} to be at least ${MCP_TOOLS_MIN_APP_VERSION}`)
      .toBeGreaterThanOrEqual(0)
    for (const file of ['src/mcp-demo-tool.ts', 'src/mcp-demo-tool.test.ts']) {
      expect.soft(fs.existsSync(path.join(pluginDir, file)), `Expected scaffold to include ${file}`).toBe(true)
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'))
    expect.soft(pkg.scripts?.test).toMatch(/\bvitest\b/)
    expect.soft(pkg.devDependencies?.vitest).toMatch(/\S/)
    const entry = fs.readFileSync(path.join(pluginDir, 'src/index.ts'), 'utf8')
    expect.soft(entry).toMatch(/\bmcpTools\s*:/)
    expect.soft(entry).toMatch(/\bfrom\s+['"]\.\/mcp-demo-tool(?:\.ts)?['"]/)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})
