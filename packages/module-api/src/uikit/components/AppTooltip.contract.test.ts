/**
 * AppTooltip.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the Tooltip API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppTooltip behaviour — it tests only the specific
 * reka-ui API contract that AppTooltip.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from 'reka-ui'

describe('reka-ui Tooltip contract (consumed by AppTooltip)', () => {
  it('exports the 6 components AppTooltip depends on', () => {
    expect(TooltipProvider).toBeDefined()
    expect(TooltipRoot).toBeDefined()
    expect(TooltipTrigger).toBeDefined()
    expect(TooltipPortal).toBeDefined()
    expect(TooltipContent).toBeDefined()
    expect(TooltipArrow).toBeDefined()
  })

  it('TooltipProvider accepts delayDuration prop', () => {
    // AppTooltip passes :delay-duration to TooltipProvider.
    const props = (TooltipProvider as any).props as Record<string, unknown>
    expect(props.delayDuration).toBeDefined()
  })

  it('TooltipRoot accepts open and defaultOpen props', () => {
    const props = (TooltipRoot as any).props as Record<string, unknown>
    expect(props.open).toBeDefined()
    expect(props.defaultOpen).toBeDefined()
  })

  it('TooltipRoot emits update:open for controlled open state', () => {
    // AppTooltip relies on the uncontrolled default (no :open binding),
    // but verifying the emit shape guards against reka-ui API renames.
    const emits = (TooltipRoot as any).emits as string[]
    expect(emits).toContain('update:open')
  })

  it('TooltipContent accepts side and sideOffset props', () => {
    // AppTooltip binds :side and uses a fixed :side-offset of 6.
    const props = (TooltipContent as any).props as Record<string, unknown>
    expect(props.side).toBeDefined()
    expect(props.sideOffset).toBeDefined()
  })

  it('TooltipContent accepts avoidCollisions and collisionPadding props', () => {
    // AppTooltip sets :avoid-collisions="true" :collision-padding="8" so tooltips
    // auto-flip away from viewport edges on transparent overlay windows.
    const props = (TooltipContent as any).props as Record<string, unknown>
    expect(props.avoidCollisions).toBeDefined()
    expect(props.collisionPadding).toBeDefined()
  })
})
