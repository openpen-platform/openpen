/**
 * @openpen/module-api/uikit — Three-layer API surface
 *
 * Layer 1 — High-level Wrappers (80% case)
 *   OpenPen-opinionated components with preset styles + auto-injected host
 *   context. Plugin authors should start here: no knowledge of inject keys
 *   or Reka UI primitives required.
 *
 * Layer 2 — Primitive Re-exports (20% advanced)
 *   Raw Reka UI headless components. Use when you need full control over
 *   markup / styling but still want a11y / focus / keyboard nav behaviour.
 *   Note: you must manually handle modal-manager, animating guard,
 *   passthrough, and teleport target when walking this layer.
 *
 * Layer 3 — Escape Hatch (5% fully custom)
 *   Plugin installs reka-ui (or any library) directly in its own package.json.
 *   UIKit MUST NOT block this. Not handled here — plugin author's choice.
 *
 * See docs/uikit/index.md for the full trade-off description.
 */

// ── Layer 1: High-level Wrappers ──────────────────────────────────────────────

export { default as AppPopover } from './components/AppPopover.vue'
export type { AppPopoverProps, Placement } from './components/AppPopover.vue'

export { default as AppSlider } from './components/AppSlider.vue'
export { default as AppToggle } from './components/AppToggle.vue'
export { default as AppSegmented } from './components/AppSegmented.vue'

export { default as AppDialog } from './components/AppDialog.vue'
export type { AppDialogProps } from './components/AppDialog.vue'

export { useDialog } from './composables/useDialog'
export type {
  DialogConfirmOptions,
  DialogAlertOptions,
  DialogPromptOptions,
  DialogCustomOptions,
} from './composables/useDialog'
export { useDialogPluginComponent } from './composables/useDialogPluginComponent'

// Host-internal: shared by DialogHost so it sees the same _activeRequest ref
// instance as useDialog() callers. MUST be exported via this barrel — the
// uikit runtime bundle (dist/openpen-runtime/module-api-uikit.js) is the
// single shared module instance referenced by the importmap; a relative
// '../composables/useDialog' import in DialogHost would bundle a second
// duplicate ref into the host bundle (see project_dev_prod_parity.md), so
// dialog.confirm() would never reach DialogHost in production.
// Underscore-prefixed: NOT part of the plugin-facing API surface.
export { _activeRequest, _resolveActive } from './composables/useDialog'
export { default as AppSelect } from './components/AppSelect.vue'
export type { AppSelectProps, SelectOption } from './components/AppSelect.vue'
export { default as AppTooltip } from './components/AppTooltip.vue'
export type { AppTooltipProps, TooltipSide } from './components/AppTooltip.vue'
export { default as AppTabs } from './components/AppTabs.vue'
export type { AppTabsProps, AppTabItem } from './components/AppTabs.vue'

export { default as AppBanner } from './components/AppBanner.vue'
export type { BannerVariant } from './components/AppBanner.vue'

export { default as AppButton } from './components/AppButton.vue'

// ── Layer 2: Primitive Re-exports ────────────────────────────────────────────
//
// Re-export entire primitives namespace.
// MUST NOT re-export any reka-ui type through this index — wrapper types only.
// (primitives.ts is the designated channel for the raw headless exports.)
export * from './primitives'

// ── Host context inject keys ──────────────────────────────────────────────────
//
// Keys are defined in @openpen/module-api root inject-keys.ts and re-exported
// here for convenience. Plugin authors who need to walk Layer 2 should import
// from the root package:
//   import { WRAPPER_EL_KEY, MODAL_MANAGER_KEY } from '@openpen/module-api'
//
// Root index.ts already covers:
//   WRAPPER_EL_KEY, SNAP_EDGE_KEY, MODAL_MANAGER_KEY, ANCHOR_EL_KEY.
