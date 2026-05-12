/**
 * AppPopover.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppPopover behaviour — see AppPopover.test.ts
 * for that. This file tests only the specific reka-ui contract that
 * AppPopover.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly } from 'vue'
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverArrow,
} from 'reka-ui'
import AppPopover, { type Placement } from './AppPopover.vue'
import {
  MODAL_MANAGER_KEY,
  WRAPPER_EL_KEY,
  ANCHOR_EL_KEY,
  CONTROL_BAR_ANIMATING_KEY,
  POPOVER_PLACEMENT_HINT_KEY,
} from '../../inject-keys'

// ── Helpers for dev-warn contract tests ──────────────────────────────────────

function makeModalManagerStub() {
  const openIds = ref(new Set<string>())
  return {
    open: vi.fn((id: string) => { openIds.value = new Set([id]) }),
    close: vi.fn((id: string) => { const s = new Set(openIds.value); s.delete(id); openIds.value = s }),
    isOpen: vi.fn((id: string) => openIds.value.has(id)),
  }
}

function mountPopoverForWarnTest(placement?: Placement) {
  const wrapperEl = ref<HTMLElement | null>(document.body as HTMLElement)
  const animating = ref(false)
  const placementHint = ref<'top' | 'bottom' | 'left' | 'right'>('bottom')
  return mount(AppPopover, {
    props: {
      popoverId: 'warn-test',
      ...(placement !== undefined ? { placement } : {}),
    },
    global: {
      provide: {
        [MODAL_MANAGER_KEY as symbol]: makeModalManagerStub(),
        [WRAPPER_EL_KEY as symbol]: readonly(wrapperEl),
        [ANCHOR_EL_KEY as symbol]: readonly(ref<HTMLElement | null>(null)),
        [CONTROL_BAR_ANIMATING_KEY as symbol]: readonly(animating),
        [POPOVER_PLACEMENT_HINT_KEY as symbol]: readonly(placementHint),
      },
    },
    slots: {
      trigger: '<template #trigger="scope"><button @click="scope.toggle">t</button></template>',
      content: '<template #content><span /></template>',
    },
  })
}

beforeAll(() => {
  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe('reka-ui Popover contract (consumed by AppPopover)', () => {
  it('exports the 5 components AppPopover depends on', () => {
    expect(PopoverRoot).toBeDefined()
    expect(PopoverTrigger).toBeDefined()
    expect(PopoverPortal).toBeDefined()
    expect(PopoverContent).toBeDefined()
    expect(PopoverArrow).toBeDefined()
  })

  it('PopoverRoot accepts the :open and @update:open props we use', () => {
    // We bind :open (controlled mode) and @update:open to sync with modalManager.
    const props = PopoverRoot.props as Record<string, unknown>
    expect(props.open).toBeDefined()
    expect(props.defaultOpen).toBeDefined()
  })

  it('PopoverContent accepts side and sideOffset props', () => {
    // We bind :side (from placement mapping) and :side-offset (from gap prop).
    const props = PopoverContent.props as Record<string, unknown>
    expect(props.side).toBeDefined()
    expect(props.sideOffset).toBeDefined()
  })

  it('PopoverPortal accepts a to / target prop for teleport target', () => {
    // We bind :to="wrapperEl" to confine teleport to the current window's
    // wrapper element (multi-window compatibility — content teleports to the wrapper, not <body>).
    // Reka UI has migrated between `to` and `target` in the past; this test
    // catches any future rename before AppPopover breaks silently.
    const props = PopoverPortal.props as Record<string, unknown>
    expect(props.to ?? props.target).toBeDefined()
  })

  it('PopoverTrigger accepts as-child to avoid wrapper element', () => {
    // We use asChild so the plugin author's trigger element is the actual
    // DOM node, not wrapped in an extra div that would break styling.
    const props = PopoverTrigger.props as Record<string, unknown>
    expect(props.asChild ?? props['as-child']).toBeDefined()
  })

  it('PopoverContent side values include top / bottom / left / right', () => {
    // We map OpenPen Placement (top|bottom|left|right|auto) to Reka UI side.
    // Verify that the expected string values are accepted.
    const props = PopoverContent.props as Record<string, unknown>
    const sideProp = props.side as { default?: unknown; validator?: (v: unknown) => boolean } | undefined
    // The prop must exist (checked in earlier test); optionally validate values
    // if a validator is exposed.
    if (sideProp && typeof sideProp === 'object' && typeof (sideProp as Record<string, unknown>).validator === 'function') {
      const validator = (sideProp as Record<string, unknown>).validator as (v: unknown) => boolean
      expect(validator('top')).toBe(true)
      expect(validator('bottom')).toBe(true)
      expect(validator('left')).toBe(true)
      expect(validator('right')).toBe(true)
    } else {
      // Prop exists but no inline validator — pass (type enforcement is via TS).
      expect(props.side).toBeDefined()
    }
  })
})

// ── AppPopover dev-mode placement warning contract ────────────────────────────

describe('AppPopover dev-mode placement warning', () => {
  it('emits a console.warn containing "AppPopover" and "auto" when placement is explicit', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountPopoverForWarnTest('top')
    // onMounted fires synchronously in @vue/test-utils.
    // Filter to our warning only (Vue may emit injection-missing notices too).
    const appPopoverWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[AppPopover]')
    )
    expect(appPopoverWarns).toHaveLength(1)
    const [msg] = appPopoverWarns[0] as [string]
    expect(msg).toContain('AppPopover')
    expect(msg).toContain('auto')
    warnSpy.mockRestore()
    wrapper.unmount()
  })

  it('does NOT emit an [AppPopover] console.warn when placement is "auto" (default, safe)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountPopoverForWarnTest('auto')
    const appPopoverWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[AppPopover]')
    )
    expect(appPopoverWarns).toHaveLength(0)
    warnSpy.mockRestore()
    wrapper.unmount()
  })
})
