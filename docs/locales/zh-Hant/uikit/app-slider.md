---
title: AppSlider
description: 符合 OpenPen 視覺風格的數值範圍滑桿，支援水平與垂直方向。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppSlider`

符合 OpenPen 視覺風格的數值範圍滑桿。支援水平與垂直方向。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `model-value` | `number` | — (**必填**) | 目前值（使用 `v-model`） |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步進增量 |
| `width` | `string` | `'100%'` | 容器寬度（垂直模式下為高度） |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 滑桿方向 |
| `track-height` | `string` | `'4px'` | 軌道粗細 |
| `track-radius` | `string` | `'2px'` | 軌道圓角半徑 |
| `thumb-width` | `string` | `'14px'` | 滑塊寬度 |
| `thumb-height` | `string` | `'14px'` | 滑塊高度 |
| `thumb-radius` | `string` | `'50%'` | 滑塊圓角半徑 |

## 事件

| 事件 | 資料 | 說明 |
|---|---|---|
| `update:modelValue` | `number` | 每次拖曳步進時觸發 |

## 最簡範例

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
