---
title: AppToggleButton
description: 用於粗體、斜體等選項的雙狀態按鈕，狀態透過 aria-pressed 公開。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hant
---

# `AppToggleButton`

具有「按下／未按下」兩種狀態的獨立按鈕，用於在工具列或設定列中開關的選項，例如粗體和斜體。每個按鈕都是獨立的 Tab 停靠點。若只是一般的開／關偏好設定，請改用 [`AppToggle`](./app-toggle)。

## 屬性

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**必填**) | 按下狀態（使用 `v-model`） |
| `ariaLabel` | `string` | — (**必填**) | 無障礙名稱。內容常常只是單一字元或圖示，因此必填 |
| `disabled` | `boolean` | `false` | 停用按鈕 |
| `testid` | `string` | — | 按鈕的 `data-testid` |

## 事件

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | 觸發時帶有新的按下狀態 |

預設插槽是按鈕內容（文字或圖示）。

## 按下狀態與鍵盤

按下與未按下不只靠色相區分，而是靠填色、邊框與文字顏色：按下的按鈕有強調色淡底、更明顯的邊框與主要文字色。狀態透過 `<button>` 的 `aria-pressed` 公開。

| 按鍵 | 行為 |
|---|---|
| `Tab` | 焦點移到下一個按鈕；每個按鈕都是獨立的 Tab 停靠點 |
| `Space` / `Enter` | 按下或放開目前焦點的按鈕 |

## 最小範例

```vue
<script setup lang="ts">
import { AppToggleButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const bold = ref(false)
const italic = ref(false)
</script>

<template>
  <AppToggleButton v-model="bold" ariaLabel="Bold" style="font-weight: 700">B</AppToggleButton>
  <AppToggleButton v-model="italic" ariaLabel="Italic" style="font-style: italic">I</AppToggleButton>
</template>
```
