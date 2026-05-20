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
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Slider orientation |
| `track-height` | `string` | `'4px'` | Track thickness |
| `track-radius` | `string` | `'2px'` | Track border-radius |
| `thumb-width` | `string` | `'14px'` | Thumb width |
| `thumb-height` | `string` | `'14px'` | Thumb height |
| `thumb-radius` | `string` | `'50%'` | Thumb border-radius |

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
  <AppSlider v-model="size" :min="8" :max="64" width="120px" />
</template>
```
