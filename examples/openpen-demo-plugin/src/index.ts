/**
 * openpen-demo-plugin — Highlighter tool.
 *
 * Demonstrates a real `canvas.tools` contribution with a custom
 * `renderStroke` so the highlighter's translucent strokes redraw
 * correctly on undo / redo / canvas resize.
 */
import { defineModule } from '@openpen/module-api'
import { createHighlighterTool, renderHighlighterStroke } from './highlighter-tool'
import HighlighterButton from './HighlighterButton.vue'

const tool = createHighlighterTool()

export default defineModule({
  id: '@openpen/demo-plugin',
  name: { en: 'Highlighter', 'zh-TW': '螢光筆' },
  version: '0.2.0',
  description: {
    en: 'Demo plugin: a translucent highlighter tool.',
    'zh-TW': '範例外掛：半透明螢光筆工具。',
  },
  contributes: {
    tools: [
      {
        id: 'highlighter',
        label: { en: 'Highlighter', 'zh-TW': '螢光筆' },
        ...tool,
        renderStroke: renderHighlighterStroke,
      },
    ],
    toolbar: [
      {
        id: 'highlighter',
        placement: 'left',
        order: 60,
        component: HighlighterButton,
      },
    ],
    cursors: [{ id: 'highlighter', cursor: 'crosshair' }],
  },
})
