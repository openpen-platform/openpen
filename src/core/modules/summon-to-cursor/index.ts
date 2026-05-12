import { defineModule } from '@openpen/module-api'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

async function summonToCursor(): Promise<void> {
  const api = window.openPenApi
  if (!api?.sendPositioningIntent) return

  // Engine reads the cursor position, resolves the display, and updates ballScreenPos
  // to the exact cursor screen point. The renderer animator in usePositioning animates
  // the ball CSS variable from its current position to the new position.
  await api.sendPositioningIntent({ type: 'summon-to-cursor' })
}

export default defineModule({
  id: '@openpen/summon-to-cursor',
  metadata: {
    name: { en: 'Summon to Cursor', 'zh-Hant': '召喚至游標', 'zh-Hans': '召唤至光标', ja: 'カーソルに呼び出し' },
    description: { en: 'Use the shortcut to move the floating ball to the current mouse cursor position.', 'zh-Hant': '透過快捷鍵將浮動球移動至目前滑鼠游標位置。', 'zh-Hans': '透过快捷键将浮动球移动到当前鼠标光标位置。', ja: 'ショートカットでフローティングボールをマウスカーソルの位置に移動します。' },
  },
  contributes: {
    shortcuts: [
      {
        id: 'summon',
        keys: 'CommandOrControl+Shift+S',
        scope: 'global',
        label: { en: 'Summon', 'zh-Hant': '召喚', 'zh-Hans': '召唤', ja: '呼び出し' },
        sublabel: { en: 'Triggers the summon action', 'zh-Hant': '觸發召喚動作', 'zh-Hans': '触发召唤动作', ja: '召喚アクションをトリガー' },
        userCustomizable: true,
        handler() {
          void summonToCursor()
        },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
