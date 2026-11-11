/**
 * Highlighter module — semi-transparent marker pen.
 *
 * Contributes:
 *   - The highlighter `Tool` to `canvas.tools`.
 *   - A marker cursor for `ui.cursors`.
 *   - A tool button in the 'tools' group of the control bar.
 */
import { defineModule } from '@openpen/module-api'
import { createHighlighterTool, HIGHLIGHTER_TOOL_ID } from './highlighter-tool'
import { highlighterCursor } from './cursor'
import HighlighterToolButton from './HighlighterToolButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createHighlighterTool()

export default defineModule({
  id: '@openpen/highlighter',
  metadata: {
    name: { en: 'Highlighter', 'zh-Hant': '螢光筆', 'zh-Hans': '荧光笔', ja: '蛍光ペン' },
    description: { en: 'Semi-transparent marker for highlighting content without covering it.', 'zh-Hant': '半透明的螢光筆，標出重點又不蓋住底下的內容。', 'zh-Hans': '半透明的荧光笔，标出重点又不盖住底下的内容。', ja: '下の内容を隠さずに強調できる半透明のマーカー。' },
  },
  contributes: {
    tools: [{ id: HIGHLIGHTER_TOOL_ID, ...tool }],
    cursors: [{ id: HIGHLIGHTER_TOOL_ID, cursor: highlighterCursor }],
    controlBar: [
      {
        id: HIGHLIGHTER_TOOL_ID,
        component: HighlighterToolButton,
        defaultGroup: 'tools',
        groupHint: { separator: 'auto' },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
