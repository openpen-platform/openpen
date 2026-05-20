/**
 * useDialogPluginComponent.contract.test.ts
 *
 * Contract test for useDialogPluginComponent() public API surface.
 *
 * Rules out:
 * - Composable renamed/removed from the SDK without contract update,
 *   causing downstream custom dialog components to break silently.
 * - Refactor changed the return shape without bumping major version,
 *   so plugin authors' ok/cancel/dismiss calls become no-ops.
 * - Missing host-context guard removed, so composable silently returns
 *   undefined instead of throwing a descriptive error.
 */
import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDialogPluginComponent, type DialogPluginComponentHandle } from './useDialogPluginComponent'
import { DIALOG_PLUGIN_HANDLE_KEY } from './dialog-internal-keys'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Mount a minimal component that calls useDialogPluginComponent() in setup
 * and exposes the returned handle via the component instance for assertion.
 *
 * Accepts an optional `provide` map so we can test both the happy path
 * (handle provided) and the missing-context path (no provide).
 */
function mountWithHandle(
  provideMap: Record<symbol, unknown> = {}
): ReturnType<typeof mount> {
  const TestComponent = defineComponent({
    setup() {
      const handle = useDialogPluginComponent()
      return { handle }
    },
    render() {
      return h('div')
    },
  })

  return mount(TestComponent, { global: { provide: provideMap } })
}

// ---------------------------------------------------------------------------
// contract tests
// ---------------------------------------------------------------------------

describe('useDialogPluginComponent — callable with host context', () => {
  it('returns an object with ok, cancel, and dismiss methods', () => {
    // Rules out: return shape changed after refactor — plugin authors' calls
    // to handle.ok() / handle.cancel() / handle.dismiss() would silently fail.
    let capturedHandle: DialogPluginComponentHandle | undefined

    const realHandle: DialogPluginComponentHandle = {
      ok: (_payload?: unknown) => {},
      cancel: () => {},
      dismiss: () => {},
    }

    const TestComponent = defineComponent({
      setup() {
        capturedHandle = useDialogPluginComponent()
        return {}
      },
      render() { return h('div') },
    })

    mount(TestComponent, {
      global: { provide: { [DIALOG_PLUGIN_HANDLE_KEY as symbol]: realHandle } },
    })

    expect(capturedHandle).toBeDefined()
    expect(typeof capturedHandle!.ok).toBe('function')
    expect(typeof capturedHandle!.cancel).toBe('function')
    expect(typeof capturedHandle!.dismiss).toBe('function')
  })

  it('returned handle is the same object injected by the host', () => {
    // Rules out: composable wraps the handle in a new object, breaking
    // identity checks that DialogHost uses to track active dialog state.
    let capturedHandle: DialogPluginComponentHandle | undefined

    const realHandle: DialogPluginComponentHandle = {
      ok: (_payload?: unknown) => {},
      cancel: () => {},
      dismiss: () => {},
    }

    const TestComponent = defineComponent({
      setup() {
        capturedHandle = useDialogPluginComponent()
        return {}
      },
      render() { return h('div') },
    })

    mount(TestComponent, {
      global: { provide: { [DIALOG_PLUGIN_HANDLE_KEY as symbol]: realHandle } },
    })

    expect(capturedHandle).toBe(realHandle)
  })
})

describe('useDialogPluginComponent — missing host context', () => {
  it('throws a descriptive error when called outside a dialog-rendered component', () => {
    // Rules out: guard removed or error message changed to something unhelpful,
    // leaving plugin authors with an opaque runtime error that is hard to diagnose.
    const TestComponent = defineComponent({
      setup() {
        useDialogPluginComponent()
        return {}
      },
      render() { return h('div') },
    })

    expect(() =>
      mount(TestComponent, { global: { provide: {} } })
    ).toThrow('useDialogPluginComponent() must be called inside a component rendered via useDialog().custom()')
  })
})
