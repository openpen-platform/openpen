---
title: AppSlider
description: 符合 OpenPen 視覺風格的數值範圍滑桿，支援水平與垂直方向。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
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
| `ariaLabel` | `string` | — | 螢幕閱讀器在滑塊上朗讀的名稱；滑桿沒有可見標籤時請傳入。在由 `vue-tsc` 以嚴格模板檢查的模板中（`openpen-build --check` 即是），請寫成 `ariaLabel`。 |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 滑桿方向 |
| `track-height` | `string` | `'4px'` | 軌道粗細 |
| `track-radius` | `string` | `'2px'` | 軌道圓角半徑 |
| `thumb-width` | `string` | `'14px'` | 滑塊寬度 |
| `thumb-height` | `string` | `'14px'` | 滑塊高度 |
| `thumb-radius` | `string` | `'50%'` | 滑塊圓角半徑 |
| `value-label` | `string` | — | 數值氣泡的文字（例如 `"4px"`）。拖曳滑桿時，把手上方會出現帶有此文字的小氣泡，放開後隱藏；此文字也會以 `aria-valuetext` 提供給螢幕閱讀器。僅限水平滑桿。不設定則沒有氣泡 |

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
  <AppSlider v-model="size" :min="8" :max="64" width="120px" ariaLabel="Font size" />
</template>
```

## 顯示數值

在插件彈出面板裡，請用 `value-label`（拖曳時出現在把手上方的氣泡）顯示滑桿的數字，不要在旁邊放靜態數字；見 [`AppPopoverPanel`](./app-popover-panel)。

```vue
<AppSlider v-model="size" :min="8" :max="64" :value-label="`${size}px`" ariaLabel="Font size" />
```
