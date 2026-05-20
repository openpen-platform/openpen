# Control Bar Layout

The control bar layout is stored as a JSON structure in your OpenPen settings file.
Editing it lets you reorganise the order of items, group them visually, and control
separators — without touching any plugin code.

---

## Settings file location

OpenPen reads and writes layout state from `config.json` in the Electron userData
directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/OpenPen/config.json` |
| Windows | `%APPDATA%\OpenPen\config.json` |
| Linux | `~/.config/OpenPen/config.json` |

The layout is stored under the `controlBarLayout` key alongside other user settings.

> **Before editing**: quit OpenPen first. The app holds the file in memory and
> overwrites it on quit, so changes made while the app is running will be lost.

---

## Schema

```json
{
  "controlBarLayout": {
    "version": 1,
    "groups": [
      {
        "id": "tools",
        "items": ["freehand", "line", "shape"],
        "separator": "always",
        "inset": { "enabled": true }
      },
      {
        "id": "default",
        "items": ["color-picker", "stroke-width"],
        "separator": "auto"
      }
    ]
  }
}
```

### `version`

Always `1`. Reserved for future migrations.

### `groups`

Ordered array of `LayoutGroup` objects. The control bar renders groups left-to-right
in the order they appear here.

**Constraints** (any violation resets the layout to the built-in default on next launch):
- Must contain exactly one group with `id: "default"`.
- Group `id` values must be unique.
- An item id must not appear in more than one group.

---

## `LayoutGroup` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (kebab-case) | **yes** | Unique group identifier. `"default"` is reserved for ungrouped items. |
| `items` | `string[]` | **yes** | Ordered list of contribution ids for items in this group. |
| `separator` | `'auto' \| 'always' \| 'never'` | no | Visual divider before this group (default: `'auto'`). |
| `inset` | `GroupInset` | no | When present and `enabled: true`, renders the group with a visible background + border container. |

### `separator` values

| Value | Behaviour |
|---|---|
| `'auto'` | A separator is rendered before this group (default). Future versions will omit the separator when adjacent groups share the same module origin. |
| `'always'` | A separator is always drawn before this group. |
| `'never'` | No separator before this group. |

### `GroupInset` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `enabled` | `boolean` | **yes** | Set to `true` to enable the visual container. |
| `color` | `string` | no | CSS color override for the inset background. Defaults to `--openpen-color-control-group`. |

When `inset.enabled` is `true`, the group renders with a rounded container that
visually binds its items together (the "grouped tools" look). The container height
matches an unwrapped 36 px button — enabling inset does not change the bar height.

---

## How items get their ids

Each item's id comes from the `id` field in the module's `ControlBarContribution`:

```ts
// packages/module-api/src/types/control-bar-layout.ts
interface ControlBarContribution {
  id: string       // globally unique across all modules — use "pluginId-itemName"
  component: Component
  defaultGroup?: string
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    label?: string | LocaleMap
  }
}
```

Plugin authors declare a `defaultGroup` and `groupHint` as hints for first install.
**Once the user's layout is saved, it always takes precedence** — hints only apply
when an item has no saved placement yet.

---

## Reconciliation (what happens when a new plugin is installed)

When OpenPen loads and finds a plugin item that is not in any saved layout group:

1. The item is assigned to its `defaultGroup` (from `ControlBarContribution.defaultGroup`).
2. If that group does not yet exist in the saved layout, the host creates it
   automatically — using the item's `groupHint` for its separator and label.
3. If no `defaultGroup` is declared, the item is appended to `"default"`.

Items already present in the saved layout are not moved. This means installing a
new plugin never disrupts the arrangement of existing items.

---

## Validation and corruption recovery

OpenPen applies three layers of validation on startup:

| Layer | What it checks | On failure |
|---|---|---|
| **L1** — JSON parse | File is valid JSON | Resets all user settings to defaults |
| **L2** — Schema | `controlBarLayout` matches the expected shape | Resets layout to the built-in default only; other settings are preserved |
| **L3a** — Repair | Missing `'default'` group; invalid `separator` value | Repairs in place without data loss; logs a `console.info` message |

The L2 reset only affects the layout — your theme, language, and shortcuts are untouched.

---

## See also

- [Contribution Slot Catalog](../slots/ui#ui-control-bar) — `ui.control-bar` slot and `ControlBarContribution` type
- [Module Architecture](../concepts/module-architecture.md) — how built-in and plugin modules declare contributions
