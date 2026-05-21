/**
 * CLI smoke + security-prompt tests.
 *
 * - Verifies that `openpen plugin add <local-path>` delegates to
 *   @openpen/plugin-manager and produces the correct install directory.
 * - Verifies the install-time security gate: `--yes` bypasses the prompt,
 *   non-TTY stdin without `--yes` aborts with a warning instead of silently
 *   installing.
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
  it('installs plugin to a custom plugins dir and prints success (with --yes)', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR, '--yes'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            HOME: tmpPluginsDir,
          },
        },
      )

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('@testscope/fixture-plugin')
      expect(result.stdout).toMatch(/installed/i)

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
      fs.writeFileSync(
        path.join(badFixture, 'plugin.json'),
        JSON.stringify({ id: '@testscope/nodist', name: 'NoDist', version: '1.0.0' }),
      )

      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', badFixture, '--yes'],
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

describe('openpen plugin install security prompt', () => {
  it('with --yes flag: skips the security prompt and proceeds to install', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR, '--yes'],
        {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpPluginsDir },
        },
      )

      expect(result.status).toBe(0)
      expect(result.stderr).not.toMatch(/full host access/i)
      expect(result.stderr).not.toMatch(/Install .* \[y\/N\]/i)
      const installDir = path.join(tmpPluginsDir, '.openpen', 'plugins', '@testscope', 'fixture-plugin')
      expect(fs.existsSync(installDir)).toBe(true)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
    }
  })

  it('with -y short flag: skips the security prompt and proceeds to install', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR, '-y'],
        {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpPluginsDir },
        },
      )

      expect(result.status).toBe(0)
      const installDir = path.join(tmpPluginsDir, '.openpen', 'plugins', '@testscope', 'fixture-plugin')
      expect(fs.existsSync(installDir)).toBe(true)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
    }
  })

  it('non-TTY stdin without --yes: exits non-zero with a security warning on stderr', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR],
        {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpPluginsDir },
        },
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/interactive terminal/i)
      expect(result.stderr).toMatch(/--yes/)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
    }
  })

  it('non-TTY stdin without --yes: does NOT create the plugin install directory', () => {
    const tmpPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-test-'))
    try {
      spawnSync(
        process.execPath,
        [CLI_BIN, 'plugin', 'add', FIXTURE_DIR],
        {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpPluginsDir },
        },
      )

      const installDir = path.join(tmpPluginsDir, '.openpen', 'plugins', '@testscope', 'fixture-plugin')
      expect(fs.existsSync(installDir)).toBe(false)
    } finally {
      fs.rmSync(tmpPluginsDir, { recursive: true, force: true })
    }
  })
})
