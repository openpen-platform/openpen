# Icon sources

Every inline SVG icon in the host app (`src/`), the UI kit
(`packages/module-api/src/uikit/`), the plugin starter template
(`packages/plugin-starter/`) and the demo plugin (`examples/`) is listed below
with its origin. The license texts for Lucide and Feather are in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

When you add an icon, add a row here. Take icons from Lucide or Feather where
possible; an icon you draw yourself is marked "Original".

## How the origin was determined

Each inline `<svg>` was compared against the official icon files of Lucide
(`lucide-static` 1.72.0 plus 13 older releases from 0.30.0 to 1.13.0, because
earlier path data differs) and Feather (`feather-icons` 4.29.2). Path data,
lines, polygons and basic shapes were normalised (absolute coordinates,
two-decimal rounding, one subpath per entry) and compared element by element.

- **Exact**: all subpaths and shapes equal an official icon.
- **Same geometry**: equal after merging `line` elements into one `path`, or
  reversing a path direction.
- **Adapted**: recognisably derived from the named icon, with a changed value.
- **Original**: no official icon matches.

Where an icon exists in both sets with the same geometry, both are named.

## Lucide and Feather

| Icon | Origin | Match | Used in |
| --- | --- | --- | --- |
| Settings gear | Lucide `settings` (0.104.0 path data) | Exact | `src/components/ControlBar.vue` |
| Undo | Lucide `undo` | Exact | `src/components/ControlBar.vue` |
| Redo | Lucide `redo` | Exact | `src/components/ControlBar.vue` |
| Trash | Feather `trash-2` / Lucide `trash-2` | Same geometry | `src/components/ControlBar.vue`, `src/components/settings/plugins/PluginRemoveConfirmDialog.vue` |
| Warning triangle | Feather `alert-triangle` / Lucide `alert-triangle` | Exact | `src/components/ControlBar.vue`, `src/components/settings/plugins/PluginActionConfirmDialog.vue`, `src/views/OverlayView.vue`, `packages/module-api/src/uikit/components/AppBanner.vue` |
| Log out | Feather `log-out` / Lucide `log-out` | Exact | `src/components/ControlBar.vue` |
| Sun | Feather `sun` / Lucide `sun` | Same geometry | `src/components/settings/AppearanceTab.vue` |
| Moon | Feather `moon` / Lucide `moon` | Exact | `src/components/settings/AppearanceTab.vue` |
| Monitor | Feather `monitor` / Lucide `monitor` | Same geometry | `src/components/settings/AppearanceTab.vue` |
| Search | Feather `search` / Lucide `search` | Same geometry | `src/components/settings/ModulesTab.vue` |
| Plus | Feather `plus` / Lucide `plus` | Same geometry | `src/components/settings/ModulesTab.vue` |
| Close (x) | Feather `x` / Lucide `x` | Same geometry | `src/components/settings/plugins/PluginAddCustomDialog.vue`, `PluginDetailDialog.vue`, `PluginUpgradeConfirmDialog.vue`, `src/views/SettingsView.vue` |
| Camera | Lucide `camera` (0.104.0 path data) | Exact | `src/core/modules/screen-capture/CaptureButton.vue` |
| Download | Lucide `download` (0.104.0 path data) | Exact | `src/core/modules/screen-capture/CaptureButton.vue` |
| Copy | Lucide `copy` (0.104.0 path data) | Exact | `src/core/modules/screen-capture/CaptureButton.vue` |
| Upload | Feather `upload` / Lucide `upload` | Same geometry | `src/components/settings/plugins/PluginAddCustomDialog.vue` |
| Update (rotate) | Lucide `rotate-cw` | Adapted (arrow head identical, arc simplified) | `src/components/settings/plugins/PluginCard.vue`, `PluginDetailDialog.vue`, `PluginUpgradeConfirmDialog.vue` |
| Check | Feather `check` / Lucide `check` | Exact | `src/components/settings/plugins/PluginInstallProgressDialog.vue` |
| Error circle | Feather `alert-circle` / Lucide `alert-circle` | Adapted (radius 9 instead of 10) | `src/components/settings/plugins/PluginsBrowsePanel.vue` |
| Error circle | Feather `alert-circle` / Lucide `alert-circle` | Exact | `packages/module-api/src/uikit/components/AppBanner.vue` |
| Success circle | Feather `check-circle` / Lucide `check-circle` | Exact | `packages/module-api/src/uikit/components/AppBanner.vue` |
| Danger circle | Feather `x-circle` / Lucide `circle-x` | Exact | `packages/module-api/src/uikit/components/AppBanner.vue` |
| Brush eraser | Lucide `eraser` | Exact | `src/core/modules/eraser/EraserToolButton.vue` |
| Highlighter | Lucide `highlighter` | Exact | `src/core/modules/highlighter/HighlighterToolButton.vue` |
| Menu lines | Lucide `align-justify` / Feather `menu` | Same geometry | `src/core/modules/stroke-width/StrokeWidthSlider.vue` |
| Pen | Lucide `pen` | Exact | `src/views/OverlayView.vue` |
| Pause | Feather `pause` / Lucide `pause` | Exact | `src/views/OverlayView.vue` |
| Chevron left | Feather `chevron-left` / Lucide `chevron-left` | Exact | `src/views/SettingsView.vue` |
| Chevron right | Feather `chevron-right` / Lucide `chevron-right` | Exact | `src/views/SettingsView.vue` |
| Chevron down | Feather `chevron-down` / Lucide `chevron-down` | Exact | `packages/module-api/src/uikit/components/AppButtonDropdown.vue` |
| Ellipse shape | Lucide `ellipse` | Exact | `src/core/modules/shape/icons/EllipseIcon.vue` |

## Original

No official icon matches these.

| Icon | Used in |
| --- | --- |
| Float-ball layers | `src/components/ControlBar.vue` |
| Drag-handle dot grid (horizontal and vertical) | `src/components/ControlBar.vue` |
| Pin | `src/components/ControlBar.vue` |
| Hotkey conflict warning triangle | `src/components/settings/HotkeyInput.vue` |
| Stroke-eraser target | `src/core/modules/eraser/EraserToolButton.vue` |
| Freehand wave | `src/core/modules/freehand/FreehandToolButton.vue`, `packages/module-api/src/types/contributions.ts` |
| Line tool (segment with end dots) | `src/core/modules/line/LineToolButton.vue` |
| Shape icons: circle, diamond, parallelogram, rectangle, rounded rectangle, square, star, triangle, inverted triangle | `src/core/modules/shape/icons/` |
| Dialog close cross, select chevron and select check mark | `packages/module-api/src/uikit/components/AppDialog.vue`, `AppSelect.vue` |
| Number spinner minus and plus | `packages/plugin-starter/src/MyNumberSpinner.vue` |
| Starter template icons (target, rings) | `packages/plugin-starter/src/index.ts` |
| Install-progress status circles | `src/components/settings/plugins/PluginInstallProgressDialog.vue` |
| Highlighter (demo plugin) | `examples/openpen-demo-plugin/src/HighlighterButton.vue` |
| Cursor artwork (crosshair, eraser, stroke eraser, freehand, line, shape cursors) | `src/composables/useCustomCursor.ts`, `src/core/modules/*/cursor.ts` |
| Application favicon | `public/favicon.svg` |
