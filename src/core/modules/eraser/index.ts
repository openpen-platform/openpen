/**
 * Eraser module — destination-out brush erase.
 *
 * Contributes:
 *   - The eraser `Tool` to `canvas.tools`.
 *   - A `crosshair` cursor for `ui.cursors`.
 *   - A tool button in the 'tools' group of the control bar.
 */
import { defineModule, z } from '@openpen/module-api'
import { on as eventBusOn } from '@openpen/module-api/host'
import { lastEraserMode } from './eraser-state'
import { createEraserTool, renderEraserStroke } from './eraser-tool'
import { eraserCursor, eraserCursorAnimated } from './cursor'
import EraserToolButton from './EraserToolButton.vue'

// Honour OS-level reduced-motion preference at module load.
const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

const tool = createEraserTool()
let unsubToolChanged: (() => void) | null = null

export default defineModule({
  id: '@openpen/eraser',
  metadata: {
    name: { en: 'Eraser', 'zh-Hant': '橡皮擦', 'zh-Hans': '橡皮擦', ja: '消しゴム' },
    description: { en: 'Brush eraser using destination-out compositing.', 'zh-Hant': '以 destination-out 合成方式清除筆跡的筆刷橡皮擦。', 'zh-Hans': '以 destination-out 合成方式清除笔迹的笔刷橡皮擦。', ja: 'destination-out 合成で描画を消すブラシ消しゴム。' },
  },
  // The last eraser mode picked in the eraser panel survives a restart. It is
  // written only on that explicit pick (EraserToolButton), so a hotkey or a
  // relayed tool-changed never overwrites it.
  settingsSchema: z.object({
    mode: z.enum(['eraser', 'stroke-eraser']).default('eraser'),
  }),
  setup(ctx) {
    lastEraserMode.value = ctx.getSettings<{ mode?: 'eraser' | 'stroke-eraser' }>().mode ?? 'eraser'
    unsubToolChanged?.()
    unsubToolChanged = eventBusOn('tool-changed', (payload) => {
      const tool = (payload as { tool?: string })?.tool
      if (tool !== 'eraser' && tool !== 'stroke-eraser') return
      lastEraserMode.value = tool
    })
  },
  contributes: {
    lifecycle: {
      onQuit() {
        unsubToolChanged?.()
        unsubToolChanged = null
      },
    },
    tools: [
      {
        id: 'eraser',
        ...tool,
        renderStroke: renderEraserStroke,
      },
    ],
    cursors: [{
      id: 'eraser',
      cursor: reducedMotion ? eraserCursor : eraserCursorAnimated,
    }],
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
