/**
 * Design token contract test.
 *
 * Locked surface: every token name listed here is part of the public API for
 * plugin authors. Renaming or removing a token is a BREAKING CHANGE and MUST
 * be reflected as a major-version bump in @openpen/module-api.
 *
 * What this test verifies:
 *   1. Each token in the public surface exists in the CSS text.
 *   2. Both the dark-theme (:root) and light-theme ([data-theme='light']) blocks
 *      are present so theme switching works end-to-end.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const tokensCss = readFileSync(join(__dir, 'tokens.css'), 'utf-8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertToken(name: string) {
  expect(tokensCss, `missing token: ${name}`).toContain(`${name}:`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tokens.css — dark / light theme blocks', () => {
  it('contains a :root block (dark defaults)', () => {
    expect(tokensCss).toMatch(/:root\s*\{/)
  })

  it("contains a [data-theme='light'] override block", () => {
    expect(tokensCss).toMatch(/\[data-theme=['"]light['"]\]\s*\{/)
  })
})

describe('tokens.css — accent tokens', () => {
  const tokens = [
    '--openpen-color-accent',
    '--openpen-color-accent-hover',
    '--openpen-color-accent-bg',
    '--openpen-color-accent-glow',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — surface tokens', () => {
  const tokens = [
    '--openpen-color-surface',
    '--openpen-color-surface-hi',
    '--openpen-color-surface-popup',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — border tokens', () => {
  const tokens = [
    '--openpen-color-border',
    '--openpen-color-border-hi',
    '--openpen-color-popover-frame',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — text tokens', () => {
  const tokens = [
    '--openpen-color-text-primary',
    '--openpen-color-text-dim',
    '--openpen-color-text-muted',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — tooltip tokens', () => {
  const tokens = [
    '--openpen-color-tooltip-bg',
    '--openpen-color-tooltip-text',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — control chrome tokens', () => {
  const tokens = [
    '--openpen-color-control-hover',
    '--openpen-color-control-group',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — state tokens (info / warning / success / error × bg / border / text / icon)', () => {
  const states = ['info', 'warning', 'success', 'error']
  const properties = ['bg', 'border', 'text', 'icon']
  const tokens = states.flatMap((s) =>
    properties.map((p) => `--openpen-color-state-${s}-${p}`),
  )
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — form control tokens', () => {
  const tokens = [
    '--openpen-color-toggle-off',
    '--openpen-color-input-bg',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — radius tokens', () => {
  const tokens = [
    '--openpen-radius-sm',
    '--openpen-radius-md',
    '--openpen-radius-lg',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — spacing tokens', () => {
  const tokens = [
    '--openpen-space-xs',
    '--openpen-space-sm',
    '--openpen-space-md',
    '--openpen-space-lg',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — animation duration tokens', () => {
  const tokens = [
    '--openpen-duration-fast',
    '--openpen-duration-base',
    '--openpen-duration-bounce',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — animation easing tokens', () => {
  const tokens = [
    '--openpen-easing-bounce',
    '--openpen-easing-standard',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — shadow tokens', () => {
  const tokens = [
    '--openpen-shadow',
    '--openpen-shadow-sm',
  ]
  it.each(tokens)('defines %s', assertToken)
})

describe('tokens.css — blur token', () => {
  it('defines --openpen-blur', () => assertToken('--openpen-blur'))
})

describe('tokens.css — light theme overrides surface + border + text', () => {
  // The light block must redefine the tokens most likely to break if omitted.
  // We check that the substring appears at least twice (once in :root, once in
  // the light override block) rather than checking block context, which would
  // require a parser.
  const criticalOverrides = [
    '--openpen-color-surface',
    '--openpen-color-border',
    '--openpen-color-text-primary',
  ]

  it.each(criticalOverrides)(
    'token %s appears in both :root and light override',
    (name) => {
      const count = (tokensCss.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g')) ?? []).length
      expect(count, `${name} should appear in both :root and [data-theme='light']`).toBeGreaterThanOrEqual(2)
    },
  )
})
