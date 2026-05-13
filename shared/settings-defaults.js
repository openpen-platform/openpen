/**
 * settings-defaults.js — single source of truth for default user settings.
 *
 * Imported at runtime by the Electron main process and consumed for
 * types by the TypeScript renderer via `settings-defaults.d.ts`. Must
 * remain free of Node.js and Electron imports.
 */

/** @type {import('./settings-defaults').UserShortcuts} */
export const DEFAULT_SHORTCUTS = Object.freeze({
  toggleDrawingMode: 'CommandOrControl+Shift+A',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
  quitApp: 'CommandOrControl+Q',
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
  disabledModules: /** @type {string[]} */ ([]),
  pluginIdConflictResolutions: /** @type {Record<string, string>} */ ({}),
})
