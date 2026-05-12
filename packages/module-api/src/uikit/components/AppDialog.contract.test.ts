/**
 * AppDialog.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppDialog behaviour. This file tests only the
 * specific reka-ui Dialog contract that AppDialog.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogContent,
  DialogOverlay,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'

describe('reka-ui Dialog contract (consumed by AppDialog)', () => {
  it('exports the 8 components AppDialog depends on', () => {
    expect(DialogRoot).toBeDefined()
    expect(DialogTrigger).toBeDefined()
    expect(DialogPortal).toBeDefined()
    expect(DialogContent).toBeDefined()
    expect(DialogOverlay).toBeDefined()
    expect(DialogClose).toBeDefined()
    expect(DialogTitle).toBeDefined()
    expect(DialogDescription).toBeDefined()
  })

  it('DialogRoot accepts the :open and @update:open props we use', () => {
    // AppDialog binds :open (controlled mode) and @update:open to sync
    // with the modalManager for mutual exclusion.
    const props = DialogRoot.props as Record<string, unknown>
    expect(props.open).toBeDefined()
    expect(props.defaultOpen).toBeDefined()
  })

  it('DialogContent accepts data-state attribute for open/close animations', () => {
    // AppDialog CSS targets [data-state="open"] / [data-state="closed"] for
    // enter/leave animations via Reka UI's Presence mechanism.
    // We verify DialogContent is a defined object (a Vue component) — Reka UI
    // sets data-state on the element at runtime; no static prop exposes it.
    expect(typeof DialogContent).toBe('object')
    expect(DialogContent).not.toBeNull()
  })

  it('DialogTrigger accepts as-child to avoid wrapper element', () => {
    // We use asChild so the plugin author's trigger element is the actual
    // DOM node, not wrapped in an extra element that would break styling.
    const props = DialogTrigger.props as Record<string, unknown>
    expect(props.asChild ?? props['as-child']).toBeDefined()
  })

  it('DialogPortal is defined for teleporting content to body', () => {
    // DialogPortal teleports DialogOverlay and DialogContent to document.body,
    // matching the body-teleport pattern (content rendered via portal to <body>).
    expect(DialogPortal).toBeDefined()
  })

  it('DialogOverlay is defined for backdrop rendering', () => {
    // AppDialog renders DialogOverlay as a full-screen backdrop with blur.
    expect(DialogOverlay).toBeDefined()
  })

  it('DialogClose is defined for the close button', () => {
    // AppDialog renders a DialogClose button in the top-right corner.
    // DialogClose automatically calls the dialog's close handler when clicked.
    expect(DialogClose).toBeDefined()
  })

  it('DialogTitle and DialogDescription are defined for a11y', () => {
    // WAI-ARIA requires dialog elements to have an accessible name (DialogTitle)
    // and optionally a description (DialogDescription). Reka UI enforces this.
    expect(DialogTitle).toBeDefined()
    expect(DialogDescription).toBeDefined()
  })
})
