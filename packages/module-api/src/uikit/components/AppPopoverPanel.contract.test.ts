/**
 * Locks the plugin-facing surface of the popover panel components: the two new
 * exports, and the AppPopover frame values that must stay aligned with the
 * host's own popup panels (border-hi frame, shadow-sm shadow).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(dir, rel), 'utf-8')

describe('popover panel contract', () => {
  it('exports AppPopoverPanel and AppPopoverRow from the uikit barrel', () => {
    const index = read('../index.ts')
    expect(index).toContain("export { default as AppPopoverPanel }")
    expect(index).toContain("export { default as AppPopoverRow }")
  })

  it('keeps the default popover frame token unchanged in the light theme block', () => {
    const css = read('../tokens.css')
    expect(css).toContain('--openpen-color-popover-frame: rgba(148, 163, 184, 0.7);')
  })

  it('gives only popovers holding an AppPopoverPanel the border-hi frame and small shadow', () => {
    const vue = read('./AppPopover.vue')
    const rule = vue.match(/\.openpen-popover-content:has\(\.openpen-popover-panel\)\s*\{([^}]*)\}/)
    expect(rule, 'missing :has(.openpen-popover-panel) rule').not.toBeNull()
    expect(rule![1]).toContain('border-color: var(--openpen-color-border-hi);')
    expect(rule![1]).toContain('box-shadow: var(--openpen-shadow-sm);')
    expect(vue).toMatch(/\.openpen-popover-content \{[^}]*box-shadow: var\(--openpen-shadow\);/)
  })

  // jsdom does no layout, so the shared-column contract is checked on the SFC styles.
  it('declares the shared label / control / (optional) value columns and joins them from each row with subgrid', () => {
    const panel = read('./AppPopoverPanel.vue')
    const row = read('./AppPopoverRow.vue')
    expect(panel).toMatch(/grid-template-columns:\s*auto\s+minmax\(140px,\s*1fr\)\s+auto/)
    expect(row).toMatch(/grid-template-columns:\s*subgrid/)
    expect(row).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('keeps the stacked layout spacing: 10px between rows and 6px below the title', () => {
    const panel = read('./AppPopoverPanel.vue')
    expect(panel).toMatch(/row-gap:\s*10px/)
    expect(panel).toMatch(/\.openpen-popover-title \{[^}]*margin-bottom:\s*6px/)
  })
})
