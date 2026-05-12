/**
 * Freehand module — the default drawing tool.
 *
 * Contributes:
 *   - The freehand `Tool` to `canvas.tools` so useCanvas can resolve
 *     the implementation when the active tool changes via IPC → event-bus.
 *   - A `crosshair` cursor for `ui.cursors`.
 *   - A tool button in the 'tools' group of the control bar.
 */
import { defineModule } from '@openpen/module-api'
import { createFreehandTool } from './freehand-tool'
import FreehandToolButton from './FreehandToolButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createFreehandTool()

export default defineModule({
  id: '@openpen/freehand',
  metadata: {
    name: { en: 'Freehand', 'zh-Hant': '手繪', 'zh-Hans': '手绘', ja: 'フリーハンド' },
    description: { en: 'Free-form pen tool.', 'zh-Hant': '自由筆觸的繪圖工具。', 'zh-Hans': '自由笔触的绘图工具。', ja: '自由な線が描けるペンツール。' },
  },
  contributes: {
    tools: [
      {
        id: 'freehand',
        ...tool,
      },
    ],
    cursors: [{ id: 'freehand', cursor: 'crosshair' }],
    controlBar: [
      {
        id: 'freehand',
        component: FreehandToolButton,
        defaultGroup: 'tools',
        groupHint: { separator: 'auto' },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
