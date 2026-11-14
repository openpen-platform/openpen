import { activateTool } from '@openpen/module-api'
import { useStrokeStyle } from '@openpen/module-api/host'
import type { ShortcutContribution } from '@openpen/module-api'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

interface ToolHotkey {
  id: string
  toolId: string
  keys: string
}

interface ColorHotkey {
  id: string
  color: string
  keys: string
}

/** Labels live in the locale files under `hotkeys.<shortcut id>`. */
function labelOf(id: string): Record<string, string> {
  const pick = (messages: { hotkeys: Record<string, string> }) => messages.hotkeys[id]
  return { en: pick(en), 'zh-Hant': pick(zhHant), 'zh-Hans': pick(zhHans), ja: pick(ja) }
}

/** Built-in tools, in control-bar order. `toolId` is the `canvas.tools` id. */
export const TOOL_HOTKEYS: readonly ToolHotkey[] = [
  { id: 'tool-freehand', toolId: 'freehand', keys: 'P' },
  { id: 'tool-line', toolId: 'line', keys: 'L' },
  { id: 'tool-shape', toolId: 'shape', keys: 'R' },
  { id: 'tool-highlighter', toolId: 'highlighter-pen', keys: 'H' },
  { id: 'tool-eraser', toolId: 'eraser', keys: 'E' },
  { id: 'tool-stroke-eraser', toolId: 'stroke-eraser', keys: 'Shift+E' },
]

/** The eight preset swatches of the color picker, keys 1-8 in swatch order. */
export const COLOR_HOTKEYS: readonly ColorHotkey[] = [
  { id: 'color-red', color: '#F87171', keys: '1' },
  { id: 'color-orange', color: '#FB923C', keys: '2' },
  { id: 'color-yellow', color: '#FBBF24', keys: '3' },
  { id: 'color-green', color: '#34D399', keys: '4' },
  { id: 'color-blue', color: '#60A5FA', keys: '5' },
  { id: 'color-indigo', color: '#818CF8', keys: '6' },
  { id: 'color-pink', color: '#F472B6', keys: '7' },
  { id: 'color-white', color: '#FFFFFF', keys: '8' },
]

export function buildHotkeyShortcuts(): ShortcutContribution[] {
  const tools = TOOL_HOTKEYS.map((t): ShortcutContribution => ({
    id: t.id,
    keys: t.keys,
    scope: 'drawing',
    label: labelOf(t.id),
    userCustomizable: true,
    handler: () => activateTool(t.toolId),
  }))
  const colors = COLOR_HOTKEYS.map((c): ShortcutContribution => ({
    id: c.id,
    keys: c.keys,
    scope: 'drawing',
    label: labelOf(c.id),
    userCustomizable: true,
    handler: () => useStrokeStyle().setColor(c.color),
  }))
  return [...tools, ...colors]
}
