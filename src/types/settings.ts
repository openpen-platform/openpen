/**
 * settings.ts — renderer-side settings types (re-exports the shared definition).
 *
 * Usage:
 *   import type { AppSettings } from '../types/settings'
 *   import { DEFAULT_SETTINGS } from '../types/settings'
 */
export type { AppSettings, UserShortcuts } from '../../shared/settings-defaults'
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '../../shared/settings-defaults'
