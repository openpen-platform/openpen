/**
 * Packs the Claude Desktop extension (claude-desktop/) into build/claude-desktop/OpenPen.mcpb
 * with Anthropic's official MCPB CLI. The manifest version is set to the app version so
 * the bundle shipped inside an installer always matches it. electron-builder copies the
 * result into the app's resources (package.json build.extraResources).
 *
 * Run via: node scripts/build-mcpb.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'claude-desktop')
const OUT_DIR = path.join(ROOT, 'build', 'claude-desktop')
const STAGE = path.join(OUT_DIR, 'stage')
const OUTPUT = path.join(OUT_DIR, 'OpenPen.mcpb')

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(path.join(STAGE, 'server'), { recursive: true })

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'))
manifest.version = version
fs.writeFileSync(path.join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
for (const file of fs.readdirSync(path.join(SRC, 'server'))) {
  fs.copyFileSync(path.join(SRC, 'server', file), path.join(STAGE, 'server', file))
}
fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(STAGE, 'icon.png'))

const cli = path.join(ROOT, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js')
const res = spawnSync(process.execPath, [cli, 'pack', STAGE, OUTPUT], { stdio: 'inherit' })
if (res.status !== 0) {
  console.error('build-mcpb: mcpb pack failed')
  process.exit(res.status ?? 1)
}
fs.rmSync(STAGE, { recursive: true, force: true })
console.log(`build-mcpb: ${path.relative(ROOT, OUTPUT)} (v${version})`)
