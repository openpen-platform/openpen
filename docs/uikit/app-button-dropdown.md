---
title: AppButtonDropdown
description: Split-mode control-bar button — pairs an AppButton primary action with a caret button that toggles a popover.
---

# `AppButtonDropdown`

A composite control-bar button that pairs an `AppButton` (main action) with a
narrow caret button. The main button fires its own click event; the caret
button toggles an `AppPopover` whose content you provide via slot. Modelled
after [Quasar `QBtnDropdown` split mode](https://quasar.dev/vue-components/button-dropdown)
and the shadcn Button + DropdownMenu composition.

Use this when a single button has both:

- a **primary action** users invoke directly (activate a tool, run a command)
- a **secondary surface** of options (mode picker, sub-panel, related shortcuts)

If you only need a button, use [`AppButton`](./app-button) — it is what
`AppButtonDropdown` wraps internally. If you only need a popover trigger, use
[`AppPopover`](./app-popover) on its own.

The caret chevron rotates automatically to point toward the opening popover:
downward when closed, upward in horizontal bars when open, leftward / rightward
in vertical bars (away from the snapped edge). The component reads
`SNAP_EDGE_KEY` and `IS_VERTICAL_KEY` from the host — plugin authors do not
need to configure rotation manually.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `popoverId` | `string` | — (required) | Globally unique id passed to the inner `AppPopover`; identifies this dropdown for the modal manager |
| `popoverPlacement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | Preferred popover side; auto picks based on the host's `POPOVER_PLACEMENT_HINT_KEY` |
| `active` | `boolean` | `false` | Highlights the main button with the accent colour (use for active-tool state) |
| `disabled` | `boolean` | `false` | Disables both main and caret buttons; tooltip remains hoverable |
| `variant` | `'default' \| 'danger'` | `'default'` | Main button visual intent |
| `mainTooltip` | `string` | — | Tooltip shown above the main button on hover |
| `mainAriaLabel` | `string` | — | Accessible name for the main button |
| `caretAriaLabel` | `string` | — | Accessible name for the caret button (required for screen-reader users) |
| `mainTestid` | `string` | — | `data-testid` forwarded to the main button |
| `caretTestid` | `string` | — | `data-testid` forwarded to the caret button |

## Slots

| Slot | Description |
|---|---|
| `main-content` | Content rendered inside the main button (icon SVG, swatch, etc.) |
| `popover-content` | Content rendered inside the popover when open (menu, sub-panel, options list) |

## Events

| Event | Payload | Description |
|---|---|---|
| `mainClick` | — | Main button click; suppressed when `disabled` is `true` |
| `caretClick` | — | Caret button click (the popover open/close toggle is handled internally by `AppPopover`); use this hook for side-effects like activating a tool when the caret is clicked while the tool is inactive |

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { AppButtonDropdown } from '@openpen/module-api/uikit'

const isActive = ref(false)

function activate() {
  isActive.value = true
  // ...run primary action
}

function activateIfNeeded() {
  if (!isActive.value) isActive.value = true
}
</script>

<template>
  <AppButtonDropdown
    popover-id="shape"
    :active="isActive"
    main-tooltip="Shape tool"
    main-aria-label="Shape tool"
    caret-aria-label="Shape options"
    @main-click="activate"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </template>
    <template #popover-content>
      <div class="my-shape-picker">
        <!-- your option list / sub-panel goes here -->
      </div>
    </template>
  </AppButtonDropdown>
</template>
```

## Layout notes

The wrap is a flex row in horizontal control bars and a flex column in
vertical control bars; the caret stays attached to the right (or below) the
main button in both orientations. The structural classes
`app-btn-dropdown-wrap`, `app-btn-dropdown-caret`, and
`app-btn-dropdown-caret-icon` are exposed unscoped so the host (or your
plugin's own theme) can apply contextual sizing — for example, the OpenPen
host shrinks the caret to 30 px tall when an `AppButtonDropdown` sits inside
an inset control-bar group.

When the popover is open the caret button receives an `.active` class for
the accent highlight; when the host triggers a control-bar animation the
inner `AppPopover` closes automatically (no manual coordination required).
