---
title: AppSelect
description: Single-select dropdown that matches OpenPen's popup styling.
---

# `AppSelect`

Single-select dropdown that matches OpenPen's popup styling.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Currently selected value (use `v-model`) |
| `options` | `Array<{ value: string; label: string }>` | — (**required**) | Selectable options |
| `placeholder` | `string` | — (**required**) | Shown when no option is selected |
| `disabled` | `boolean` | `false` | Disable interaction |
| `aria-label` | `string` | — | Accessible name of the trigger button; pass it when the select has no visible label, otherwise a screen reader announces only the current value |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when selection changes |

## Minimal example

```vue
<script setup lang="ts">
import { AppSelect } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const lang = ref('en')
const options = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
]
</script>

<template>
  <AppSelect v-model="lang" :options="options" placeholder="Pick a language" aria-label="Language" />
</template>
```
