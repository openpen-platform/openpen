#!/usr/bin/env node
/**
 * gen-shortcut-conflict-plugins.mjs
 *
 * Installs two demo plugins that both declare the same default shortcut
 * (CommandOrControl+Shift+M) so the shortcut conflict UI in
 * Settings → Shortcuts can be exercised.
 *
 * Alpha Tools registers first and wins the key.
 * Beta Suite registers second and is marked as conflicting (amber badge).
 *
 * Usage:   node examples/scripts/gen-shortcut-conflict-plugins.mjs
 * Cleanup: node examples/scripts/clear-shortcut-conflict-plugins.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins')

const PLUGINS = [
  {
    scope: '@demo',
    name: 'alpha-tools',
    display: 'Alpha Tools',
    desc: 'Demo plugin — Focus View shortcut (Cmd+Shift+M).',
    shortcut: {
      id: 'focus',
      keys: 'CommandOrControl+Shift+M',
      label: { en: 'Focus View', 'zh-Hant': '聚焦檢視', 'zh-Hans': '聚焦视图', ja: 'フォーカスビュー' },
      sublabel: { en: 'Alpha Tools — zoom canvas to selection' },
    },
  },
  {
    scope: '@demo',
    name: 'beta-suite',
    display: 'Beta Suite',
    desc: 'Demo plugin — Quick Mark shortcut (Cmd+Shift+M, conflicts with Alpha Tools).',
    shortcut: {
      id: 'quickmark',
      keys: 'CommandOrControl+Shift+M',
      label: { en: 'Quick Mark', 'zh-Hant': '快速標記', 'zh-Hans': '快速标记', ja: 'クイックマーク' },
      sublabel: { en: 'Beta Suite — insert a marker at cursor' },
    },
  },
]

for (const p of PLUGINS) {
  const dir = path.join(PLUGINS_DIR, p.scope, p.name)
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })

  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({
      id: `${p.scope}/${p.name}`,
      name: p.display,
      version: '1.0.0',
      author: 'OpenPen Test',
      description: p.desc,
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
    }, null, 2) + '\n',
  )

  const moduleId = `${p.scope}/${p.name}`
  const sc = p.shortcut
  fs.writeFileSync(
    path.join(dir, 'dist', 'renderer.js'),
    `export default {
  id: ${JSON.stringify(moduleId)},
  version: '1.0.0',
  contributes: {
    shortcuts: [
      {
        id: ${JSON.stringify(sc.id)},
        keys: ${JSON.stringify(sc.keys)},
        scope: 'global',
        label: ${JSON.stringify(sc.label)},
        sublabel: ${JSON.stringify(sc.sublabel)},
        userCustomizable: true,
        handler() {},
      },
    ],
  },
}\n`,
  )

  console.log(`  [+] ${moduleId}  (${p.display})`)
}

console.log(`\nInstalled ${PLUGINS.length} plugins in ${PLUGINS_DIR}`)
console.log('Restart OpenPen → Settings → Shortcuts to see the conflict badge on Beta Suite.')
console.log('To remove: node examples/scripts/clear-shortcut-conflict-plugins.mjs')
