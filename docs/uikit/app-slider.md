---
title: AppSlider
description: Numeric range slider that matches OpenPen's visual style, with horizontal and vertical orientation support.
---

# `AppSlider`

Numeric range slider that matches OpenPen's visual style. Supports horizontal and
vertical orientations.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `number` | — (**required**) | Current value (use `v-model`) |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Step increment |
| `width` | `string` | `'100%'` | Container width (or height in vertical mode) |
| `ariaLabel` | `string` | — | Accessible name read by screen readers on the slider thumb; pass it when the slider has no visible label. In templates type-checked by `vue-tsc` with strict templates (what `openpen-build --check` uses), write it as `ariaLabel`. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Slider orientation |
| `track-height` | `string` | `'4px'` | Track thickness |
| `track-radius` | `string` | `'2px'` | Track border-radius |
| `thumb-width` | `string` | `'14px'` | Thumb width |
| `thumb-height` | `string` | `'14px'` | Thumb height |
| `thumb-radius` | `string` | `'50%'` | Thumb border-radius |
| `value-label` | `string` | — | Text for the value bubble (for example `"4px"`). A small bubble with this text appears above the thumb while the slider is being dragged and hides on release; the text is also exposed to screen readers as `aria-valuetext`. Horizontal sliders only. Leave unset for no bubble |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `number` | Emitted on every drag step |

## Minimal example

```vue
<script setup lang="ts">
import { AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <AppSlider v-model="size" :min="8" :max="64" width="120px" ariaLabel="Font size" />
</template>
```

## Showing the value

Inside a plugin popover panel, show the slider's number with `value-label` (a bubble above the thumb while
dragging) instead of a static number beside it; see [`AppPopoverPanel`](./app-popover-panel).

```vue
<AppSlider v-model="size" :min="8" :max="64" :value-label="`${size}px`" ariaLabel="Font size" />
```
