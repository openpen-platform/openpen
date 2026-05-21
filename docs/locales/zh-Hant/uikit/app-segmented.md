---
title: AppSegmented
description: 單選分段控制項（radio group），用於互斥選項。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppSegmented`

單選分段控制項（radio group）。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 目前選取的值（使用 `v-model`） |
| `options` | `Array<{ value: string; label: string; icon?: string }>` | — (**必填**) | 可用選項 |
| `disabled` | `boolean` | `false` | 停用所有互動並套用靜音樣式 |

## 事件

| 事件 | Payload | 說明 |
|---|---|---|
| `update:modelValue` | `string` | 選取項目變更時觸發 |

## 最小範例

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
