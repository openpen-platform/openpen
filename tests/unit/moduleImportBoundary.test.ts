/**
 * Module import boundary test.
 *
 * Mirrors brief-bloom's `tests/core/boundaries/module-import-boundary.test.ts`
 * approach: regex-scan every TS / Vue source file under
 * `src/core/modules/**` and the example plugin, extract import
 * specifiers, and reject anything that isn't on the allowlist.
 *
 * Allowed import shapes:
 *   - Relative paths (`./`, `../`) that resolve WITHIN the file's module root
 *   - `@openpen/module-api` (the public SDK)
 *   - `node:*` (only relevant for plugin main-side handlers)
 *   - Bare third-party packages (vue, zod, etc.)
 *
 * Module root rules:
 *   - Built-in modules: `src/core/modules/<id>/` — any file inside foo/
 *     may import relatively only within src/core/modules/foo/
 *   - Example / starter plugins: the entire `src/` directory is the root
 *
 * All host-internal shims have been promoted
 * into @openpen/module-api/uikit or @openpen/module-api/host. There is
 * no longer a TRANSITIONAL_ALLOWLIST — the boundary is now clean.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)

const SCAN_ROOTS = [
  'src/core/modules',
  'examples/openpen-demo-plugin/src',
  'packages/plugin-starter/src',
]

/**
 * Bare specifiers that are explicitly forbidden for module code.
 * These are host-internals or Node/Electron APIs that modules must
 * never depend on directly — they would lock the module to the host
 * runtime and break the plugin sandbox model.
 */
const FORBIDDEN_SPECIFIERS: ReadonlyArray<RegExp> = [
  // Electron main-process APIs: modules run in the renderer and must
  // communicate with the main process only through @openpen/module-api.
  /^electron$/,
  /^electron\//,
  // Node builtins without the node: prefix — prefer 'node:fs' over 'fs'
  // so the intent is explicit (allowed via the node: check above).
  /^(fs|path|os|crypto|stream|http|https|net|child_process|worker_threads)$/,
  // Host-only injection seam: only the renderer bootstrap (src/host-bootstrap.ts)
  // is allowed to import this subpath. Plugin / module code MUST consume the
  // host via the proxy exports in @openpen/module-api/host instead.
  /^@openpen\/module-api\/host\/registry$/,
]

const IMPORT_FROM_RE = /(?:^|\s)import\s+[^'"\n]+from\s+['"]([^'"\n]+)['"]/g
const IMPORT_SIDE_EFFECT_RE = /(?:^|\s)import\s+['"]([^'"\n]+)['"]/g
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g
const VUE_SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/i

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (
      /\.(ts|js|mjs|vue)$/.test(entry.name) &&
      // Exclude test files — test infrastructure may reach into runtime internals.
      !/\.test\.(ts|js)$/.test(entry.name) &&
      // Exclude the module registry — it's host infrastructure, not a module.
      entry.name !== 'registry.ts'
    ) {
      yield full
    }
  }
}

function extractScript(source: string, file: string): string {
  if (file.endsWith('.vue')) {
    const m = source.match(VUE_SCRIPT_RE)
    return m?.[1] ?? ''
  }
  return source
}

function extractImports(text: string): string[] {
  const out: string[] = []
  for (const re of [IMPORT_FROM_RE, IMPORT_SIDE_EFFECT_RE, REQUIRE_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      out.push(m[1])
    }
  }
  return out
}

/**
 * Derive the module root directory for a given file path.
 *
 * - Built-in modules under src/core/modules/<id>/ → root is src/core/modules/<id>/
 *   Files may be in subdirectories (e.g. icons/), but the root is always the
 *   immediate child of src/core/modules/ that contains the file.
 * - All other scanned roots (plugin examples, starter) → root is the scan root itself.
 */
function getModuleRoot(filePath: string): string {
  const modulesDir = path.join(repoRoot, 'src/core/modules')
  if (filePath.startsWith(modulesDir + path.sep)) {
    // One path segment after modulesDir/ is the module id directory.
    const rel = path.relative(modulesDir, filePath)
    const moduleId = rel.split(path.sep)[0]
    return path.join(modulesDir, moduleId)
  }
  // For plugin scan roots, use the scan root as the module root.
  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(repoRoot, root)
    if (filePath.startsWith(absRoot + path.sep)) {
      return absRoot
    }
  }
  return path.dirname(filePath)
}

function isAllowed(spec: string, filePath: string): boolean {
  // Explicitly forbidden — checked first so they can't slip through as bare.
  if (FORBIDDEN_SPECIFIERS.some((re) => re.test(spec))) return false

  // Relative imports — only allowed if they resolve within the module root.
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const moduleRoot = getModuleRoot(filePath)
    const fileDir = path.dirname(filePath)
    const resolved = path.resolve(fileDir, spec)
    // The resolved path must start with the module root.
    if (!resolved.startsWith(moduleRoot + path.sep) && resolved !== moduleRoot) {
      return false
    }
    return true
  }
  // SDK
  if (spec === '@openpen/module-api' || spec.startsWith('@openpen/module-api/')) {
    return true
  }
  // node: builtins (main-side handlers)
  if (spec.startsWith('node:')) return true

  // Bare package names: scoped (`@scope/pkg`) or unscoped (`pkg`).
  // We disallow anything with a relative path that ISN'T the patterns above
  // (handled). Bare specifiers are always third-party packages from the
  // module's own package.json — out of scope for this test, those are the
  // module author's responsibility.
  const isBare = !spec.startsWith('/') && !spec.startsWith('.')
  if (isBare) return true

  return false
}

interface Violation {
  file: string
  spec: string
}

function scanRoot(root: string): Violation[] {
  const violations: Violation[] = []
  for (const file of walk(path.join(repoRoot, root))) {
    const source = fs.readFileSync(file, 'utf-8')
    const script = extractScript(source, file)
    if (!script.trim()) continue
    for (const spec of extractImports(script)) {
      if (isAllowed(spec, file)) continue
      violations.push({ file: path.relative(repoRoot, file), spec })
    }
  }
  return violations
}

describe('module / plugin import boundaries', () => {
  for (const root of SCAN_ROOTS) {
    it(`${root} only imports approved sources`, () => {
      const violations = scanRoot(root)
      if (violations.length > 0) {
        const msg = violations
          .map((v) => `  ${v.file}: ${JSON.stringify(v.spec)}`)
          .join('\n')
        throw new Error(
          `Boundary violation(s) in ${root}:\n${msg}\n\n` +
            `Modules and plugins may only import from:\n` +
            `  - relative paths within the module's own root directory\n` +
            `  - @openpen/module-api\n` +
            `  - node:*\n` +
            `  - third-party npm packages (bare specifiers)\n\n` +
            `If you need a host API, expose it from @openpen/module-api/host ` +
            `or @openpen/module-api/uikit.`
        )
      }
      expect(violations).toEqual([])
    })
  }

  it('rejects a synthetic escape import (regression guard for test logic)', () => {
    // Simulate a file inside src/core/modules/freehand/ that imports from
    // ../../runtime/event-bus — this must be caught as a violation.
    const syntheticFile = path.join(
      repoRoot,
      'src/core/modules/freehand/FreehandToolButton.vue'
    )
    const escapingSpec = '../../runtime/event-bus'
    const allowed = isAllowed(escapingSpec, syntheticFile)
    expect(allowed).toBe(false)
  })
})
