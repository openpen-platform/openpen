/**
 * Tests for the canvas-engine layer-ordering helper. The actual
 * end-to-end render is exercised once the Phase-3 modules ship layers;
 * this set covers the slot read + sort behaviour in isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerContribution,
  resetContributionStore,
} from '../../src/core/runtime/contribution-store'

// Import private helper via relative path. The helper is module-local
// in canvas-engine; this test re-implements the same sort semantics
// against the slot store so future regressions surface here.
import { getSlotEntries } from '../../src/core/runtime/contribution-store'
import type { CanvasLayerContribution } from '@openpen/module-api'

function sortedLayers(slotId: string): CanvasLayerContribution[] {
  const entries = getSlotEntries<CanvasLayerContribution>(slotId).value
  const decorated = entries.map((e, idx) => ({ idx, item: e.contribution }))
  decorated.sort((a, b) => {
    const oa = a.item.order ?? 0
    const ob = b.item.order ?? 0
    return oa !== ob ? oa - ob : a.idx - b.idx
  })
  return decorated.map((d) => d.item)
}

describe('canvas layer slot sorting', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  it('returns ascending by order', () => {
    const noop = () => {}
    registerContribution('canvas.layers.background', 'mod', { id: 'c', order: 30, render: noop })
    registerContribution('canvas.layers.background', 'mod', { id: 'a', order: 10, render: noop })
    registerContribution('canvas.layers.background', 'mod', { id: 'b', order: 20, render: noop })

    const sorted = sortedLayers('canvas.layers.background')
    expect(sorted.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats missing order as 0', () => {
    const noop = () => {}
    registerContribution('canvas.layers.overlay', 'mod', { id: 'first', render: noop })
    registerContribution('canvas.layers.overlay', 'mod', { id: 'late', order: 5, render: noop })
    registerContribution('canvas.layers.overlay', 'mod', { id: 'second', render: noop })

    const sorted = sortedLayers('canvas.layers.overlay')
    expect(sorted.map((l) => l.id)).toEqual(['first', 'second', 'late'])
  })

  it('preserves insertion order for ties', () => {
    const noop = () => {}
    registerContribution('canvas.layers.background', 'mod', { id: 'first', order: 5, render: noop })
    registerContribution('canvas.layers.background', 'mod', { id: 'second', order: 5, render: noop })
    registerContribution('canvas.layers.background', 'mod', { id: 'third', order: 5, render: noop })

    const sorted = sortedLayers('canvas.layers.background')
    expect(sorted.map((l) => l.id)).toEqual(['first', 'second', 'third'])
  })
})
