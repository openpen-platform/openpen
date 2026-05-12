/**
 * CLI smoke test — verifies that `openpen plugin add <local-path>` delegates
 * to @openpen/plugin-manager and produces the correct install directory structure.
 *
 * Uses a fixture plugin directory with a pre-built dist/renderer.js so no
 * network access or build toolchain is required.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_BIN = path.resolve(__dirname, '../bin/openpen.js')
const FIXTURE_DIR = path.resolve(__dirname, 'fixture-plugin')

// ── Fixture setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  // Create a minimal built plugin fixture
  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(path.join(FIXTURE_DIR, 'dist'), { recursive: true })
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'plugin.json'),
      JSON.stringify({
        id: '@testscope/fixture-plugin',
        name: 'Fixture Plugin',
        version: '0.0.1',
        renderer: 'dist/renderer.js',
      }),
    )
    fs.writeFileSync(path.join(FIXTURE_DIR, 'dist', 'renderer.js'), '// fixture built')
  }
})

afterEach(() => {
  if (fs.existsSync(FIXTURE_DIR)) {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true })
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openpen plugin add <local-path>', () => {
  it('installs plugin to a custom plugins dir and prints success', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            // Override home so the default plugins dir goes to tmp
            HOME: tmpPluginsDir,
          },
        },
      )

      // Should exit 0
      expect(result.status).toBe(0)

      // Should mention the plugin id in output
      expect(result.stdout).toContain('@testscope/fixture-plugin')
      expect(result.stdout).toMatch(/installed/i)

      // Should have copied plugin.json and dist/renderer.js
      const installDir = path.join(tmpPluginsDir, '.openpen', 'plugins', '@testscope', 'fixture-plugin')
      expect(fs.existsSync(path.join(installDir, 'plugin.json'))).toBe(true)
      expect(fs.existsSync(path.join(installDir, 'dist', 'renderer.js'))).toBe(true)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
    }
  })

  it('exits with non-zero and prints error when dist/renderer.js is missing', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    const badFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-bad-fixture-'))
    try {
      // Create a fixture without dist/
      fs.writeFileSync(
        path.join(badFixture, 'plugin.json'),
        JSON.stringify({ id: '@testscope/nodist', name: 'NoDist', version: '1.0.0' }),
      )

      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', badFixture],
        {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpPluginsDir },
        },
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(/dist\/renderer\.js/i)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
      fs.rmSync(badFixture, { recursive: true, force: true })
    }
  })
})
