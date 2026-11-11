/**
 * The CLI and the author-facing docs must teach one command name:
 * `npx openpen-cli <verb>`. The bare `openpen` npm package is an unrelated
 * project, so any message or doc that says `npx openpen ...` sends the reader
 * to the wrong tool.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_BIN = path.resolve(__dirname, '../bin/openpen.js')
const REPO_ROOT = path.resolve(__dirname, '../../..')

// `npx openpen` not followed by `-cli`, or a bare `openpen <verb>` command.
const WRONG_NAME = /npx openpen(?![-\w])|(?<![-\w/.])openpen (?:create|pack|publish|plugin)\b/

// The reference docs (every language) name the wrong command once, on purpose, in the warning.
function withoutWarning(text) {
  return text
    .split('\n')
    .filter((line) => !line.includes('⚠️'))
    .join('\n')
    .replace(/never `npx openpen`/g, '')
    .replace(/`npx openpen \.\.\.`/g, '')
}

function run(args, { cwd, home } = {}) {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  return `${result.stdout}\n${result.stderr}`
}

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listMarkdown(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

describe('command name taught by the CLI output', () => {
  it('help, usage errors and pack next steps only name npx openpen-cli', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-cli-name-'))
    try {
      fs.mkdirSync(path.join(tmp, 'dist'))
      fs.writeFileSync(path.join(tmp, 'dist', 'renderer.js'), '// built')
      fs.writeFileSync(
        path.join(tmp, 'plugin.json'),
        JSON.stringify({ id: '@scope/name', name: 'Name', version: '0.0.1', renderer: 'dist/renderer.js' }),
      )
      const outputs = [
        run(['--help'], { cwd: tmp, home: tmp }),
        run(['plugin', '--help'], { cwd: tmp, home: tmp }),
        run(['create'], { cwd: tmp, home: tmp }),
        run(['plugin', 'add'], { cwd: tmp, home: tmp }),
        run(['plugin', 'install'], { cwd: tmp, home: tmp }),
        run(['plugin', 'remove'], { cwd: tmp, home: tmp }),
        run(['pack'], { cwd: tmp, home: tmp }),
      ]
      for (const output of outputs) {
        expect(output).not.toMatch(WRONG_NAME)
      }
      expect(outputs[0]).toContain('npx openpen-cli <command>')
      expect(outputs[6]).toContain('npx openpen-cli publish')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('author-facing docs', () => {
  it('teach the same command name and describe the catalog that exists', () => {
    const files = [
      ...listMarkdown(path.join(REPO_ROOT, 'docs')),
      ...listMarkdown(path.join(REPO_ROOT, 'tools/catalog-repo-template')),
      path.join(REPO_ROOT, 'packages/openpen-cli/README.md'),
      path.join(REPO_ROOT, 'packages/plugin-starter/README.md'),
      path.join(REPO_ROOT, 'packages/plugin-starter/package.json'),
    ]
    for (const file of files) {
      const text = withoutWarning(fs.readFileSync(file, 'utf-8'))
      expect(text, path.relative(REPO_ROOT, file)).not.toMatch(WRONG_NAME)
    }

    const publishing = fs.readFileSync(path.join(REPO_ROOT, 'docs/guides/publishing.md'), 'utf-8')
    expect(publishing).not.toMatch(/no central plugin registry/i)
    expect(publishing).toContain('npx openpen-cli publish')
  })
})
