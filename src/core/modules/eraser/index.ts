/**
 * Eraser module — destination-out brush erase.
 *
 * Contributes:
 *   - The eraser `Tool` to `canvas.tools`.
 *   - A `crosshair` cursor for `ui.cursors`.
 *   - A tool button in the 'tools' group of the control bar.
 */
import { defineModule } from '@openpen/module-api'
import { createEraserTool, renderEraserStroke } from './eraser-tool'
import EraserToolButton from './EraserToolButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createEraserTool()

export default defineModule({
  id: '@openpen/eraser',
  metadata: {
    name: { en: 'Eraser', 'zh-Hant': '橡皮擦', 'zh-Hans': '橡皮擦', ja: '消しゴム' },
    description: { en: 'Brush eraser using destination-out compositing.', 'zh-Hant': '以 destination-out 合成方式清除筆跡的筆刷橡皮擦。', 'zh-Hans': '以 destination-out 合成方式清除笔迹的笔刷橡皮擦。', ja: 'destination-out 合成で描画を消すブラシ消しゴム。' },
  },
  contributes: {
    tools: [
      {
        id: 'eraser',
        ...tool,
        renderStroke: renderEraserStroke,
      },
    ],
    cursors: [{ id: 'eraser', cursor: 'crosshair' }],
    controlBar: [
      {
        id: 'eraser',
        component: EraserToolButton,
        // Eraser is its own group between 'tools' and 'stroke-width', separated
        // by an always-on divider. Placing it in 'default' (which renders last)
        // would put it after 'color', breaking the intended layout order.
        defaultGroup: 'eraser',
        groupHint: { separator: 'always' },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
