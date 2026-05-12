import { describe, it, expect, beforeEach } from 'vitest'
import { defineModule } from '@openpen/module-api'
import { loadModules } from '../../src/core/runtime/module-loader'
import { resetModuleRegistry } from '../../src/core/runtime/module-registry'
import {
  getSlotEntries,
  resetContributionStore,
} from '../../src/core/runtime/contribution-store'

describe('module-loader — control bar routing', () => {
  beforeEach(() => {
    resetModuleRegistry()
    resetContributionStore()
  })

  it('routes controlBar items to ui.control-bar slot', async () => {
    const m = defineModule({
      id: '@test/mod',
      contributes: {
        controlBar: [
          { id: 'item-a', component: {} as never },
          { id: 'item-b', component: {} as never },
          { id: 'item-c', component: {} as never },
        ],
      },
    })
    await loadModules({ modules: [m], hostVersion: '1.0.0' })

    expect(getSlotEntries('ui.control-bar').value).toHaveLength(3)
  })

  it('preserves item registration order', async () => {
    const m = defineModule({
      id: '@test/mod',
      contributes: {
        controlBar: [
          { id: 'first', component: {} as never },
          { id: 'second', component: {} as never },
        ],
      },
    })
    await loadModules({ modules: [m], hostVersion: '1.0.0' })
    const ids = getSlotEntries('ui.control-bar').value.map(
      (e) => (e.contribution as { id: string }).id
    )
    expect(ids).toEqual(['first', 'second'])
  })
})
