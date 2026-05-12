import { describe, it, expect } from 'vitest'
import { resolveLabel } from '../src/locale'

describe('resolveLabel', () => {
  it('returns the string as-is when input is a plain string', () => {
    expect(resolveLabel('Hello', 'en')).toBe('Hello')
    expect(resolveLabel('哈囉', 'zh-TW')).toBe('哈囉')
  })

  it('exact-matches a LocaleMap by full locale tag', () => {
    expect(resolveLabel({ en: 'Hi', 'zh-TW': '嗨' }, 'zh-TW')).toBe('嗨')
    expect(resolveLabel({ en: 'Hi', 'zh-TW': '嗨' }, 'en')).toBe('Hi')
  })

  it('falls back to language prefix when full tag missing', () => {
    expect(resolveLabel({ zh: '嗨', en: 'Hi' }, 'zh-CN')).toBe('嗨')
    expect(resolveLabel({ zh: '嗨' }, 'zh-Hans-CN')).toBe('嗨')
  })

  it('falls back to en when locale missing', () => {
    expect(resolveLabel({ en: 'Hi', ja: 'こん' }, 'fr')).toBe('Hi')
  })

  it('falls back to first declared value when even en is missing', () => {
    expect(resolveLabel({ ja: 'こん', ko: '안녕' }, 'fr')).toBe('こん')
  })

  it('returns empty string for empty LocaleMap', () => {
    expect(resolveLabel({}, 'en')).toBe('')
  })
})
