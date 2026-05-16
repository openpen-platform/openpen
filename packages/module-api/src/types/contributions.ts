import type { Component } from 'vue'
import type { LocaleMap } from '../locale'
import type { Stroke, Tool } from './tool'
import type { ControlBarContribution } from './control-bar-layout'

export type { ControlBarContribution }

/**
 * The shape of `OpenPenModule.contributes`. Every field is optional;
 * `defineModule` requires at least one field to be present and rejects
 * any unknown field at module-author boundary time.
 *
 * Each field corresponds to a slot in {@link import('../slots').ALL_SLOTS}.
 * The mapping from camelCase field name to dotted slot id lives in
 * `CONTRIBUTION_KEY_TO_SLOT_ID`.
 */
export interface ModuleContributions {
  // ── Canvas ──────────────────────────────────────────────────────────────
  tools?: ToolContribution[]
  shapes?: ShapeContribution[]
  strokeStyle?: StrokeStyleContribution
  historyCommands?: HistoryCommandContribution[]
  backgroundLayers?: CanvasLayerContribution[]
  overlayLayers?: CanvasLayerContribution[]
  htmlOverlays?: HtmlOverlayContribution[]
  /** ⏳ Reserved slot — accepts registrations, adapter not yet wired. */
  strokeTransformers?: StrokeTransformerContribution[]

  // ── UI ──────────────────────────────────────────────────────────────────
  controlBar?: ControlBarContribution[]
  settingsTabs?: SettingsTabContribution[]
  settingsPanels?: SettingsPanelContribution[]
  cursors?: CursorContribution[]
  status?: StatusContribution[]
  modals?: ModalContribution[]
  trayMenu?: TrayMenuContribution[]
  /** ⏳ Reserved slot — accepts registrations, adapter not yet wired. */
  contextMenu?: ContextMenuContribution[]
  /** ⏳ Reserved slot — accepts registrations, adapter not yet wired. */
  themeTokens?: ThemeTokenContribution

  // ── System ──────────────────────────────────────────────────────────────
  shortcuts?: ShortcutContribution[]
  windowBehaviors?: WindowBehaviorContribution[]
  locales?: LocaleContribution
  events?: EventSubscriptionContribution[]
  lifecycle?: LifecycleContribution
  storage?: StorageContribution
  mainHandlers?: MainHandlerContribution
  /** ⏳ Reserved slot — accepts registrations, adapter not yet wired. */
  fileDrop?: FileDropContribution[]
}

// ════════════════════════════════════════════════════════════════════════
// Below: per-slot contribution shapes. These are the locked public-facing
// names referenced by docs and the validator; their internals can extend
// without breaking modules.
// ════════════════════════════════════════════════════════════════════════

/**
 * Drawing tool driven by pointer events. Implements the full `Tool`
 * interface (onPointerDown / Move / Up) plus optional metadata for
 * the toolbar UI and an optional `renderStroke` for tools whose
 * strokes need custom redraw semantics (shapes, erasers, anything
 * beyond a simple polyline).
 */
export interface ToolContribution extends Tool {
  id: string
  label?: string | LocaleMap
  /**
   * SVG markup string for this tool's icon in the control-bar button.
   *
   * The host renders tool icons via `v-html`, so only raw SVG strings are
   * accepted (not Vue components or CSS class names). Recommended size is
   * `width="16" height="16"` with `stroke="currentColor"` so the icon
   * inherits the button's colour automatically.
   *
   * @example
   * icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c3-3 6-6 9-3s6 0 9-3"/></svg>'
   *
   * Note: built-in tools (freehand, line, eraser) use their own Vue button
   * components rather than this field — `icon` is the lightweight path for
   * plugin-contributed tools that do not need a custom button component.
   */
  icon?: string
  /**
   * Custom redraw renderer. When omitted, canvas-engine falls back
   * to a polyline render through `stroke.points` — sufficient for
   * freehand- and line-style tools.
   */
  renderStroke?: (canvasCtx: CanvasRenderingContext2D, stroke: Stroke) => void
}

/** Shape primitive used by the shape tool. */
export interface ShapeContribution {
  id: string
  label?: string | LocaleMap
  /**
   * Vue component or SVG string for the shape icon in control-bar / sub-panel.
   * Host renders via `<component :is="icon">`.
   * Component icons MAY accept an optional `filled?: boolean` prop —
   * the host passes the current fill-toggle state so icons can mirror it
   * (e.g. solid vs outline rendering). Plugin icons that ignore the prop
   * still work; they just won't reflect fill state visually.
   */
  icon?: Component | string
  draw: (...args: unknown[]) => void
}

/**
 * Stroke style writer. Modules declare which keys of the shared
 * stroke style store they write to; collision detection happens at
 * module-validator time.
 */
export interface StrokeStyleContribution {
  /** Keys this module writes (e.g. `['lineWidth']`, `['color']`). */
  provides: string[]
}

/**
 * Undo/redo command handler for the `canvas.history.commands` slot.
 *
 * The host calls `undo` / `redo` with whatever `payload` was stored when the
 * command was pushed onto the history stack. The contributing module decides
 * the payload shape — the host treats it as `unknown` and passes it through
 * without inspection.
 */
export interface HistoryCommandContribution {
  type: string
  undo: (payload: unknown) => void
  redo: (payload: unknown) => void
}

export interface CanvasLayerContribution {
  id: string
  /** Render priority within the layer; higher = drawn later (on top). */
  order?: number
  render: (ctx: CanvasRenderingContext2D) => void
}

export interface HtmlOverlayContribution {
  id: string
  component: Component
}

export interface StrokeTransformerContribution {
  id: string
  /** Receives a stroke, returns a transformed stroke. Slot ⏳ reserved. */
  transform: (stroke: unknown) => unknown
}

export interface SettingsTabContribution {
  id: string
  label: string | LocaleMap
  component: Component
}

export interface SettingsPanelContribution {
  id: string
  label: string | LocaleMap
  component: Component
}

/** Hotspot offset in CSS pixels relative to the cursor image's top-left. */
export interface Hotspot {
  x: number
  y: number
}

/**
 * Vector cursor: inline SVG markup OR a plugin-internal relative path
 * to a `.svg` file. URL-shaped strings, absolute paths, and `..` segments
 * are rejected at contribution-validation time.
 */
export interface SvgCursorSpec {
  svg: string
  hotspot?: Hotspot
  /** CSS keyword fallback for legacy / non-overlay contexts. Defaults to `'crosshair'`. */
  fallback?: string
}

/**
 * Raster cursor: plugin-internal relative path to a `.png` file. Inline
 * form is not supported — PNG payload comes through `openpen-plugin://`.
 */
export interface PngCursorSpec {
  png: string
  hotspot?: Hotspot
  fallback?: string
}

/**
 * Cursor specification. The legacy `string` form must be one of the
 * whitelisted CSS keywords (see `SAFE_CURSOR_KEYWORDS` in cursors.ts);
 * any string containing `url(` / `image-set(` / `-webkit-image-set(` is
 * rejected to keep the asset trust boundary closed.
 */
export type CursorSpec = string | SvgCursorSpec | PngCursorSpec

export interface CursorContribution {
  id: string
  cursor: CursorSpec
}

export interface StatusContribution {
  id: string
  component: Component
}

export interface ModalContribution {
  id: string
  component: Component
}

export interface TrayMenuContribution {
  id: string
  label: string | LocaleMap
  click: () => void
}

export interface ContextMenuContribution {
  id: string
  label: string | LocaleMap
  /** Where the menu may appear; runtime filters by context at open time. */
  context: 'canvas' | 'toolbar' | 'tray'
  click: () => void
}

/**
 * CSS custom property contributions for the `ui.theme.tokens` slot.
 *
 * Keys are CSS custom property names (e.g. `'--my-plugin-accent'`).
 * Values are CSS color or length values (e.g. `'#ff6600'`, `'4px'`).
 * The host merges all contributions into `:root` at startup.
 */
export type ThemeTokenContribution = Record<string, string>

export interface ShortcutContribution {
  id: string
  /** Accelerator string; tinykeys-style or Electron globalShortcut format. */
  keys: string
  /** `'global'` registers OS-wide; `'drawing'` only when overlay is active. */
  scope: 'global' | 'drawing'
  handler: () => void
  /** Human-readable name. Omit to hide this shortcut from the user-visible shortcuts list. */
  label?: string | LocaleMap
  /** Optional secondary description shown below the label in the shortcuts settings panel. */
  sublabel?: string | LocaleMap
  /** When true, the user can rebind this key. The chosen key is persisted under `config.json → customShortcuts`. */
  userCustomizable?: boolean
}

export interface WindowBehaviorContribution {
  id: string
  /** Reserved — concrete behaviour API not yet defined. */
  [key: string]: unknown
}

/** Leaf or branch in a locale dictionary. Leaves must be strings. */
type LocaleDictValue = string | LocaleDict

/**
 * Recursive locale dictionary.
 * Leaves are translated strings; branches are nested sub-dictionaries.
 * Use the `interface` form (not `type`) to allow self-reference without
 * triggering TypeScript's circular-type restrictions.
 */
interface LocaleDict {
  [key: string]: LocaleDictValue
}

/**
 * A locale dictionary keyed by BCP-47 tag (e.g. `'en'`, `'zh-Hant'`).
 *
 * Values are per-locale message dictionaries. Supports both flat and nested
 * layouts — vue-i18n treats `.` in ctx.t(key) as a nested path separator,
 * so keys like `'notif.ready'` must use a nested object dict
 * `{ notif: { ready: '...' } }`, not a flat key `{ 'notif.ready': '...' }`.
 *
 * Non-string leaves are rejected at compile time; use ctx.t() to resolve
 * keys to strings before passing them to runtime APIs.
 */
export type LocaleContribution = Record<string, LocaleDict>

/**
 * Subscription to a named domain event on the `system.events` slot.
 *
 * `event` must match the event name emitted by another module (or the host)
 * via `system.events`. The host routes each emitted event to all registered
 * handlers whose `event` string matches.
 */
export interface EventSubscriptionContribution {
  event: string
  handler: (payload: unknown) => void
}

/**
 * App lifecycle hooks for the `system.lifecycle` slot.
 *
 * Call order: `setup` (from `OpenPenModule.setup`) → `onReady` (host fully
 * booted) → `onSuspend` (overlay hidden) → `onQuit` (app shutting down).
 * All hooks may return a Promise; the host awaits each before advancing.
 */
export interface LifecycleContribution {
  onReady?: () => void | Promise<void>
  onSuspend?: () => void | Promise<void>
  onQuit?: () => void | Promise<void>
}

/**
 * Marker that this module wants an isolated storage area at
 * `~/.openpen/plugins/<id>/data/`. Capacity / quota policy is defined
 * by the host runtime.
 */
export interface StorageContribution {
  /** If true, the host pre-creates the data directory at module load. */
  preCreate?: boolean
}

/**
 * Map of action name to async handler. Routed from the renderer via
 * `window.openPenApi.moduleCall(moduleId, action, payload)`.
 */
export type MainHandlerContribution = Record<
  string,
  (payload: unknown) => unknown | Promise<unknown>
>

export interface FileDropContribution {
  /** MIME types this handler accepts (e.g. `['image/png']`). */
  accept: string[]
  handle: (files: File[]) => void | Promise<void>
}
