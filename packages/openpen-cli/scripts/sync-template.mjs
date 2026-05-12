#!/usr/bin/env node
/**
 * Copies packages/plugin-starter → packages/openpen-cli/templates/plugin-starter
 * so the starter ships inside the published `openpen-cli` tarball. Invoked by
 * the `prepack` lifecycle hook, which fires on both `npm pack` and `npm publish`.
 *
 * The monorepo source remains the single source of truth: contributors edit
 * `packages/plugin-starter/`, and this script propagates the snapshot at
 * pack-time. `templates/` is gitignored.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../../plugin-starter')
const DEST = path.resolve(__dirname, '../templates/plugin-starter')

const SKIP = new Set(['node_modules', 'dist', '.git'])

if (!fs.existsSync(path.join(SRC, 'plugin.json'))) {
  console.error(`Error: plugin-starter source not found at ${SRC}`)
  process.exit(1)
}

fs.rmSync(DEST, { recursive: true, force: true })
copyDir(SRC, DEST)
console.log(`[sync-template] ${path.relative(process.cwd(), SRC)} → ${path.relative(process.cwd(), DEST)}`)

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
