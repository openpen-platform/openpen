/**
 * settings-defaults.d.ts — `AppSettings` types (with literal unions).
 * The TypeScript renderer consumes types from here; the Electron
 * runtime imports the `.js` sibling.
 */

export interface UserShortcuts {
  toggleDrawingMode: string
  toggleBar: string
  undo: string
  redo: string
  quitApp: string
}

export declare const DEFAULT_SHORTCUTS: Readonly<UserShortcuts>

export type NotificationPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'en' | 'zh-Hans' | 'zh-Hant' | 'ja'
  enableDragAutoSnap: boolean
  barLayout: 'horizontal' | 'vertical'
  autoCollapseDelay: number
  ballOpacity: number
  defaultColor: string
  reducedMotion: boolean
  notifyOnDrawingMode: boolean
  notificationPosition: NotificationPosition
  confirmBeforeClearCanvas: boolean
  disabledModules: string[]
  /**
   * Plugin id collision resolutions chosen by the user.
   * Maps conflicting plugin id → the manifest.dir of the plugin to keep.
   * Other manifests with the same id are silently skipped on subsequent loads.
   */
  pluginIdConflictResolutions: Record<string, string>
}

export declare const DEFAULT_SETTINGS: Readonly<AppSettings>
