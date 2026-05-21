---
title: AppSelect
description: 符合 OpenPen 彈出視窗樣式的單選下拉選單。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppSelect`

符合 OpenPen 彈出視窗樣式的單選下拉選單。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 目前選取的值（使用 `v-model`） |
| `options` | `Array<{ value: string; label: string }>` | — (**必填**) | 可選取的選項 |
| `placeholder` | `string` | — (**必填**) | 未選取任何選項時顯示的提示文字 |
| `disabled` | `boolean` | `false` | 停用互動 |

## 事件

| 事件 | 參數 | 說明 |
|---|---|---|
| `update:modelValue` | `string` | 選取項目變更時觸發 |

## 最簡範例

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
  <AppSelect v-model="lang" :options="options" placeholder="Pick a language" />
</template>
```
