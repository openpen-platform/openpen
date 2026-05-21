---
title: AppToggle
description: 符合 OpenPen 視覺風格的布林開關元件。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppToggle`

布林開關元件。

## 屬性

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**required**) | 目前狀態（使用 `v-model`） |
| `aria-label` | `string` | `''` | 無障礙標籤 |

## 事件

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | 切換時觸發 |

## 最小範例

```vue
<script setup lang="ts">
import { AppToggle } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const enabled = ref(false)
</script>

<template>
  <AppToggle v-model="enabled" aria-label="Enable feature" />
</template>
```
