---
title: AppSegmented
description: Single-select segmented control (radio group) for mutually-exclusive options, drawn as one grey track with a raised selected segment; options can be text, an icon with text, or an icon only.
---

# `AppSegmented`

Single-select segmented control (radio group). The options sit in one grey track without dividers, and the
selected segment is raised (lighter fill, thin border, soft shadow), so the selection shows by shape and not
only by color. Keyboard focus draws one frame around the whole group.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Currently selected value (use `v-model`) |
| `options` | `Array<{ value: string; label: string; icon?: string; iconOnly?: boolean; tooltip?: string; testid?: string }>` | — (**required**) | Available options. `icon` is an SVG string shown before the label. With `iconOnly: true` only the icon is shown and `label` becomes the accessible name and the tooltip. `tooltip` sets the tooltip text of any option |
| `ariaLabel` | `string` | — | Accessible name of the whole group (for example `"Head style"`); pass it when the group has no visible label. In templates type-checked by `vue-tsc` with strict templates (what `openpen-build --check` uses), write it as `ariaLabel`. |
| `disabled` | `boolean` | `false` | Disables all interaction and applies muted styling |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when selection changes |

## Minimal example

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const mode = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppSegmented v-model="mode" :options="options" />
</template>
```

## Icon-only options

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const head = ref('solid')
const options = [
  { value: 'solid', label: 'Solid head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h8M10 4l4 4-4 4z" fill="currentColor" stroke="currentColor"/></svg>', iconOnly: true },
  { value: 'open', label: 'Open head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor"/></svg>', iconOnly: true },
]
</script>

<template>
  <AppSegmented v-model="head" :options="options" ariaLabel="Head style" />
</template>
```
