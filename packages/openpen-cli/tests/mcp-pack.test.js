import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { MCP_TOOLS_MIN_APP_VERSION, pluginToolPrefix } from '@openpen/module-api'

const CLI_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/openpen.js')
const PLUGIN_ID = '@demo/pack-fixture'

function packFixture({
  name = 'echo_note',
  description = 'Echo a note.',
  minAppVersion = MCP_TOOLS_MIN_APP_VERSION,
} = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-mcp-pack-'))
  try {
    fs.mkdirSync(path.join(cwd, 'dist'))
    fs.writeFileSync(path.join(cwd, 'plugin.json'), JSON.stringify({
      id: PLUGIN_ID,
      name: 'Pack Fixture',
      version: '0.1.0',
      minAppVersion: minAppVersion ?? undefined,
      renderer: 'dist/renderer.js',
    }))
    fs.writeFileSync(path.join(cwd, 'dist/renderer.js'), `
      import { defineModule, z } from '@openpen/module-api'
      export default defineModule({
        id: ${JSON.stringify(PLUGIN_ID)},
        contributes: {
          mcpTools: [{
            name: ${JSON.stringify(name)},
            ${description === null ? '' : `description: ${JSON.stringify(description)},`}
            inputSchema: z.object({ text: z.string() }),
            handler: ({ text }) => text,
          }],
        },
      })
    `)

    const { status, stdout, stderr, error } = spawnSync(process.execPath, [CLI_BIN, 'pack'], {
      cwd,
      encoding: 'utf8',
    })
    if (error) throw error

    return {
      status,
      output: stdout + stderr,
      archives: fs.readdirSync(cwd).filter((file) => file.endsWith('.zip')),
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

it('AC-14 rejects MCP tools with a missing description or an invalid name', () => {
  const longFullName = 'a'.repeat(129 - `${pluginToolPrefix(PLUGIN_ID)}__`.length)
  const cases = [
    { tool: { name: 'untitled_tool', description: null }, reason: /\bdescription\b/i },
    { tool: { name: 'verbose_tool', description: 'a'.repeat(2049) }, reason: /\bdescription\b.*(?:2[,.]?048|too long)|(?:2[,.]?048|too long).*\bdescription\b/i },
    { tool: { name: 'bad!tool' }, reason: /\binvalid(?:\s+|_)char(?:acter)?s?\b/i },
    { tool: { name: longFullName }, reason: /\b(?:too[ _]long|128)\b/i },
  ]

  for (const { tool, reason } of cases) {
    const result = packFixture(tool)
    expect.soft(result.status, `${tool.name}: ${result.output}`).toBeGreaterThan(0)
    if (result.status === 0) continue
    const diagnostic = result.output.split(/\r?\n/).find((line) => line.includes(tool.name) && reason.test(line))
    expect.soft(diagnostic, result.output).toBeDefined()
    expect.soft(result.archives).toEqual([])
  }
})

it('AC-11 and AC-14 reject packing an MCP tool for an older or unspecified app version', () => {
  for (const minAppVersion of ['1.0.0', null]) {
    const result = packFixture({ minAppVersion })
    expect.soft(result.status, `${minAppVersion ?? 'missing minAppVersion'}: ${result.output}`).toBeGreaterThan(0)
    if (result.status === 0) continue
    expect.soft(result.output).toContain('echo_note')
    expect.soft(result.output).toMatch(/minAppVersion/i)
    expect.soft(result.archives).toEqual([])
  }
})

it('AC-14 regression: a prerelease minAppVersion below 1.7.0 is rejected', () => {
  const result = packFixture({ minAppVersion: '1.7.0-beta.1' })

  expect(result.status, result.output).toBeGreaterThan(0)
  expect(result.output).toMatch(/\bminAppVersion\b/i)
})

it('AC-11 packs a valid MCP tool targeting a supported app version', () => {
  const result = packFixture()

  expect(result.status, result.output).toBe(0)
  expect(result.archives).toEqual(['demo-pack-fixture-0.1.0.zip'])
})
