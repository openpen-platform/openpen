/**
 * Module structure validation.
 *
 * Checks that every built-in module under `src/core/modules/` that
 * has a `locales/` folder includes an `en.json` canonical dictionary.
 * The host bootstrap uses `en.json` as the base dictionary; without it,
 * locale-specific keys have no fallback and the UI silently shows
 * untranslated key strings.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
