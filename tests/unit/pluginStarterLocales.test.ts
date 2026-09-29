/**
 * The starter's load toast tells a new author where the plugin's buttons
 * landed on the control bar. Every shipped locale must carry that hint,
 * otherwise non-English hosts fall back to a bare "ready" message.
 */
import { describe, it, expect } from 'vitest'
import en from '../../packages/plugin-starter/src/locales/en.json'
import ja from '../../packages/plugin-starter/src/locales/ja.json'
import zhHans from '../../packages/plugin-starter/src/locales/zh-Hans.json'
import zhHant from '../../packages/plugin-starter/src/locales/zh-Hant.json'

const LOCALES = { en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as Record<string, { notif?: Record<string, string> }>

describe('plugin-starter locales', () => {
  it.each(Object.keys(LOCALES))('%s defines the control-bar location hint', (locale) => {
    const hint = LOCALES[locale].notif?.location
    expect(typeof hint).toBe('string')
    expect(hint!.trim().length).toBeGreaterThan(0)
  })
})
