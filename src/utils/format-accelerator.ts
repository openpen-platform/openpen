/**
 * Format an Electron accelerator string for display, picking platform-native
 * modifier glyphs: ⌘⌥⌃⇧ on macOS, Ctrl/Alt/Shift on Win/Linux.
 *
 * `CommandOrControl` resolves to ⌘ on macOS and Ctrl elsewhere — matching
 * what Electron actually registers at runtime.
 */
export type Platform = 'darwin' | 'win32' | 'linux'

export function formatAccelerator(accel: string, platform: Platform): string {
  if (!accel) return ''
  const isMac = platform === 'darwin'
  return accel.split('+').map((part) => {
    if (isMac) {
      if (part === 'CommandOrControl' || part === 'Command' || part === 'Cmd' || part === 'Meta') return '⌘'
      if (part === 'Control' || part === 'Ctrl') return '⌃'
      if (part === 'Alt' || part === 'Option') return '⌥'
      if (part === 'Shift') return '⇧'
    } else {
      if (part === 'CommandOrControl' || part === 'Control' || part === 'Cmd' || part === 'Meta') return 'Ctrl'
      if (part === 'Option') return 'Alt'
    }
    return part
  }).join(isMac ? '' : '+')
}
