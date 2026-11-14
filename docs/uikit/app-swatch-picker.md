---
title: AppSwatchPicker
description: Single-select colour swatches with a double-ring selected state, one tab stop and arrow-key navigation.
---

# `AppSwatchPicker`

A row of colour swatches of which exactly one can be selected. The group is a
`radiogroup` and each swatch is a `radio`; the whole group is one tab stop and
the arrow keys move between swatches. The component has no built-in palette:
you pass the colours.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Selected colour value (use `v-model`). Compared with the `colors` values case-insensitively |
| `colors` | `Array<{ value: string; label: string; testid?: string }>` | — (**required**) | Swatches. `label` is the accessible name of the swatch; `testid` becomes its `data-testid` |
| `ariaLabel` | `string` | — (**required**) | Accessible name of the whole group |
| `shape` | `'circular' \| 'rounded' \| 'square'` | `'circular'` | Swatch shape |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Swatch size: 22px, 24px, 28px |
| `spacing` | `'small' \| 'medium'` | `'medium'` | Gap between swatches: 6px, 8px |
| `background` | `(color) => string` | — | Overrides the swatch fill, for example to draw a gradient. Defaults to the colour `value` |
| `disabled` | `boolean` | `false` | Disables all interaction and applies muted styling |
| `testid` | `string` | `'app-swatch-picker'` | `data-testid` of the group |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted with the `value` of the swatch the user picked |

## Selected state and keyboard

The selected swatch gets an inset double ring: an outer ring in the primary
text colour and an inner band in the popup surface colour
(`--openpen-color-surface-popup`). The band separates the ring from the swatch,
so the selection stays visible on any swatch colour. Keyboard focus is a separate outline outside the
swatch.

| Key | Behaviour |
|---|---|
| `Tab` | Moves focus into the group (onto the selected swatch), and out again on the next press |
| `←` `↑` | Move to the previous swatch and select it, like a native radio group |
| `→` `↓` | Move to the next swatch and select it |

The selected state is exposed to assistive technology through `aria-checked`
on each `radio`.

## Behaviour notes

- **Wrapping.** Swatches wrap onto a new line when the container is narrow. The
  arrow keys always move through the swatches in reading order, one at a time,
  so `↓` on a wrapped layout goes to the next swatch, not to the swatch below.
- **No match.** When `model-value` matches none of the `colors`, no swatch is
  checked and `Tab` enters the group on the first swatch; the first arrow key
  press then selects a swatch and emits `update:modelValue`.
- **Tooltip.** Each swatch also shows its `label` as the native `title`
  tooltip.
- **Duplicates.** Values are compared case-insensitively, so do not pass two
  colours that differ only by letter case.
- **Type.** `SwatchColor` (the shape of one `colors` entry) is exported:
  `import type { SwatchColor } from '@openpen/module-api/uikit'`.

## Minimal example

```vue
<script setup lang="ts">
import { AppSwatchPicker } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const color = ref('#EF4444')
const colors = [
  { value: '#818CF8', label: 'Indigo' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Emerald' },
]
</script>

<template>
  <AppSwatchPicker v-model="color" :colors="colors" ariaLabel="Highlight colour" />
</template>
```
