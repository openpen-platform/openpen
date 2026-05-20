/**
 * OpenPen Contribution Slot catalogue.
 *
 * Slots are the only places where modules can affect the host app.
 * Adding a slot is an architectural change — it usually requires a
 * new adapter on the OpenPen side and a minor version bump of this
 * package. Removing a slot is a breaking change.
 *
 * `status: 'v1'` slots are wired through to runtime adapters.
 * `status: 'reserved'` slots accept registrations and pass validation;
 * no runtime adapter is active yet so contributions are stored but
 * inert. Forward-compatible: modules can ship against reserved slots
 * without any plugin-side changes once an adapter lands.
 */

export type SlotCategory = 'canvas' | 'ui' | 'system'
export type SlotStatus = 'v1' | 'reserved'

export interface SlotDefinition {
  /** Dotted slot id, e.g. `'canvas.tools'`. */
  id: string
  /** Implementation status — see file header. */
  status: SlotStatus
  /** High-level grouping for documentation and UI. */
  category: SlotCategory
  /** One-sentence purpose, shown in `docs/slots/index.md`. */
  description: string
}

/**
 * v1 active slots (16). Wired through to runtime adapters.
 */
export const V1_ACTIVE_SLOTS: readonly SlotDefinition[] = [
  // Canvas
  { id: 'canvas.tools', status: 'v1', category: 'canvas', description: 'Drawing tools driven by pointer events.' },
  { id: 'canvas.shapes', status: 'v1', category: 'canvas', description: 'Shape primitives consumed by the shape tool.' },
  { id: 'canvas.stroke.style', status: 'v1', category: 'canvas', description: 'Writers into the shared stroke style store.' },
  { id: 'canvas.layers.background', status: 'v1', category: 'canvas', description: 'Render below strokes (grids, watermarks).' },
  { id: 'canvas.layers.overlay', status: 'v1', category: 'canvas', description: 'Render above strokes (rulers, guides).' },
  { id: 'canvas.html.overlay', status: 'v1', category: 'canvas', description: 'Mount HTML elements above the canvas (text, stickers).' },
  // UI
  { id: 'ui.control-bar', status: 'v1', category: 'ui', description: 'Control bar item slot (groups and ordering managed by layout config).' },
  { id: 'ui.settings.tabs', status: 'v1', category: 'ui', description: 'Tabs in the settings window.' },
  { id: 'ui.settings.panels', status: 'v1', category: 'ui', description: 'Sections inside the Features settings tab, grouped by module.' },
  { id: 'ui.cursors', status: 'v1', category: 'ui', description: 'Drawing-mode cursor styles.' },
  { id: 'ui.status', status: 'v1', category: 'ui', description: 'Ephemeral status badges on the control bar.' },
  { id: 'ui.modals', status: 'v1', category: 'ui', description: 'Registered modals managed by the global modal stack.' },
  // System
  { id: 'system.shortcuts', status: 'v1', category: 'system', description: 'Global and drawing-mode keyboard shortcuts.' },
  { id: 'system.locales', status: 'v1', category: 'system', description: 'i18n dictionary contributions.' },
  { id: 'system.main.handlers', status: 'v1', category: 'system', description: 'Node-side IPC handlers for main process capabilities.' },
  { id: 'system.events', status: 'v1', category: 'system', description: 'Subscribers and emitters on the domain event bus.' },
  { id: 'system.lifecycle', status: 'v1', category: 'system', description: 'App lifecycle hooks (onReady / onSuspend / onQuit).' },
] as const

/**
 * v1 reserved slots. Registrations pass validation but no runtime
 * adapter is active yet.
 */
export const V1_RESERVED_SLOTS: readonly SlotDefinition[] = [
  { id: 'canvas.history.commands', status: 'reserved', category: 'canvas', description: 'Undo/redo history commands. Adapter not yet active; built-in command types are used internally.' },
  { id: 'canvas.stroke.transformers', status: 'reserved', category: 'canvas', description: 'Post-process strokes after creation (smooth, simplify).' },
  { id: 'ui.tray.menu', status: 'reserved', category: 'ui', description: 'System tray menu items. Adapter not yet active.' },
  { id: 'ui.context.menu', status: 'reserved', category: 'ui', description: 'Right-click context menu items on canvas / control bar.' },
  { id: 'ui.theme.tokens', status: 'reserved', category: 'ui', description: 'CSS custom property contributions (colour swatches, spacing tokens).' },
  { id: 'system.window.behaviors', status: 'reserved', category: 'system', description: 'Window behavior customizations. Adapter not yet active.' },
  { id: 'system.storage', status: 'reserved', category: 'system', description: 'Per-plugin isolated storage at ~/.openpen/plugins/<id>/data/. Adapter not yet active; first real consumer will drive the storage backend design.' },
  { id: 'system.file.drop', status: 'reserved', category: 'system', description: 'Handlers for files dropped onto the canvas.' },
] as const

/**
 * All slots (active + reserved). Source of truth for validation.
 */
export const ALL_SLOTS: readonly SlotDefinition[] = [
  ...V1_ACTIVE_SLOTS,
  ...V1_RESERVED_SLOTS,
]

const SLOT_BY_ID = new Map<string, SlotDefinition>(
  ALL_SLOTS.map((s) => [s.id, s])
)

/** Returns `true` when `id` matches a slot in {@link ALL_SLOTS} (active or reserved). */
export function isKnownSlot(id: string): boolean {
  return SLOT_BY_ID.has(id)
}

/**
 * Returns the {@link SlotDefinition} for a known slot id, or `undefined` if
 * the id is not registered in {@link ALL_SLOTS}.
 */
export function getSlot(id: string): SlotDefinition | undefined {
  return SLOT_BY_ID.get(id)
}

/**
 * Mapping from `contributes` field name (camelCase) to slot id (dotted).
 *
 * Modules express contributions via the ergonomic camelCase keys on
 * `contributes` (e.g. `historyCommands`); the validator maps them
 * back to slot ids (`canvas.history.commands`) before checking against
 * `ALL_SLOTS`.
 *
 * Adding a new field here is part of adding a new slot.
 */
export const CONTRIBUTION_KEY_TO_SLOT_ID: Record<string, string> = {
  // Canvas
  tools: 'canvas.tools',
  shapes: 'canvas.shapes',
  strokeStyle: 'canvas.stroke.style',
  historyCommands: 'canvas.history.commands',
  backgroundLayers: 'canvas.layers.background',
  overlayLayers: 'canvas.layers.overlay',
  htmlOverlays: 'canvas.html.overlay',
  strokeTransformers: 'canvas.stroke.transformers',
  // UI
  controlBar: 'ui.control-bar',
  settingsTabs: 'ui.settings.tabs',
  settingsPanels: 'ui.settings.panels',
  cursors: 'ui.cursors',
  status: 'ui.status',
  modals: 'ui.modals',
  trayMenu: 'ui.tray.menu',
  contextMenu: 'ui.context.menu',
  themeTokens: 'ui.theme.tokens',
  // System
  shortcuts: 'system.shortcuts',
  windowBehaviors: 'system.window.behaviors',
  locales: 'system.locales',
  events: 'system.events',
  lifecycle: 'system.lifecycle',
  storage: 'system.storage',
  mainHandlers: 'system.main.handlers',
  fileDrop: 'system.file.drop',
}
