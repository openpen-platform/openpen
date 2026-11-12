// Syntax-checks main-process sources that eslint (src/ only) and vue-tsc do not cover.
// Uses `node --check`, so each file is parsed with the module type Node itself would
// pick (package.json "type": "module" for .js, CommonJS for .cjs, ESM for .mjs).
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['electron', 'shared']
const EXT = /\.(js|mjs|cjs)$/

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXT.test(entry.name)) yield full
  }
}

let checked = 0
let failed = 0
for (const dir of DIRS) {
  for (const file of walk(join(root, dir))) {
    checked++
    const res = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' })
    if (res.status !== 0) {
      failed++
      console.error(`\nSyntax error in ${relative(root, file)}`)
      console.error(res.stderr.trim())
    }
  }
}

if (failed > 0) {
  console.error(`\ncheck-syntax: ${failed} of ${checked} files failed`)
  process.exit(1)
}
console.log(`check-syntax: ${checked} files OK`)
