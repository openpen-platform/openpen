#!/usr/bin/env node
/**
 * clear-shortcut-conflict-plugins.mjs
 *
 * Removes the two demo plugins installed by gen-shortcut-conflict-plugins.mjs.
 *
 * Usage: node examples/scripts/clear-shortcut-conflict-plugins.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins')
const TARGETS = ['@demo/alpha-tools', '@demo/beta-suite']

for (const id of TARGETS) {
  const [scope, name] = id.split('/')
  const dir = path.join(PLUGINS_DIR, scope, name)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`  [-] ${id}`)
  } else {
    console.log(`  [~] ${id} not found, skipping`)
  }
}

console.log('\nDone. Restart OpenPen to apply.')
