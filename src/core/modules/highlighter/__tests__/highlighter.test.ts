import { describe, it, expect } from 'vitest'
import highlighter from '../index'
import { BUILT_IN_MODULES } from '../../registry'

describe('highlighter module', () => {
  it('is registered as a built-in and contributes the highlighter tool + a control-bar button in the tools group', () => {
    expect(BUILT_IN_MODULES.map((m) => m.id)).toContain('@openpen/highlighter')
    expect(highlighter.contributes?.tools?.map((t) => t.id)).toEqual(['highlighter-pen'])
    const bar = highlighter.contributes?.controlBar ?? []
    expect(bar.map((b) => b.id)).toEqual(['highlighter-pen'])
    expect(bar[0].defaultGroup).toBe('tools')
  })

  it('ships a tool label in every locale the other tool modules ship', () => {
    const locales = (highlighter.contributes?.locales ?? {}) as Record<string, Record<string, string>>
    for (const lang of ['en', 'zh-Hant', 'zh-Hans', 'ja']) {
      expect(locales[lang]?.tool).toBeTruthy()
    }
  })
})

describe('highlighter ids vs plugin-author ids', () => {
  it('does not use the bare id the plugin tutorial teaches, so a tutorial plugin cannot shadow the built-in renderer', () => {
    const c = highlighter.contributes
    const ids = [
      ...(c?.tools ?? []).map((t) => t.id),
      ...(c?.cursors ?? []).map((x) => x.id),
      ...(c?.controlBar ?? []).map((b) => b.id),
    ]
    expect(ids.length).toBe(3)
    expect(ids).not.toContain('highlighter')
  })
})
