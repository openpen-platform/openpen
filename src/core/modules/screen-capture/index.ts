/**
 * Screen-capture module — control-bar button plus two global shortcuts that
 * save the display under the cursor (annotations included) as a PNG or copy it
 * to the clipboard. The capture itself runs in the main process
 * (electron/screen-capture-manager.js); this module is the user-facing entry.
 */
import { defineModule, type ModuleSetupContext } from '@openpen/module-api'
import { useDialog } from '@openpen/module-api/uikit'
import CaptureButton from './CaptureButton.vue'
import { notifyCaptureResult, runCapture, type CaptureTarget } from './capture-flow'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

let moduleCtx: ModuleSetupContext | null = null

function captureFromShortcut(target: CaptureTarget): void {
  const ctx = moduleCtx
  if (!ctx) return
  const dialog = useDialog()
  void runCapture(target, {
    api: window.openPenApi,
    notify: ctx.notify,
    t: ctx.t,
    confirm: (opts) => dialog.confirm(opts),
  })
}

export default defineModule({
  id: '@openpen/screen-capture',
  metadata: {
    name: { en: 'Screen Capture', 'zh-Hant': '擷取畫面', 'zh-Hans': '截取屏幕', ja: '画面キャプチャ' },
    description: {
      en: 'Save the screen with your annotations as a PNG, or copy it to the clipboard.',
      'zh-Hant': '把含標註的螢幕存成 PNG 圖檔，或複製到剪貼簿。',
      'zh-Hans': '把含标注的屏幕存成 PNG 图片，或复制到剪贴板。',
      ja: '書き込みを含む画面を PNG として保存、またはクリップボードにコピーします。',
    },
  },
  setup(ctx) {
    moduleCtx = ctx
    // Captures started from the control bar finish with no toast layer in
    // that window; the host sends the outcome to the overlay windows instead.
    const offResult = window.openPenApi?.onCaptureResult(({ result }) => {
      notifyCaptureResult(result, { notify: ctx.notify, t: ctx.t })
    })
    ctx.onDispose(() => { moduleCtx = null; offResult?.() })
  },
  contributes: {
    controlBar: [
      {
        id: 'screen-capture',
        component: CaptureButton,
        defaultGroup: 'capture',
        groupHint: { separator: 'always' },
      },
    ],
    shortcuts: [
      {
        id: 'capture-save',
        keys: 'CommandOrControl+Alt+Shift+4',
        scope: 'global',
        label: { en: 'Capture to File', 'zh-Hant': '擷取並存檔', 'zh-Hans': '截取并存档', ja: 'キャプチャを保存' },
        sublabel: {
          en: 'Save the screen with annotations as a PNG',
          'zh-Hant': '把含標註的螢幕存成 PNG',
          'zh-Hans': '把含标注的屏幕存成 PNG',
          ja: '書き込み入りの画面を PNG で保存',
        },
        userCustomizable: true,
        handler() { captureFromShortcut('save') },
      },
      {
        id: 'capture-copy',
        keys: 'CommandOrControl+Alt+Shift+5',
        scope: 'global',
        label: { en: 'Capture to Clipboard', 'zh-Hant': '擷取並複製', 'zh-Hans': '截取并复制', ja: 'キャプチャをコピー' },
        sublabel: {
          en: 'Copy the screen with annotations to the clipboard',
          'zh-Hant': '把含標註的螢幕複製到剪貼簿',
          'zh-Hans': '把含标注的屏幕复制到剪贴板',
          ja: '書き込み入りの画面をクリップボードにコピー',
        },
        userCustomizable: true,
        handler() { captureFromShortcut('copy') },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  },
})
