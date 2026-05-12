import { describe, it, expect } from 'vitest'
import summonToCursor from './index'

describe('summon-to-cursor module', () => {
  it('has correct id', () => {
    expect(summonToCursor.id).toBe('@openpen/summon-to-cursor')
  })

  it('contributes exactly one shortcut with id summon', () => {
    const shortcuts = summonToCursor.contributes?.shortcuts ?? []
    expect(shortcuts).toHaveLength(1)
    expect(shortcuts[0].id).toBe('summon')
  })

  it('shortcut has global scope and correct accelerator', () => {
    const s = summonToCursor.contributes?.shortcuts?.[0]
    expect(s?.scope).toBe('global')
    expect(s?.keys).toBe('CommandOrControl+Shift+S')
  })

  it('shortcut handler is a function', () => {
    const s = summonToCursor.contributes?.shortcuts?.[0]
    expect(typeof s?.handler).toBe('function')
  })

  it('shortcut is user-customizable with a label', () => {
    const s = summonToCursor.contributes?.shortcuts?.[0]
    expect(s?.userCustomizable).toBe(true)
    expect(s?.label).toBeTruthy()
    expect(typeof (s?.label as Record<string, string>)?.en).toBe('string')
  })
})
