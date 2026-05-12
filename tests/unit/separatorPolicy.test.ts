import { describe, it, expect } from 'vitest'
import { shouldShowLeadingSeparator, type ControlBarGroup } from '../../src/core/runtime/slot-runtime'

function group(
  id: string,
  separator?: 'auto' | 'always' | 'never',
): ControlBarGroup {
  return { id, items: [], separator }
}

describe('shouldShowLeadingSeparator', () => {
  describe("'never'", () => {
    it('never shows, regardless of position or previous group', () => {
      const groups = [group('a', 'always'), group('b', 'never')]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(true)
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(false)
    })

    it('never shows for first group either', () => {
      const groups = [group('a', 'never')]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(false)
    })
  })

  describe("'always'", () => {
    it('shows even when first (explicit user intent)', () => {
      const groups = [group('a', 'always')]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(true)
    })

    it('shows for any non-first position too', () => {
      const groups = [group('a', 'auto'), group('b', 'always')]
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(true)
    })
  })

  describe("'auto' (and undefined → defaults to 'auto')", () => {
    it('does NOT show when first', () => {
      const groups = [group('a', 'auto')]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(false)
    })

    it('does NOT show when first and separator omitted', () => {
      const groups = [group('a', undefined)]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(false)
    })

    it('shows when non-first and previous is auto', () => {
      const groups = [group('a', 'auto'), group('b', 'auto')]
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(true)
    })

    it('shows when non-first and previous is never', () => {
      const groups = [group('a', 'never'), group('b', 'auto')]
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(true)
    })

    it("does NOT show when previous is 'always' (avoid stacking adjacent loud separators)", () => {
      const groups = [group('a', 'always'), group('b', 'auto')]
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(false)
    })

    it('three-group chain: auto / always / auto — third yields false', () => {
      const groups = [group('a', 'auto'), group('b', 'always'), group('c', 'auto')]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(false)
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(true)
      expect(shouldShowLeadingSeparator(groups[2], 2, groups)).toBe(false)
    })

    it('treats undefined separator as auto (default)', () => {
      const groups = [group('a', undefined), group('b', undefined)]
      expect(shouldShowLeadingSeparator(groups[0], 0, groups)).toBe(false)
      expect(shouldShowLeadingSeparator(groups[1], 1, groups)).toBe(true)
    })
  })
})
