#!/usr/bin/env node
/**
 * gen-10-plugins.mjs
 *
 * Generates 10 distinct demo plugins directly under ~/.openpen/plugins/@demo/
 * so OpenPen sees them in the installed list on next launch.
 *
 * Usage:  node examples/scripts/gen-10-plugins.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins', '@demo')

const SAMPLES = [
  { name: 'todo',         display: 'Todo',            desc: 'A simple todo widget.' },
  { name: 'timer',        display: 'Timer',           desc: 'Countdown timer overlay.' },
  { name: 'pomodoro',     display: 'Pomodoro Focus',  desc: 'Pomodoro technique timer.' },
  { name: 'notes',        display: 'Quick Notes',     desc: 'Sticky notes overlay.' },
  { name: 'screenshot',   display: 'Screenshot',      desc: 'Screenshot annotation tool.' },
  { name: 'translator',   display: 'Translator',      desc: 'Inline translator.' },
  { name: 'highlighter',  display: 'Highlighter',     desc: 'Translucent highlighter pen.' },
  { name: 'ruler',        display: 'Ruler',           desc: 'On-screen pixel ruler.' },
  { name: 'colorpicker',  display: 'Color Picker',    desc: 'Pick colors from screen.' },
  { name: 'magnifier',    display: 'Magnifier',       desc: 'Screen magnifier loupe.' },
]

fs.mkdirSync(PLUGINS_DIR, { recursive: true })

for (const s of SAMPLES) {
  const dir = path.join(PLUGINS_DIR, s.name)
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({
      id: `@demo/${s.name}`,
      name: s.display,
      version: '1.0.0',
      author: 'OpenPen Test',
      description: s.desc,
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
    }, null, 2) + '\n',
  )

  fs.writeFileSync(
    path.join(dir, 'dist', 'renderer.js'),
    `export default { id: '@demo/${s.name}', version: '1.0.0', contributes: { tools: [] } }\n`,
  )

  console.log(`  [+] @demo/${s.name}  (${s.display})`)
}

console.log(`\nGenerated ${SAMPLES.length} plugins in ${PLUGINS_DIR}`)
console.log('Restart OpenPen to see them in Settings -> Modules -> Plugins.')
