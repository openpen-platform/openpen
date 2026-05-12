/**
 * @openpen/module-api/host — Popup Anchor
 *
 * Re-exports the usePopupAnchor composable and its pure helper
 * calculatePopupAnchor for module components that need anchor-relative
 * popup positioning.
 *
 * Exposed here so module code can import without cross-layer relative paths.
 */

export {
  usePopupAnchor,
  calculatePopupAnchor,
} from '../../../../src/composables/usePopupAnchor'
