/**
 * Line module — straight-line tool with shift-snap to 45° angles.
 *
 * Contributes:
 *   - The line `Tool` to `canvas.tools`.
 *   - A `crosshair` cursor for `ui.cursors`.
 *   - A tool button in the 'tools' group of the control bar.
 */
import { defineModule } from '@openpen/module-api'
import { createLineTool } from './line-tool'
import LineToolButton from './LineToolButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createLineTool()

export default defineModule({
  id: '@openpen/line',
  metadata: {
    name: { en: 'Line', 'zh-Hant': '直線', 'zh-Hans': '直线', ja: '直線' },
    description: { en: 'Straight line tool. Hold Shift to snap to 45°.', 'zh-Hant': '直線繪製工具，按住 Shift 可吸附至 45° 角。', 'zh-Hans': '直线绘制工具，按住 Shift 可吸附至 45° 角。', ja: '直線ツール。Shift を押しながら描くと 45° にスナップ。' },
  },
  contributes: {
    tools: [{ id: 'line', ...tool }],
    cursors: [{ id: 'line', cursor: 'crosshair' }],
    controlBar: [
      {
        id: 'line',
        component: LineToolButton,
        defaultGroup: 'tools',
        groupHint: { separator: 'auto' },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
