/**
 * Drawing hotkeys: single-key shortcuts for the built-in tools and the
 * preset colors. Every shortcut is drawing-scoped: the key is grabbed only
 * while drawing mode is on and goes to the app underneath otherwise.
 *
 * Tool switches go through `activateTool`, the same path plugin shortcuts use,
 * so the matching control bar button lights up on every display.
 */
import { defineModule } from '@openpen/module-api'
import { buildHotkeyShortcuts } from './hotkeys'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

export default defineModule({
  id: '@openpen/drawing-hotkeys',
  metadata: {
    name: { en: en.name, 'zh-Hant': zhHant.name, 'zh-Hans': zhHans.name, ja: ja.name },
    description: {
      en: en.description,
      'zh-Hant': zhHant.description,
      'zh-Hans': zhHans.description,
      ja: ja.description,
    },
  },
  contributes: {
    shortcuts: buildHotkeyShortcuts(),
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
