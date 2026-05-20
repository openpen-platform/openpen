/**
 * Module structure validation.
 *
 * Checks that every built-in module under `src/core/modules/` that
 * has a `locales/` folder includes an `en.json` canonical dictionary.
 * The host bootstrap uses `en.json` as the base dictionary; without it,
 * locale-specific keys have no fallback and the UI silently shows
 * untranslated key strings.
 *
 * Also validates the BUILT_IN_MODULES registry:
 * - each module's declared id unscoped segment must match its folder name
 * - no two modules may share the same id
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILT_IN_MODULES } from '../../src/core/modules/registry'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)

const MODULES_DIR = path.join(repoRoot, 'src/core/modules')

function getModuleDirs(): string[] {
  if (!fs.existsSync(MODULES_DIR)) return []
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(MODULES_DIR, e.name))
}

describe('module locales/ structure', () => {
  const moduleDirs = getModuleDirs()

  it('has at least one built-in module directory', () => {
    expect(moduleDirs.length).toBeGreaterThan(0)
  })

  for (const moduleDir of moduleDirs) {
    const localesDir = path.join(moduleDir, 'locales')
    const moduleName = path.basename(moduleDir)

    if (!fs.existsSync(localesDir)) continue

    it(`${moduleName}: locales/ contains en.json`, () => {
      const enJson = path.join(localesDir, 'en.json')
      expect(
        fs.existsSync(enJson),
        `${moduleName}/locales/en.json is missing — required as the canonical English fallback dictionary`
      ).toBe(true)
    })

    it(`${moduleName}: locales/en.json is valid JSON`, () => {
      const enJson = path.join(localesDir, 'en.json')
      if (!fs.existsSync(enJson)) return
      const raw = fs.readFileSync(enJson, 'utf-8')
      expect(() => JSON.parse(raw), `${moduleName}/locales/en.json is not valid JSON`).not.toThrow()
    })

    it(`${moduleName}: all locale JSON files are valid JSON`, () => {
      const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        const raw = fs.readFileSync(path.join(localesDir, file), 'utf-8')
        expect(
          () => JSON.parse(raw),
          `${moduleName}/locales/${file} is not valid JSON`
        ).not.toThrow()
      }
    })

    it(`${moduleName}: locale keys in language files are a subset of en.json keys`, () => {
      const enJson = path.join(localesDir, 'en.json')
      if (!fs.existsSync(enJson)) return
      const enKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(enJson, 'utf-8'))))
      const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')
      for (const file of files) {
        const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'))
        for (const key of Object.keys(dict)) {
          expect(
            enKeys.has(key),
            `${moduleName}/locales/${file} has key "${key}" not declared in en.json`
          ).toBe(true)
        }
      }
    })
  }
})

// ---------------------------------------------------------------------------
// BUILT_IN_MODULES registry integrity checks
// ---------------------------------------------------------------------------

describe('BUILT_IN_MODULES registry — folder matches id', () => {
  // Rules out: module renamed on disk but id field forgotten, causing the
  // runtime to register with a stale id that no longer corresponds to any
  // folder, breaking contribution lookups silently.
  for (const mod of BUILT_IN_MODULES) {
    const unscopedSegment = mod.id.includes('/') ? mod.id.split('/').pop()! : mod.id
    const expectedDir = path.join(MODULES_DIR, unscopedSegment)

    it(`${mod.id}: folder "${unscopedSegment}" exists under src/core/modules/`, () => {
      expect(
        fs.existsSync(expectedDir),
        `Module id "${mod.id}" declares unscoped segment "${unscopedSegment}" but no folder` +
          ` src/core/modules/${unscopedSegment}/ found on disk`
      ).toBe(true)
    })
  }
})

describe('BUILT_IN_MODULES registry — no duplicate ids', () => {
  // Rules out: two modules accidentally claiming the same id; the second
  // registration silently shadows or fails to load, dropping one module
  // from the running app without any error.
  it('all module ids are unique', () => {
    const ids = BUILT_IN_MODULES.map((m) => m.id)
    const unique = new Set(ids)
    expect(
      unique.size,
      `Duplicate ids found in BUILT_IN_MODULES: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`
    ).toBe(ids.length)
  })
})
