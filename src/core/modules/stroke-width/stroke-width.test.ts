/**
 * stroke-width module unit tests.
 *

 * Structure validation and settings schema; UI behavior via e2e.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import strokeWidthModule from './index'
import { loadModules } from '../../runtime/module-loader'
import { resetContributionStore, getSlotEntries } from '../../runtime/contribution-store'

describe('stroke-width module — structure', () => {
  it('has a valid id', () => {
    expect(strokeWidthModule.id).toBe('@openpen/stroke-width')
  })

  it('contributes controlBar with one item', () => {
    const items = strokeWidthModule.contributes?.controlBar
    expect(items).toBeDefined()
    expect(Array.isArray(items)).toBe(true)
    expect(items!.length).toBe(1)
    expect(items![0].id).toBe('stroke-width')
    expect(items![0].component).toBeDefined()
  })

  it('contributes strokeStyle with lineWidth', () => {
    expect(strokeWidthModule.contributes?.strokeStyle).toMatchObject({
      provides: ['lineWidth'],
    })
  })

  it('has a settings schema with required fields', () => {
    const schema = strokeWidthModule.settingsSchema
    expect(schema).toBeDefined()
    const parsed = schema!.parse({ defaultWidth: 4, minWidth: 1, maxWidth: 20 })
    expect(parsed).toMatchObject({ defaultWidth: 4, minWidth: 1, maxWidth: 20 })
  })

  it('has locales for all required languages', () => {
    const locs = strokeWidthModule.contributes?.locales
    expect(locs).toBeDefined()
    expect(locs!['en']).toBeDefined()
    expect(locs!['zh-Hant']).toBeDefined()
    expect(locs!['zh-Hans']).toBeDefined()
    expect(locs!['ja']).toBeDefined()
  })
})

describe('stroke-width module — loading', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  it('loads successfully and registers contributions', async () => {
    const result = await loadModules({
      modules: [strokeWidthModule],
      hostVersion: '1.0.0',
    })
    expect(result.errors).toHaveLength(0)
    expect(result.loaded).toContain('@openpen/stroke-width')

    const cbEntries = getSlotEntries('ui.control-bar')
    expect(cbEntries.value.some((e) => e.moduleId === '@openpen/stroke-width')).toBe(true)

    const swEntries = getSlotEntries('canvas.stroke.style')
    expect(swEntries.value.some((e) => e.moduleId === '@openpen/stroke-width')).toBe(true)
  })
})
