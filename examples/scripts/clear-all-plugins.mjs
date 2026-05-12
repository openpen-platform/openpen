#!/usr/bin/env node
/**
 * clear-all-plugins.mjs
 *
 * Removes every installed plugin under ~/.openpen/plugins/ (all scopes).
 *
 * Usage:  node examples/scripts/clear-all-plugins.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins')

if (!fs.existsSync(PLUGINS_DIR)) {
  console.log('Nothing to clear; plugins dir does not exist.')
  process.exit(0)
}

let count = 0
for (const scope of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
  if (!scope.isDirectory()) continue
  const scopeDir = path.join(PLUGINS_DIR, scope.name)
  for (const name of fs.readdirSync(scopeDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    fs.rmSync(path.join(scopeDir, name.name), { recursive: true, force: true })
    console.log(`  [-] ${scope.name}/${name.name}`)
    count++
  }
  fs.rmSync(scopeDir, { recursive: true, force: true })
}

console.log(`\nCleared ${count} plugin(s) from ${PLUGINS_DIR}`)
console.log('Restart OpenPen to refresh the installed list.')
