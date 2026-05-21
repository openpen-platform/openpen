#!/usr/bin/env node
/**
 * Copy non-compiled static assets (CSS tokens) from src/ into dist/ so the
 * "./uikit/tokens.css" subpath export resolves on installed consumers.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')

const COPIES = [
  ['src/uikit/tokens.css', 'dist/uikit/tokens.css'],
]

for (const [from, to] of COPIES) {
  const src = resolve(PKG_ROOT, from)
  const dest = resolve(PKG_ROOT, to)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  console.log(`copied ${from} → ${to}`)
}
