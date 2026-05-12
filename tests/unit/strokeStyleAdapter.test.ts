/**
 * canvas.stroke.style slot adapter.
 *
 * Verifies that:
 * 1. A stub module declaring strokeStyle: { provides: ['lineWidth'] }
 *    loads successfully and its contribution is stored in the slot store.
 * 2. The contribution is accessible via getSlotEntries('canvas.stroke.style').
 * 3. STROKE_STYLE_CONTEXT_KEY and SNAP_EDGE_KEY are exported from module-api
 *    (confirming the inject contract is in place for module components).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { defineModule, STROKE_STYLE_CONTEXT_KEY, SNAP_EDGE_KEY } from '@openpen/module-api'
import type { OpenPenModule } from '@openpen/module-api'
import { loadModules } from '../../src/core/runtime/module-loader'
import { getSlotEntries, resetContributionStore } from '../../src/core/runtime/contribution-store'

const stubModule: OpenPenModule = defineModule({
  id: '@test/stub-stroke-style',
  contributes: {
    strokeStyle: { provides: ['lineWidth'] },
  },
})

beforeEach(() => {
  resetContributionStore()
})

describe('canvas.stroke.style slot adapter', () => {
  it('loads a module declaring strokeStyle and stores it in the contribution-store', async () => {
    const result = await loadModules({
      modules: [stubModule],
      hostVersion: '1.0.0',
    })
    expect(result.errors).toHaveLength(0)
    expect(result.loaded).toContain('@test/stub-stroke-style')

    const entries = getSlotEntries('canvas.stroke.style')
    expect(entries.value).toHaveLength(1)
    expect(entries.value[0].moduleId).toBe('@test/stub-stroke-style')
    expect(entries.value[0].contribution).toMatchObject({ provides: ['lineWidth'] })
  })

  it('rejects two modules claiming the same strokeStyle key', async () => {
    const moduleA: OpenPenModule = defineModule({
      id: '@test/stub-sw-a',
      contributes: { strokeStyle: { provides: ['lineWidth'] } },
    })
    const moduleB: OpenPenModule = defineModule({
      id: '@test/stub-sw-b',
      contributes: { strokeStyle: { provides: ['lineWidth'] } },
    })
    const result = await loadModules({
      modules: [moduleA, moduleB],
      hostVersion: '1.0.0',
    })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.loaded).toHaveLength(0)
  })

  it('STROKE_STYLE_CONTEXT_KEY is exported from @openpen/module-api', () => {
    expect(STROKE_STYLE_CONTEXT_KEY).toBeDefined()
    expect(typeof STROKE_STYLE_CONTEXT_KEY).toBe('symbol')
  })

  it('SNAP_EDGE_KEY is exported from @openpen/module-api', () => {
    expect(SNAP_EDGE_KEY).toBeDefined()
    expect(typeof SNAP_EDGE_KEY).toBe('symbol')
  })
})
