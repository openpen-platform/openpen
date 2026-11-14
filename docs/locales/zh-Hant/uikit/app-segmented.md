---
title: AppSegmented
description: 單選分段控制項（radio group），用於互斥選項；外觀是一條灰色軌道加上浮起的選中段，選項可以是文字、圖示加文字，或只有圖示。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hant
---

# `AppSegmented`

單選分段控制項（radio group）。所有選項放在同一條灰色軌道裡、沒有分隔線，選中的那一段會浮起（較亮的底、細邊框、柔和陰影），所以選取狀態靠形狀就看得出來，不只靠顏色。鍵盤焦點會在整個群組外畫一個框。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 目前選取的值（使用 `v-model`） |
| `options` | `Array<{ value: string; label: string; icon?: string; iconOnly?: boolean; tooltip?: string; testid?: string }>` | — (**必填**) | 可用選項。`icon` 是顯示在標籤前的 SVG 字串。`iconOnly: true` 時只顯示圖示，`label` 成為無障礙名稱與提示文字。`tooltip` 可為任何選項設定提示文字 |
| `ariaLabel` | `string` | — | 整個群組的無障礙名稱（例如 `"Head style"`）；群組沒有可見標籤時請傳入。在由 `vue-tsc` 以嚴格模板檢查的模板中（`openpen-build --check` 即是），請寫成 `ariaLabel`。 |
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

## 只有圖示的選項

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const head = ref('solid')
const options = [
  { value: 'solid', label: 'Solid head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h8M10 4l4 4-4 4z" fill="currentColor" stroke="currentColor"/></svg>', iconOnly: true },
  { value: 'open', label: 'Open head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor"/></svg>', iconOnly: true },
]
</script>

<template>
  <AppSegmented v-model="head" :options="options" ariaLabel="Head style" />
</template>
```
