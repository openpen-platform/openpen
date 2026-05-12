/**
 * AppPopover.test.ts
 *
 * Tests for the AppPopover wrapper's own behaviour:
 * - trigger slot receives correct scope (active, toggle, open, close)
 * - modalManager mutual exclusion
 * - CONTROL_BAR_ANIMATING_KEY auto-close
 * - toggle / open / close semantics
 * - popoverId is required
 *

 *
 * Note on jsdom limitations:
 * - ResizeObserver is polyfilled with a no-op (reka-ui uses it internally)
 * - Vue Teleport renders outside the component tree; tests avoid asserting on
 *   DOM that is inside the Teleport'd PopoverContent (brittle in jsdom).
 *   Instead we test through the modalManager mock to verify behaviour.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, nextTick } from 'vue'
import {
  MODAL_MANAGER_KEY,
  WRAPPER_EL_KEY,
  ANCHOR_EL_KEY,
  CONTROL_BAR_ANIMATING_KEY,
} from '../../inject-keys'
import AppPopover from './AppPopover.vue'
import type { Placement } from './AppPopover.vue'

// ── jsdom polyfills ───────────────────────────────────────────────────────────

// Reka UI (and @floating-ui/vue) use ResizeObserver internally.
// jsdom doesn't implement it; provide a no-op stub.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh mock modalManager backed by a real reactive Set. */
function makeModalManager() {
  const openIds = ref(new Set<string>())
  return {
    open: vi.fn((id: string) => {
      // Mutual exclusion: replace existing open ID with new one
      openIds.value = new Set([id])
    }),
    close: vi.fn((id: string) => {
      const next = new Set(openIds.value)
      next.delete(id)
      openIds.value = next
    }),
    isOpen: vi.fn((id: string) => openIds.value.has(id)),
    _openIds: openIds,
  }
}

/** Mount AppPopover with test provides. */
function mountPopover(
  options: {
    popoverId?: string
    placement?: Placement
    gap?: number
    modalManager?: ReturnType<typeof makeModalManager>
    animating?: ReturnType<typeof ref<boolean>>
  } = {}
) {
  const {
    popoverId = 'test-popover',
    placement,
    gap,
    modalManager = makeModalManager(),
    animating = ref(false),
  } = options

  const wrapperEl = ref<HTMLElement | null>(document.body as HTMLElement)

  const wrapper = mount(AppPopover, {
    props: {
      popoverId,
      ...(placement ? { placement } : {}),
      ...(gap !== undefined ? { gap } : {}),
    },
    global: {
      provide: {
        [MODAL_MANAGER_KEY as symbol]: modalManager,
        [WRAPPER_EL_KEY as symbol]: readonly(wrapperEl),
        [ANCHOR_EL_KEY as symbol]: readonly(ref<HTMLElement | null>(null)),
        [CONTROL_BAR_ANIMATING_KEY as symbol]: readonly(animating),
      },
    },
    slots: {
      // Trigger slot: render scope values as data attributes for inspection
      trigger: `<template #trigger="scope">
        <button
          data-testid="trigger-btn"
          :data-active="scope.active"
          @click="scope.toggle"
          @mousedown.prevent="scope.open"
          @contextmenu.prevent="scope.close"
        >trigger</button>
      </template>`,
      content: `<template #content>
        <div data-testid="popover-content">content</div>
      </template>`,
    },
  })

  return { wrapper, modalManager, animating }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AppPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Trigger slot scope ────────────────────────────────────────────────────

  describe('trigger slot scope', () => {
    it('renders the trigger slot', () => {
      const { wrapper } = mountPopover()
      expect(wrapper.find('[data-testid="trigger-btn"]').exists()).toBe(true)
    })

    it('exposes active=false initially via data-active attribute', () => {
      const { wrapper } = mountPopover()
      const btn = wrapper.find('[data-testid="trigger-btn"]')
      expect(btn.attributes('data-active')).toBe('false')
    })

    it('exposes active=true when popoverId is open in modalManager', async () => {
      const { wrapper, modalManager } = mountPopover()
      // Simulate popover being opened externally
      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()
      const btn = wrapper.find('[data-testid="trigger-btn"]')
      expect(btn.attributes('data-active')).toBe('true')
    })

    it('toggle (via click) calls modalManager.open when closed', async () => {
      const { wrapper, modalManager } = mountPopover()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('click')
      expect(modalManager.open).toHaveBeenCalledWith('test-popover')
    })

    it('toggle (via click) calls modalManager.close when open', async () => {
      const { wrapper, modalManager } = mountPopover()
      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('click')
      expect(modalManager.close).toHaveBeenCalledWith('test-popover')
    })

    it('open (via mousedown) calls modalManager.open', async () => {
      const { wrapper, modalManager } = mountPopover()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('mousedown')
      expect(modalManager.open).toHaveBeenCalledWith('test-popover')
    })

    it('close (via contextmenu) calls modalManager.close', async () => {
      const { wrapper, modalManager } = mountPopover()
      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('contextmenu')
      expect(modalManager.close).toHaveBeenCalledWith('test-popover')
    })
  })

  // ── open / close / toggle semantics ──────────────────────────────────────

  describe('open / close / toggle semantics', () => {
    it('open calls modalManager.open with popoverId', async () => {
      const { wrapper, modalManager } = mountPopover({ popoverId: 'my-id' })
      await wrapper.find('[data-testid="trigger-btn"]').trigger('mousedown')
      expect(modalManager.open).toHaveBeenCalledWith('my-id')
    })

    it('close calls modalManager.close with popoverId', async () => {
      const { wrapper, modalManager } = mountPopover({ popoverId: 'my-id' })
      modalManager._openIds.value = new Set(['my-id'])
      await nextTick()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('contextmenu')
      expect(modalManager.close).toHaveBeenCalledWith('my-id')
    })

    it('toggle opens when closed — calls open() at least once', async () => {
      const { wrapper, modalManager } = mountPopover()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('click')
      // open must be called; Reka UI may emit @update:open additional times in jsdom
      expect(modalManager.open).toHaveBeenCalledWith('test-popover')
    })

    it('toggle closes when open — calls close() at least once', async () => {
      const { wrapper, modalManager } = mountPopover()
      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()
      await wrapper.find('[data-testid="trigger-btn"]').trigger('click')
      // close must be called; Reka UI may emit @update:open additional times in jsdom
      expect(modalManager.close).toHaveBeenCalledWith('test-popover')
    })
  })

  // ── modalManager mutual exclusion ─────────────────────────────────────────

  describe('modal manager mutual exclusion', () => {
    it('modalManager.open replaces any existing open popover', () => {
      const modalManager = makeModalManager()
      modalManager.open('popover-a')
      expect(modalManager.isOpen('popover-a')).toBe(true)
      modalManager.open('popover-b')
      // Our mock implements mutual exclusion — previous is replaced
      expect(modalManager.isOpen('popover-a')).toBe(false)
      expect(modalManager.isOpen('popover-b')).toBe(true)
    })

    it('each instance uses its own popoverId', async () => {
      const modalManager = makeModalManager()
      const wrapperEl = ref<HTMLElement | null>(document.body as HTMLElement)
      const animating = ref(false)

      const makeInstance = (id: string) =>
        mount(AppPopover, {
          props: { popoverId: id },
          global: {
            provide: {
              [MODAL_MANAGER_KEY as symbol]: modalManager,
              [WRAPPER_EL_KEY as symbol]: readonly(wrapperEl),
              [ANCHOR_EL_KEY as symbol]: readonly(ref<HTMLElement | null>(null)),
              [CONTROL_BAR_ANIMATING_KEY as symbol]: readonly(animating),
            },
          },
          slots: {
            trigger: `<template #trigger="scope">
              <button data-testid="btn" @click="scope.open">open</button>
            </template>`,
            content: '<template #content><span /></template>',
          },
        })

      const a = makeInstance('id-a')
      const b = makeInstance('id-b')

      await a.find('[data-testid="btn"]').trigger('click')
      expect(modalManager.open).toHaveBeenLastCalledWith('id-a')

      await b.find('[data-testid="btn"]').trigger('click')
      expect(modalManager.open).toHaveBeenLastCalledWith('id-b')

      a.unmount()
      b.unmount()
    })
  })

  // ── CONTROL_BAR_ANIMATING_KEY auto-close ──────────────────────────────────

  describe('animating auto-close', () => {
    it('auto-closes when animating becomes true while popover is open', async () => {
      const animating = ref(false)
      const modalManager = makeModalManager()
      mountPopover({ animating, modalManager })

      // Simulate open state
      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()

      // Simulate ControlBar animation start
      animating.value = true
      await nextTick()

      expect(modalManager.close).toHaveBeenCalledWith('test-popover')
    })

    it('does NOT call close if animating triggers while popover is closed', async () => {
      const animating = ref(false)
      const modalManager = makeModalManager()
      mountPopover({ animating, modalManager })

      animating.value = true
      await nextTick()

      expect(modalManager.close).not.toHaveBeenCalled()
    })

    it('does NOT close when animating returns to false', async () => {
      const animating = ref(false)
      const modalManager = makeModalManager()
      mountPopover({ animating, modalManager })

      modalManager._openIds.value = new Set(['test-popover'])
      await nextTick()

      // true → auto-close
      animating.value = true
      await nextTick()
      const closeCallsAfterTrue = modalManager.close.mock.calls.length
      expect(closeCallsAfterTrue).toBeGreaterThan(0)

      // false → no additional close
      animating.value = false
      await nextTick()
      expect(modalManager.close.mock.calls.length).toBe(closeCallsAfterTrue)
    })
  })

  // ── popoverId ─────────────────────────────────────────────────────────────

  describe('popoverId', () => {
    it('scopes all open/close calls to the given popoverId', async () => {
      const { wrapper, modalManager } = mountPopover({ popoverId: 'specific-id' })
      await wrapper.find('[data-testid="trigger-btn"]').trigger('click')
      expect(modalManager.open).toHaveBeenCalledWith('specific-id')
    })

    it('different popoverIds are independent', async () => {
      const manager = makeModalManager()
      const wrapperEl = ref<HTMLElement | null>(document.body as HTMLElement)
      const animating = ref(false)

      const provide = {
        [MODAL_MANAGER_KEY as symbol]: manager,
        [WRAPPER_EL_KEY as symbol]: readonly(wrapperEl),
        [ANCHOR_EL_KEY as symbol]: readonly(ref<HTMLElement | null>(null)),
        [CONTROL_BAR_ANIMATING_KEY as symbol]: readonly(animating),
      }

      const slots = {
        trigger: '<template #trigger="scope"><button @click="scope.open">o</button></template>',
        content: '<template #content><span/></template>',
      }

      const w1 = mount(AppPopover, { props: { popoverId: 'alpha' }, global: { provide }, slots })
      const w2 = mount(AppPopover, { props: { popoverId: 'beta' }, global: { provide }, slots })

      await w1.find('button').trigger('click')
      expect(manager.open).toHaveBeenCalledWith('alpha')
      expect(manager.open).not.toHaveBeenCalledWith('beta')

      w1.unmount()
      w2.unmount()
    })
  })

  // ── props defaults ────────────────────────────────────────────────────────

  describe('props', () => {
    it('mounts without errors with only popoverId', () => {
      expect(() => mountPopover({ popoverId: 'minimal' })).not.toThrow()
    })

    it('accepts placement = auto (default)', () => {
      expect(() => mountPopover({ placement: 'auto' })).not.toThrow()
    })

    it('accepts all Placement values', () => {
      const placements: Placement[] = ['auto', 'top', 'bottom', 'left', 'right']
      for (const placement of placements) {
        expect(() => mountPopover({ placement })).not.toThrow()
      }
    })

    it('accepts custom gap value', () => {
      expect(() => mountPopover({ gap: 16 })).not.toThrow()
    })
  })
})
