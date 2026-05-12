import { defineModule, z } from '@openpen/module-api'
import StrokeWidthSlider from './StrokeWidthSlider.vue'
import StrokeWidthSettingsPanel from './StrokeWidthSettingsPanel.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

export default defineModule({
  id: '@openpen/stroke-width',
  metadata: {
    name: { en: 'Stroke Width', 'zh-Hant': '筆畫粗細', 'zh-Hans': '笔画粗细', ja: '線の太さ' },
    description: { en: 'Control bar slider and popup for adjusting stroke line width.', 'zh-Hant': '控制列線寬滑桿與彈出調整視窗。', 'zh-Hans': '控制栏线宽滑块与弹出调整窗口。', ja: 'コントロールバーの線幅スライダーとポップアップ調整UI。' },
  },
  settingsSchema: z.object({
    defaultWidth: z.number().min(1).max(20).default(4),
    minWidth: z.number().min(1).max(20).default(1),
    maxWidth: z.number().min(1).max(20).default(20),
    style: z.enum(['slider', 'popup']).default('slider'),
  }),
  contributes: {
    controlBar: [
      {
        id: 'stroke-width',
        component: StrokeWidthSlider,
        defaultGroup: 'stroke-width',
        groupHint: { separator: 'always' },
      },
    ],
    strokeStyle: { provides: ['lineWidth'] },
    settingsPanels: [
      {
        id: 'openpen.stroke-width-settings',
        label: { en: 'Stroke Width', 'zh-Hant': '線寬', 'zh-Hans': '线宽', ja: '線幅' },
        component: StrokeWidthSettingsPanel,
      },
    ],
    locales: {
      en,
      'zh-Hant': zhHant,
      'zh-Hans': zhHans,
      ja,
    },
  },
})
