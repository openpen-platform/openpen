/**
 * Display label for a hold-to-draw key: "Fn", "Right ⌥" / "右⌥" on macOS,
 * "Right Ctrl" / "右 Ctrl" on Windows. Side words come from i18n; a CJK side
 * word sits flush against a single glyph, otherwise a space separates them.
 */
import type { Platform } from './format-accelerator'

const MAC_NAMES: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
const PC_NAMES: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' }

export function formatHoldKey(
  key: string,
  platform: Platform,
  sides: { left: string; right: string },
): string {
  if (key === 'Fn') return 'Fn'
  const m = /^(Control|Alt|Shift|Meta)(Left|Right)$/.exec(key)
  if (!m) return key
  const name = (platform === 'darwin' ? MAC_NAMES : PC_NAMES)[m[1]]
  const side = m[2] === 'Left' ? sides.left : sides.right
  // eslint-disable-next-line no-control-regex
  const flush = name.length === 1 && !/^[\x00-\x7F]+$/.test(side)
  return flush ? `${side}${name}` : `${side} ${name}`
}
