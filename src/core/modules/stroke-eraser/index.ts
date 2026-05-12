/**
 * Stroke-eraser module — touch a stroke to delete it (with undo support
 * via the history command system).
 *
 * Contributes:
 *   - The stroke-eraser `Tool` to `canvas.tools`.
 *   - A `pointer` cursor for `ui.cursors`.
 *
 * Note: the control-bar button is intentionally NOT contributed here.
 * EraserToolButton (eraser module) exposes a caret popup that lets the user
 * switch between brush-erase and stroke-erase modes — there is no standalone
 * stroke-eraser button in the control bar.
 */
import { defineModule } from '@openpen/module-api'
import { createStrokeEraserTool } from './stroke-eraser-tool'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createStrokeEraserTool()

export default defineModule({
  id: '@openpen/stroke-eraser',
  metadata: {
    name: { en: 'Stroke Eraser', 'zh-Hant': '線條橡皮擦', 'zh-Hans': '线条橡皮擦', ja: 'ストローク消しゴム' },
    description: { en: 'Touch any stroke to delete it entirely.', 'zh-Hant': '觸碰任意筆跡即可將其整條刪除。', 'zh-Hans': '触碰任意笔迹即可将其整条删除。', ja: '触れたストロークをまるごと削除します。' },
  },
  contributes: {
    tools: [
      {
        id: 'stroke-eraser',
        ...tool,
      },
    ],
    cursors: [{ id: 'stroke-eraser', cursor: 'pointer' }],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
