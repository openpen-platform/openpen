import { defineModule, z } from '@openpen/module-api'
import ColorButton from './ColorButton.vue'
import ColorSettingsPanel from './ColorSettingsPanel.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

export default defineModule({
  id: '@openpen/color',
  metadata: {
    name: { en: 'Color', 'zh-Hant': '顏色', 'zh-Hans': '颜色', ja: 'カラー' },
    description: { en: 'Control bar color swatch and color picker popup.', 'zh-Hant': '控制列顏色色票按鈕與顏色選擇器彈出視窗。', 'zh-Hans': '控制栏颜色色块按钮与颜色选择器弹出窗口。', ja: 'コントロールバーのカラースウォッチボタンとカラーピッカーポップアップ。' },
  },
  settingsSchema: z.object({
    defaultColor: z.string().default('#818cf8'),
  }),
  contributes: {
    controlBar: [
      {
        id: 'color',
        component: ColorButton,
        defaultGroup: 'color',
        groupHint: { separator: 'always' },
      },
    ],
    settingsPanels: [
      {
        id: 'color-settings',
        label: { en: 'Color', 'zh-Hant': '顏色', 'zh-Hans': '颜色', ja: 'カラー' },
        component: ColorSettingsPanel,
      },
    ],
    strokeStyle: { provides: ['color'] },
    locales: {
      en,
      'zh-Hant': zhHant,
      'zh-Hans': zhHans,
      ja,
    },
  },
})
