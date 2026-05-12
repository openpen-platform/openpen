/**
 * Unit tests for the metadata fallback chain in ModulesBuiltInPanel:
 *   1. i18n registered → use i18n
 *   2. i18n miss + metadata present → resolveLabel from metadata
 *   3. i18n miss + metadata absent → fall back to id / moduleNoDescription
 *   4. multi-locale resolution: correct locale key is selected
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h } from 'vue'
import { sanitizeIdForI18n, resolveLabel } from '@openpen/module-api'
import type { LocaleMap, OpenPenModule } from '@openpen/module-api'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate the resolveName / resolveDescription logic extracted from
 * ModulesBuiltInPanel without mounting the full component (which pulls in
 * Electron-only dependencies). We test the pure functions in isolation.
 */
function makeResolvers(
  i18nMessages: Record<string, Record<string, string>>,
  locale: string,
  moduleById: Map<string, Pick<OpenPenModule, 'id' | 'metadata'>>,
) {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: i18nMessages,
  })
  const { t, te } = i18n.global as unknown as {
    t: (key: string) => string
    te: (key: string) => boolean
  }

  function resolveName(id: string): string {
    const ns = sanitizeIdForI18n(id)
    if (te(`${ns}.name`)) return t(`${ns}.name`)
    const meta = moduleById.get(id)?.metadata
    if (meta?.name) {
      const label = resolveLabel(meta.name, locale)
      if (label) return label
    }
    return id
  }

  function resolveDescription(id: string): string {
    const ns = sanitizeIdForI18n(id)
    if (te(`${ns}.description`)) return t(`${ns}.description`)
    const meta = moduleById.get(id)?.metadata
    if (meta?.description) {
      const label = resolveLabel(meta.description, locale)
      if (label) return label
    }
    return t('moduleNoDescription')
  }

  return { resolveName, resolveDescription }
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const METADATA_FULL: NonNullable<OpenPenModule['metadata']> = {
  name: { en: 'My Module', 'zh-Hant': '我的模組', 'zh-Hans': '我的模块', ja: '私のモジュール' },
  description: { en: 'Does things.', 'zh-Hant': '執行任務。', 'zh-Hans': '执行任务。', ja: '何かをします。' },
}

const BASE_MESSAGES_EN = {
  en: { moduleNoDescription: 'No description.' },
}

/**
 * Build nested vue-i18n messages for a module id key.
 * `sanitizeIdForI18n('@openpen/mymod')` = `'openpen.mymod'`
 * Vue-i18n stores these as nested objects: { openpen: { mymod: { name: '...' } } }
 */
function nestedModuleMessages(locale: string, idNs: string, keys: Record<string, string>): Record<string, unknown> {
  const parts = idNs.split('.')
  let nested: Record<string, unknown> = keys
  for (let i = parts.length - 1; i >= 0; i--) {
    nested = { [parts[i]]: nested }
  }
  return { [locale]: { moduleNoDescription: 'No description.', ...nested } }
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('resolveName — fallback chain', () => {
  it('uses i18n when the key is registered', () => {
    // Vue-i18n expects nested objects: { openpen: { mymod: { name: 'i18n Name' } } }
    const messages = nestedModuleMessages('en', 'openpen.mymod', { name: 'i18n Name' })
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveName } = makeResolvers(messages, 'en', moduleById)
    expect(resolveName('@openpen/mymod')).toBe('i18n Name')
  })

  it('falls back to metadata when i18n key is missing', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveName } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    expect(resolveName('@openpen/mymod')).toBe('My Module')
  })

  it('selects the correct locale from metadata', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveName } = makeResolvers(
      { 'zh-Hant': { moduleNoDescription: '未描述' } },
      'zh-Hant',
      moduleById,
    )
    expect(resolveName('@openpen/mymod')).toBe('我的模組')
  })

  it('falls back to id when both i18n and metadata are absent', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod' }],
    ])
    const { resolveName } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    expect(resolveName('@openpen/mymod')).toBe('@openpen/mymod')
  })

  it('falls back to id when metadata.name is an empty LocaleMap', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: { name: {} as LocaleMap } }],
    ])
    const { resolveName } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    // resolveLabel({}, locale) → '' (empty string); production code guards on truthy → falls to id
    expect(resolveName('@openpen/mymod')).toBe('@openpen/mymod')
  })
})

describe('resolveDescription — fallback chain', () => {
  it('uses i18n when the description key is registered', () => {
    // Vue-i18n expects nested objects: { openpen: { mymod: { description: 'i18n Desc' } } }
    const messages = nestedModuleMessages('en', 'openpen.mymod', { description: 'i18n Desc' })
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveDescription } = makeResolvers(messages, 'en', moduleById)
    expect(resolveDescription('@openpen/mymod')).toBe('i18n Desc')
  })

  it('falls back to metadata description when i18n key is missing', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveDescription } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    expect(resolveDescription('@openpen/mymod')).toBe('Does things.')
  })

  it('selects the correct locale from metadata description', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: METADATA_FULL }],
    ])
    const { resolveDescription } = makeResolvers(
      { 'zh-Hant': { moduleNoDescription: '未描述' } },
      'zh-Hant',
      moduleById,
    )
    expect(resolveDescription('@openpen/mymod')).toBe('執行任務。')
  })

  it('returns moduleNoDescription when both i18n and metadata are absent', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod' }],
    ])
    const { resolveDescription } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    expect(resolveDescription('@openpen/mymod')).toBe('No description.')
  })

  it('returns moduleNoDescription when metadata has no description field', () => {
    const moduleById = new Map([
      ['@openpen/mymod', { id: '@openpen/mymod', metadata: { name: { en: 'X' } } }],
    ])
    const { resolveDescription } = makeResolvers(BASE_MESSAGES_EN, 'en', moduleById)
    expect(resolveDescription('@openpen/mymod')).toBe('No description.')
  })
})

describe('resolveLabel — multi-locale behaviour (via metadata)', () => {
  it('exact tag match wins over language prefix', () => {
    const map: LocaleMap = { zh: 'Chinese Generic', 'zh-Hant': 'Traditional Chinese' }
    expect(resolveLabel(map, 'zh-Hant')).toBe('Traditional Chinese')
  })

  it('language prefix match when exact tag is absent', () => {
    const map: LocaleMap = { zh: 'Chinese Generic' }
    expect(resolveLabel(map, 'zh-Hant')).toBe('Chinese Generic')
  })

  it('falls back to English when neither exact nor prefix match', () => {
    const map: LocaleMap = { en: 'English', ja: 'Japanese' }
    expect(resolveLabel(map, 'ko')).toBe('English')
  })

  it('falls back to first declared value when no en key exists', () => {
    const map: LocaleMap = { ja: '日本語', 'zh-Hant': '繁中' }
    expect(resolveLabel(map, 'ko')).toBe('日本語')
  })
})
