/**
 * Files a freshly scaffolded plugin project must contain: a license that matches
 * the declared one, and a .gitignore that keeps dependencies and build output
 * out of the first commit. Also checks the packed tarball still delivers them.
 *
 * The CLI runs from a throwaway copy of the package so these tests never touch
 * the shared `templates/` snapshot that other test files read in parallel.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const GITHUB_BASE = 'https://github.com/openpen-platform/openpen/'

let sandbox
let cliBin

function run(cmd, args, options) {
  return spawnSync(cmd, args, { encoding: 'utf-8', ...options })
}

function scaffold(bin, id, name) {
  const work = fs.mkdtempSync(path.join(sandbox, 'work-'))
  const result = run(process.execPath, [bin, 'create', id], {
    cwd: work,
    env: { ...process.env, HOME: work, USERPROFILE: work },
  })
  expect(result.status).toBe(0)
  return path.join(work, name)
}

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-scaffold-test-'))
  const cliDir = path.join(sandbox, 'packages/openpen-cli')
  const starterDir = path.join(sandbox, 'packages/plugin-starter')
  fs.mkdirSync(cliDir, { recursive: true })
  for (const entry of ['bin', 'lib', 'scripts', 'package.json']) {
    fs.cpSync(path.join(REPO_ROOT, 'packages/openpen-cli', entry), path.join(cliDir, entry), { recursive: true })
  }
  fs.cpSync(path.join(REPO_ROOT, 'packages/plugin-starter'), starterDir, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src),
  })
  // Dependencies of the CLI resolve through the repo's installed node_modules.
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction')
  cliBin = path.join(cliDir, 'bin/openpen.js')
})

afterAll(() => {
  // Remove every junction first so recursive removal cannot follow one into the repo.
  const links = [path.join(sandbox, 'node_modules')]
  for (const entry of fs.readdirSync(sandbox)) {
    if (entry.startsWith('extract-')) links.push(path.join(sandbox, entry, 'node_modules'))
  }
  for (const link of links) {
    try {
      fs.rmSync(link, { force: true })
    } catch {
      // Already gone or not a link; the recursive removal below is the backstop.
    }
  }
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('scaffolded project files', () => {
  it('ships a license file that matches the license declared in package.json', () => {
    const dir = scaffold(cliBin, '@demo/lic', 'lic')
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
    const license = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf-8')

    expect(pkg.license).toBe('MIT')
    expect(license).toMatch(/^MIT License/)
    expect(license).toContain(`Copyright (c) ${new Date().getFullYear()} demo`)
    expect(license).not.toMatch(/\{\{year\}\}|your-github-username/)
  })

  it('keeps dependencies and build output out of a first `git add -A`', () => {
    const dir = scaffold(cliBin, '@demo/ign', 'ign')
    expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'gitignore'))).toBe(false)

    fs.mkdirSync(path.join(dir, 'node_modules/dep'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules/dep/index.js'), '')
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'dist/index.js'), '')

    expect(run('git', ['init'], { cwd: dir }).status).toBe(0)
    expect(run('git', ['add', '-A'], { cwd: dir }).status).toBe(0)
    const tracked = run('git', ['ls-files'], { cwd: dir }).stdout.split('\n').filter(Boolean)

    expect(tracked.filter((f) => f.startsWith('node_modules/') || f.startsWith('dist/'))).toEqual([])
    expect(tracked).toEqual(expect.arrayContaining(['.gitignore', 'LICENSE', 'package.json']))
  })

  it('has README links that are absolute and point at docs that exist in the repo', () => {
    const dir = scaffold(cliBin, '@demo/rdm', 'rdm')
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf-8')
    // Links are checked against the local checkout and assume the same paths exist on `main`.
    const targets = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])

    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(target.startsWith(GITHUB_BASE)).toBe(true)
      const repoPath = target.slice(GITHUB_BASE.length).replace(/^(blob|tree)\/main\//, '')
      expect(fs.existsSync(path.join(REPO_ROOT, repoPath))).toBe(true)
    }
    expect(readme).not.toMatch(/degit/)
  })

  it('creates a project with license and .gitignore when run from the packed tarball', () => {
    const cliDir = path.join(sandbox, 'packages/openpen-cli')
    const packDir = fs.mkdtempSync(path.join(sandbox, 'pack-'))
    // One command string with `shell: true`: `npm` is a .cmd shim on Windows.
    const pack = run(`npm pack --pack-destination "${packDir}"`, [], { cwd: cliDir, shell: true })
    expect(pack.status).toBe(0)

    const tgz = fs.readdirSync(packDir).find((f) => f.endsWith('.tgz'))
    const extractDir = fs.mkdtempSync(path.join(sandbox, 'extract-'))
    // Relative archive name: GNU tar reads `C:\...` as a remote host.
    expect(run('tar', ['-xzf', tgz, '-C', extractDir], { cwd: packDir }).status).toBe(0)
    const pkgDir = path.join(extractDir, 'package')
    expect(fs.existsSync(path.join(pkgDir, 'templates/plugin-starter/plugin.json'))).toBe(true)
    // No monorepo sibling here: the starter can only come from the tarball's templates/.
    expect(fs.existsSync(path.join(extractDir, 'plugin-starter'))).toBe(false)
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(extractDir, 'node_modules'), 'junction')

    const dir = scaffold(path.join(pkgDir, 'bin/openpen.js'), '@demo/packed', 'packed')
    expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toMatch(/^node_modules$/m)
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toMatch(/^dist$/m)
    expect(fs.existsSync(path.join(dir, 'LICENSE'))).toBe(true)
  }, 120000)
})
