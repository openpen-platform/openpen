import { describe, it, expect } from 'vitest'
import colorModule from './index'

describe('color module — structure', () => {
  it('has a valid id', () => {
    expect(colorModule.id).toBe('@openpen/color')
  })

  it('contributes controlBar with one item', () => {
    const items = colorModule.contributes?.controlBar
    expect(items).toBeDefined()
    expect(Array.isArray(items)).toBe(true)
    expect(items!.length).toBe(1)
    expect(items![0].id).toBe('color')
    expect(items![0].component).toBeDefined()
  })

  it('contributes strokeStyle with color', () => {
    expect(colorModule.contributes?.strokeStyle).toMatchObject({
      provides: ['color'],
    })
  })

  it('has a settings schema', () => {
    const schema = colorModule.settingsSchema
    expect(schema).toBeDefined()
    const parsed = schema!.parse({ defaultColor: '#ff0000' })
    expect(parsed).toMatchObject({ defaultColor: '#ff0000' })
  })

  it('has locales for all required languages', () => {
    const locs = colorModule.contributes?.locales
    expect(locs).toBeDefined()
    expect(locs!['en']).toBeDefined()
    expect(locs!['zh-Hant']).toBeDefined()
    expect(locs!['zh-Hans']).toBeDefined()
    expect(locs!['ja']).toBeDefined()
  })
})
