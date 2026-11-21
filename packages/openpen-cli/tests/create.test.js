/**
 * `openpen create @scope/name` scaffold substitution tests.
 *
 * Verifies that the starter template is copied to the destination directory
 * with all placeholders replaced — including `package.json.name`, which is
 * the placeholder previously missed (template hardcodes "openpen-plugin-starter").
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_BIN = path.resolve(__dirname, '../bin/openpen.js')

describe('openpen create @scope/name', () => {
  it('substitutes the @scope/name into package.json, plugin.json, and module-id.ts', () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-create-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'create', '@demo/foo'],
        {
          encoding: 'utf-8',
          cwd: tmpdir,
          env: { ...process.env, HOME: tmpdir },
        },
      )

      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/Created plugin scaffold in \.\/foo\//)

      const pluginDir = path.join(tmpdir, 'foo')
      expect(fs.existsSync(pluginDir)).toBe(true)

      const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('@demo/foo')

      const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf-8'))
      expect(manifest.id).toBe('@demo/foo')

      const moduleId = fs.readFileSync(path.join(pluginDir, 'src/module-id.ts'), 'utf-8')
      expect(moduleId).toMatch(/@demo\/foo/)
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    }
  })

  it('keeps version / scripts and sets a plugin-specific description', () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-create-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'create', '@demo/bar'],
        {
          encoding: 'utf-8',
          cwd: tmpdir,
          env: { ...process.env, HOME: tmpdir },
        },
      )

      expect(result.status).toBe(0)

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpdir, 'bar', 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('@demo/bar')
      expect(pkg.version).toBe('0.1.0')
      expect(pkg.description).toBe('OpenPen plugin @demo/bar.')
      expect(pkg.scripts).toMatchObject({ build: 'openpen-build' })
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    }
  })

  it('prints next steps that end with a local install, not a release pack', () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-create-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'create', '@demo/baz'],
        {
          encoding: 'utf-8',
          cwd: tmpdir,
          env: { ...process.env, HOME: tmpdir },
        },
      )

      expect(result.status).toBe(0)
      const steps = result.stdout.split('Next steps:')[1].split('\n\n')[0].trim().split('\n').map((l) => l.trim())
      expect(steps).toEqual([
        'cd baz',
        'npm install',
        'npm run build',
        'npx openpen-cli plugin add .',
      ])
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    }
  })

  it('names the plugin in the README title and package.json description', () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-create-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [CLI_BIN, 'create', '@demo/my-tool'],
        { encoding: 'utf-8', cwd: tmpdir, env: { ...process.env, HOME: tmpdir } },
      )
      expect(result.status).toBe(0)

      const dir = path.join(tmpdir, 'my-tool')
      const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf-8')
      expect(readme).toMatch(/^# My Tool/)
      expect(readme).toMatch(/@demo\/my-tool/)
      expect(readme).not.toMatch(/Plugin Starter|minimal scaffold/)
      // the project already exists: its Quickstart must not tell the author to run create again
      expect(readme).not.toMatch(/openpen-cli create/)
      expect(readme).toMatch(/npm run pack/)
      // OpenPen run from source loads installed plugins, so the README must not say it does not
      expect(readme).not.toMatch(/dev server does not load/)
      expect(readme).toMatch(/OpenPen run from source/)
      expect(result.stdout).toMatch(/npm run pack/)
      expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toMatch(/^\*\.zip$/m)
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
      expect(pkg.description).toBe('OpenPen plugin @demo/my-tool.')
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    }
  })
})
