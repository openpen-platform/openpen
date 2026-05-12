/**
 * AppTabs.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the Tabs API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppTabs behaviour — it tests only the specific
 * reka-ui API contract that AppTabs.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
} from 'reka-ui'

describe('reka-ui Tabs contract (consumed by AppTabs)', () => {
  it('exports the 4 components AppTabs depends on', () => {
    expect(TabsRoot).toBeDefined()
    expect(TabsList).toBeDefined()
    expect(TabsTrigger).toBeDefined()
    expect(TabsContent).toBeDefined()
  })

  it('TabsRoot accepts modelValue for controlled mode', () => {
    // AppTabs binds :model-value to the active tab id string.
    const props = (TabsRoot as any).props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
  })

  it('TabsRoot accepts defaultValue for uncontrolled mode', () => {
    const props = (TabsRoot as any).props as Record<string, unknown>
    expect(props.defaultValue).toBeDefined()
  })

  it('TabsRoot emits update:modelValue on tab change (controlled mode)', () => {
    // AppTabs uses @update:model-value to emit update:modelValue to the parent.
    const emits = (TabsRoot as any).emits as string[]
    expect(emits).toContain('update:modelValue')
  })

  it('TabsTrigger accepts value prop for tab identification', () => {
    // AppTabs binds :value="tab.id" on each TabsTrigger.
    const props = (TabsTrigger as any).props as Record<string, unknown>
    expect(props.value).toBeDefined()
  })

  it('TabsContent accepts value prop to match its trigger', () => {
    // AppTabs renders one TabsContent per tab, matched via :value="tab.id".
    const props = (TabsContent as any).props as Record<string, unknown>
    expect(props.value).toBeDefined()
  })
})
