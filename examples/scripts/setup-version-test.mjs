#!/usr/bin/env node
/**
 * setup-version-test.mjs
 *
 * Wipes ~/.openpen/plugins/, generates v1 / v2 / v3 source folders for a
 * single test plugin under examples/version-test/, and pre-installs
 * v2 so the host shows it in the installed list. Use the v1 / v3 source
 * folders to exercise downgrade / upgrade flows via the GUI's "Add source"
 * input.
 *
 * Usage:  node examples/scripts/setup-version-test.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../')

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins')
const FIXTURE_DIR = path.join(REPO_ROOT, 'specs', 'examples', 'version-test')

const SCOPE = 'demo'
const NAME = 'version-test'
const VERSIONS = ['1.0.0', '2.0.0', '3.0.0']
const PRE_INSTALL_VERSION = '2.0.0'

// 1. Wipe all installed plugins
if (fs.existsSync(PLUGINS_DIR)) {
  fs.rmSync(PLUGINS_DIR, { recursive: true, force: true })
  console.log(`cleared ${PLUGINS_DIR}`)
}
fs.mkdirSync(PLUGINS_DIR, { recursive: true })

// 2. Generate v1 / v2 / v3 source folders
if (fs.existsSync(FIXTURE_DIR)) {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true })
}

for (const v of VERSIONS) {
  const dir = path.join(FIXTURE_DIR, `v${v.split('.')[0]}`)
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({
      id: `@${SCOPE}/${NAME}`,
      name: 'Version Test',
      version: v,
      author: 'OpenPen Test',
      description: `Test fixture for version comparison flows. v${v}`,
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
      changelog: [
        `v${v} sample change one — feature added.`,
        `v${v} sample change two — bug fixed.`,
        `v${v} sample change three — performance improved.`,
      ],
    }, null, 2) + '\n',
  )

  fs.writeFileSync(
    path.join(dir, 'dist', 'renderer.js'),
    `export default { id: '@${SCOPE}/${NAME}', version: '${v}', contributes: { tools: [] } }\n`,
  )

  console.log(`generated ${dir}`)
}

// 3. Pre-install v2
const preInstallDir = path.join(FIXTURE_DIR, `v${PRE_INSTALL_VERSION.split('.')[0]}`)
const targetDir = path.join(PLUGINS_DIR, `@${SCOPE}`, NAME)
fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.cpSync(preInstallDir, targetDir, { recursive: true })
console.log(`installed v${PRE_INSTALL_VERSION} -> ${targetDir}`)

console.log('\nReady. Restart OpenPen, then in Settings -> Modules -> Plugins:')
console.log(`  upgrade test:    + Add source -> ${path.join(FIXTURE_DIR, 'v3')}`)
console.log(`  reinstall test:  + Add source -> ${path.join(FIXTURE_DIR, 'v2')}`)
console.log(`  downgrade test:  + Add source -> ${path.join(FIXTURE_DIR, 'v1')}`)
