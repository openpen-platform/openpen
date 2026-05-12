/**
 * OpenPen plugin starter — UIKit demo + custom drawing tool.
 *
 * What this plugin does:
 *   - Adds a control-bar button that opens an `AppPopover` popup.
 *   - Inside the popup, an `AppSlider` controls a `size` value.
 *   - Uses `setup(ctx)` to show a toast notification when the plugin loads,
 *     demonstrating `ctx.notify()` as a lightweight feedback mechanism.
 *   - Contributes a "demo" drawing tool (`canvas.tools`) that draws with
 *     semi-transparent strokes, demonstrating the full Tool contract including
 *     extra Stroke state (opacity) that survives into renderStroke.
 *
 * Both UIKit components come from `@openpen/module-api/uikit` (Layer 1).
 * No inject keys, headless library, or host internals required.
 *
 * What you'd do next:
 *   - Replace DemoTool with your own drawing primitive.
 *   - Drop a settings tab into `ui.settings.tabs`.
 *   - Wire a global shortcut via `system.shortcuts`.
 *
 * Build with `npm run build`. Drop the resulting `dist/renderer.js`
 * (and `plugin.json`) into `~/.openpen/plugins/openpen-plugin-starter/`
 * and restart the app.
 */
import { defineModule, z } from '@openpen/module-api'
export { MODULE_ID } from './module-id'
import { MODULE_ID } from './module-id'
import PopoverDemo from './PopoverDemo.vue'
import HelloButton from './HelloButton.vue'
import MyNumberSpinner from './MyNumberSpinner.vue'
import { createDemoTool, renderDemoStroke } from './demo-tool'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'

export default defineModule({
  id: MODULE_ID,
  version: '0.1.0',

  // Declare the settings schema so ctx.updateSettings() / ctx.getSettings()
  // work at runtime and from within Vue components via useModuleContext().
  settingsSchema: z.object({
    label: z.string().default('👋'),
  }),

  /**
   * setup() is called once after the module is loaded and before contributions
   * are wired. ctx.notify() shows a short-lived toast — useful for "load
   * complete", "shortcut triggered", and other immediate-feedback scenarios.
   *
   * Note: toasts only appear in the overlay window (NotificationLayer is only
   * mounted there). See docs/reference/notify-api.md.
   */
  setup(ctx) {
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1800,
    })
  },

  contributes: {
    tools: [
      {
        id: 'openpen-plugin-starter.demo',
        label: { en: 'Demo', 'zh-Hant': '示範' },
        // SVG string rendered via v-html in the host control-bar button.
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3"/></svg>',
        ...createDemoTool(),
        renderStroke: renderDemoStroke,
      },
    ],
    controlBar: [
      {
        id: 'starter-popover',
        component: PopoverDemo,
      },
      {
        // HelloButton reads / writes settings via useModuleContext() —
        // the pattern every plugin component should follow.
        id: 'starter-hello',
        component: HelloButton,
      },
      {
        // MyNumberSpinner demonstrates building a custom component from Reka UI
        // primitives and OpenPen design tokens — see docs/guides/custom-uikit-components.md.
        id: 'starter-spinner',
        component: MyNumberSpinner,
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
