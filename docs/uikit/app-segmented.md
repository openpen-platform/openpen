---
title: AppSegmented
description: Single-select segmented control (radio group) for mutually-exclusive options.
---

# `AppSegmented`

Single-select segmented control (radio group).

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Currently selected value (use `v-model`) |
| `options` | `Array<{ value: string; label: string; icon?: string }>` | — (**required**) | Available options |
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
