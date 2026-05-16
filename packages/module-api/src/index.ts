/**
 * @openpen/module-api — public contract surface for OpenPen modules.
 *
 * This is the **only** import path that built-in modules and plugins
 * are allowed to use, alongside relative imports, `node:*`, and
 * third-party npm packages. Boundary tests in the OpenPen main repo
 * enforce this rule on `src/core/modules/**` and on plugin code.
 */

// Core helpers
export { defineModule } from './define-module'
export { useModuleContext } from './use-module-context'
export { isValidModuleId, MODULE_ID_RE } from './validation'
export { resolveLabel, sanitizeIdForI18n } from './locale'
export type { LocaleMap } from './locale'

// Slot catalogue
export {
  ALL_SLOTS,
  V1_ACTIVE_SLOTS,
  V1_RESERVED_SLOTS,
  CONTRIBUTION_KEY_TO_SLOT_ID,
  isKnownSlot,
  getSlot,
} from './slots'
export type { SlotDefinition, SlotCategory, SlotStatus } from './slots'

// Tool primitives (Point, Stroke, StrokeStyle, Tool, …)
export type {
  Point,
  StrokeColor,
  StrokeStyle,
  Stroke,
  PointerModifiers,
  Tool,
} from './types/tool'

// Control bar layout types + helpers
export type { ControlBarLayout, LayoutGroup, GroupInset, ControlBarContribution } from './types/control-bar-layout'
export {
  ControlBarLayoutSchema,
  LayoutGroupSchema,
  GroupInsetSchema,
  DEFAULT_CONTROL_BAR_LAYOUT,
  repairLayoutL3a,
  repairLayoutL3b,
} from './types/control-bar-layout'

// Notification types
export type { NotifyPayload, NotifyHandle } from './types/notification'

// Module + Contribution types
export type { OpenPenModule, ModuleSetupContext } from './types/module'
export type {
  ModuleContributions,
  ToolContribution,
  ShapeContribution,
  StrokeStyleContribution,
  HistoryCommandContribution,
  CanvasLayerContribution,
  HtmlOverlayContribution,
  StrokeTransformerContribution,
  SettingsTabContribution,
  SettingsPanelContribution,
  CursorContribution,
  CursorSpec,
  SvgCursorSpec,
  PngCursorSpec,
  Hotspot,
  StatusContribution,
  ModalContribution,
  TrayMenuContribution,
  ContextMenuContribution,
  ThemeTokenContribution,
  ShortcutContribution,
  WindowBehaviorContribution,
  LocaleContribution,
  EventSubscriptionContribution,
  LifecycleContribution,
  StorageContribution,
  MainHandlerContribution,
  FileDropContribution,
} from './types/contributions'

// Host ↔ module inject keys (Vue provide/inject bridge)
export {
  STROKE_STYLE_CONTEXT_KEY,
  SNAP_EDGE_KEY,
  IS_VERTICAL_KEY,
  MODAL_MANAGER_KEY,
  WRAPPER_EL_KEY,
  ANCHOR_EL_KEY,
  CONTROL_BAR_ANIMATING_KEY,
  HOST_DIALOG_OPEN_COUNT_KEY,
  POPOVER_PLACEMENT_HINT_KEY,
  ACTIVE_TOOL_KEY,
} from './inject-keys'
export type { StrokeStyleContext, SnapEdge, ModalManager, PopoverPlacementHint } from './inject-keys'

// Cursor compilation + sanitisation (used by host runtime; helpers
// re-exported so plugins can validate cursor specs in their own tests).
export {
  compileCursor,
  sanitizeSvgMarkup,
  sanitizeCursorContributions,
  isSafeRelativePath,
  pluginHostname,
  pluginAssetUrl,
  SAFE_CURSOR_KEYWORDS,
} from './cursors'
export type {
  CompiledCursor,
  CursorResolutionContext,
  CursorSanitizeRule,
  CursorSanitizeDiagnostic,
  CursorSanitizeOptions,
  CursorSanitizeResult,
} from './cursors'

// Re-export zod so modules don't need a separate import path.
export { z } from 'zod'

// Host-internal registry writers — re-exported here so the host's module
// loader pulls them through the SAME externalised entry point
// (`@openpen/module-api`, runtime bundle: openpen-runtime/module-api.js)
// that `useModuleContext` reads from. Importing them via
// `@openpen/module-api/host` instead would inline a duplicate
// module-context-registry into the host bundle, breaking state-sharing
// between writers and readers in production builds (see
// project_dev_prod_parity.md). Plugin authors MUST NOT use these.
export { setModuleContext, clearModuleContext } from './host/module-context-registry'
