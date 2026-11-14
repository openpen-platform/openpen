---
title: AppPopoverPanel
description: Inner layout for AppPopover content - vertical spacing, optional title, and form rows with the same spacing as the host's own popup panels.
---

# `AppPopoverPanel` and `AppPopoverRow`

Layout helpers for the `content` slot of [`AppPopover`](./app-popover). `AppPopover` draws the frame
(background, border, radius, padding, shadow) and follows the light/dark theme and accent color
automatically; these two components lay out what goes inside, so a plugin does not need its own panel CSS.

> Requires `@openpen/module-api` 1.4.0 or later. Older hosts do not provide these two components.
>
> The shared-column alignment described below was added after the two components first shipped. A host
> from before that change still provides both components, but lays each row out on its own: label, control and value text sit in one
> line per row and do not line up across rows. Nothing fails and a plugin cannot detect this at run time.

## `AppPopoverPanel`

Vertical stack with 10px spacing between children, plus an optional title. Every `AppPopoverRow` in
the panel shares three columns - label, control and value - so the controls start at the same
position in every row and the value text lines up, without any CSS in the plugin. The label column is
as wide as the longest label in the panel (so translated labels need no width tuning), the control
column takes the remaining width (at least 140px), and the value column is optional: it takes no
width when no row uses it.

The columns use CSS `subgrid` (Chromium 117 and later). The host's Electron includes it, so a plugin
needs nothing extra. In a browser without `subgrid` the three parts of a row stack on top of each other.

**Rows must be direct children of the panel.** The columns belong to the panel, and a row only joins
them when it is the panel's own child. Do not wrap a row in a `<div>` or in a component whose root
is a wrapper: the wrapped row leaves the shared columns, and its label, control and value text
collapse into one narrow column and stack. A `<template v-for>` or `<template v-if>` around rows is
fine because it adds no element.

Anything else placed directly in the panel (a hint text, a divider) is laid out in the label column
and can widen it. Put such content in a label-less `AppPopoverRow` instead; that row spans all columns.

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | - | Heading shown above the content, rendered in uppercase with letter spacing |

| Slot | Description |
|---|---|
| default | Panel content, usually one or more `AppPopoverRow` |

## `AppPopoverRow`

One form row: an optional label, a control, and an optional value text, vertically centered with a
10px gap. The row joins the panel's shared columns, so put the parts directly in the row in that
order. A row without a `label` (a button group, a segmented control) spans all columns instead.
An [`AppSegmented`](./app-segmented) placed in a row takes the remaining width.

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | - | Label shown before the control |

| Slot | Description |
|---|---|
| default | The control (`AppToggle`, `AppSlider`, `AppSegmented`, ...), optionally followed by one element with the value text (for example `<span>150px</span>`). The value element must be the third child of the row (label, control, value); it is right-aligned with tabular digits. Do not set a `width` on a slider; it fills the control column. |

**A slider's value is not a value text.** In a plugin panel, show a slider's number with the
`value-label` prop of [`AppSlider`](./app-slider): a small bubble above the thumb appears while the
slider is dragged, so the panel stays calm and the slider gets the full control column. Do not put a
static number next to a slider. Use the third element only for text that is not a slider value.

The optional value text is found by position, so keep to three parts per row:

- A fourth element wraps onto an extra line inside the row; the value stays third and right-aligned.
  A control component that renders more than one root element takes more than one position, which
  pushes the value out of the third position: the value then wraps onto an extra line and is not
  right-aligned.
- A row without a `label` is a plain flex row; a third element there gets no column alignment.
- With a `label` but no value text the row is fine; the value column just stays empty.

## Minimal example

```vue
<script setup lang="ts">
import {
  AppPopover, AppPopoverPanel, AppPopoverRow, AppToggle, AppSegmented,
} from '@openpen/module-api/uikit'
import { ref } from 'vue'

const filled = ref(false)
const style = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppPopover popover-id="my-panel">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Style</button>
    </template>
    <template #content>
      <AppPopoverPanel title="Style">
        <AppPopoverRow label="Fill">
          <AppToggle v-model="filled" ariaLabel="Fill" />
        </AppPopoverRow>
        <AppPopoverRow>
          <AppSegmented v-model="style" :options="options" />
        </AppPopoverRow>
      </AppPopoverPanel>
    </template>
  </AppPopover>
</template>
```

## Aligned slider rows

Rows with a slider line up across the panel, and each slider shows its number in a bubble while it is
dragged. Pass no widths and no styles:

```vue
<AppPopoverPanel title="Spotlight">
  <AppPopoverRow label="Radius">
    <AppSlider v-model="radius" :min="40" :max="400" :value-label="`${radius}px`" ariaLabel="Radius" />
  </AppPopoverRow>
  <AppPopoverRow label="Dim level">
    <AppSlider v-model="dim" :min="0" :max="100" :value-label="`${dim}%`" ariaLabel="Dim level" />
  </AppPopoverRow>
</AppPopoverPanel>
```

Both sliders start at the same position and end at the same position, whatever the label lengths.
