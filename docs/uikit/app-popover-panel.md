---
title: AppPopoverPanel
description: Inner layout for AppPopover content - vertical spacing, optional title, and form rows with the same spacing as the host's own popup panels.
---

# `AppPopoverPanel` and `AppPopoverRow`

Layout helpers for the `content` slot of [`AppPopover`](./app-popover). `AppPopover` draws the frame
(background, border, radius, padding, shadow) and follows the light/dark theme and accent color
automatically; these two components lay out what goes inside, so a plugin does not need its own panel CSS.

> Requires `@openpen/module-api` 1.4.0 or later. Older hosts do not provide these two components.

## `AppPopoverPanel`

Vertical stack with 10px spacing between children, plus an optional title.

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | - | Heading shown above the content, rendered in uppercase with letter spacing |

| Slot | Description |
|---|---|
| default | Panel content, usually one or more `AppPopoverRow` |

## `AppPopoverRow`

One form row: an optional label followed by a control, vertically centered with a 10px gap.
An [`AppSegmented`](./app-segmented) placed in a row takes the remaining width.

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | - | Label shown before the control |

| Slot | Description |
|---|---|
| default | The control: `AppToggle`, `AppSlider`, `AppSegmented`, ... |

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
