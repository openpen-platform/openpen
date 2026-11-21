/**
 * settings-defaults.js — single source of truth for default user settings.
 *
 * Imported at runtime by the Electron main process and consumed for
 * types by the TypeScript renderer via `settings-defaults.d.ts`. Must
 * remain free of Node.js and Electron imports.
 */

import { MCP_PORT } from './mcp-constants.js'

/** @type {import('./settings-defaults').UserShortcuts} */
export const DEFAULT_SHORTCUTS = Object.freeze({
  toggleDrawingMode: 'CommandOrControl+Shift+A',
  toggleBar: 'CommandOrControl+Shift+\\',
  toggleStrokesVisible: 'CommandOrControl+F9',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
  quitApp: 'CommandOrControl+Alt+Shift+X',
})

/** @type {import('./settings-defaults').AppSettings} */
export const DEFAULT_SETTINGS = Object.freeze({
  theme: /** @type {'light' | 'dark' | 'system'} */ ('system'),
  language: /** @type {'en' | 'zh-Hans' | 'zh-Hant' | 'ja'} */ ('en'),
  enableDragAutoSnap: true,
  barLayout: /** @type {'horizontal' | 'vertical'} */ ('horizontal'),
  autoCollapseDelay: 3000,   // ms
  ballOpacity: 0.85,         // 0.3 ~ 1.0
  defaultColor: '#818CF8',
  reducedMotion: false,
  notifyOnDrawingMode: true,
  notificationPosition: /** @type {import('./settings-defaults').NotificationPosition} */ ('top-center'),
  confirmBeforeClearCanvas: true,
  hideStrokesOnExit: false,
  strokeFadeEnabled: false,
  strokeFadeSeconds: 5,       // 1 ~ 30
  autoCheckUpdate: true,
  showCommunityPlugins: false,
  disabledModules: /** @type {string[]} */ ([]),
  pluginIdConflictResolutions: /** @type {Record<string, string>} */ ({}),
  // Local MCP endpoint. Off on a fresh install; the key is generated the first
  // time the switch is turned on.
  mcp: {
    enabled: false,
    apiKey: '',
    readOnly: false,
    exposeAll: true,
    enabledPlugins: /** @type {string[]} */ ([]),
    /** Port the server listens on (127.0.0.1 only). */
    port: MCP_PORT,
  },
})
