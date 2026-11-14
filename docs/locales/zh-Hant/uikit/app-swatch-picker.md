---
title: AppSwatchPicker
description: 單選顏色色塊，行為類似單選群組：選取狀態為雙環，整組一個 Tab 停靠點，方向鍵切換。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hant
---

# `AppSwatchPicker`

一排顏色色塊，只能選取其中一個。整組是 `radiogroup`，每個色塊是 `radio`；整組是一個 Tab 停靠點，方向鍵在色塊間移動。元件不內建調色盤，顏色由呼叫端傳入。

## 屬性

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 目前選取的顏色值（使用 `v-model`），與 `colors` 的值不分大小寫比較 |
| `colors` | `Array<{ value: string; label: string; testid?: string }>` | — (**必填**) | 色塊清單。`label` 是色塊的無障礙名稱，`testid` 會成為它的 `data-testid` |
| `ariaLabel` | `string` | — (**必填**) | 整組的無障礙名稱 |
| `shape` | `'circular' \| 'rounded' \| 'square'` | `'circular'` | 色塊形狀 |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | 色塊大小：22px、24px、28px |
| `spacing` | `'small' \| 'medium'` | `'medium'` | 色塊間距：6px、8px |
| `background` | `(color) => string` | — | 覆寫色塊填色（例如繪製漸層）。預設使用顏色的 `value` |
| `disabled` | `boolean` | `false` | 停用所有互動並顯示為淡化樣式 |
| `testid` | `string` | `'app-swatch-picker'` | 整組的 `data-testid` |

## 事件

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | 使用者選取色塊時觸發，參數為該色塊的 `value` |

## 選取狀態與鍵盤

選取的色塊帶有內嵌雙環：外環為主要文字色，內側為彈出面板底色的色帶（`--openpen-color-surface-popup`）。色帶把外環與色塊隔開，因此無論色塊是什麼顏色，選取狀態都清楚可見。鍵盤焦點則是色塊外側另一道輪廓線。

| 按鍵 | 行為 |
|---|---|
| `Tab` | 將焦點移入整組（落在選取的色塊上），再按一次則離開整組 |
| `←` `↑` | 移到上一個色塊並選取（與原生單選群組相同） |
| `→` `↓` | 移到下一個色塊並選取 |

選取狀態透過每個 `radio` 的 `aria-checked` 公開給輔助技術。

## 行為說明

- **換行。** 容器較窄時，色塊會換到下一行。方向鍵一律依顯示順序逐個移動，所以在換行的版面中 `↓` 會移到下一個色塊，而不是下方的色塊。
- **無相符項。** 當 `model-value` 與 `colors` 中任何一項都不相符時，沒有色塊被選取，`Tab` 會落在第一個色塊上；按下第一個方向鍵後才會選取一個色塊並觸發 `update:modelValue`。
- **提示文字。** 每個色塊也會把 `label` 顯示為原生的 `title` 提示。
- **重複值。** 值以不分大小寫的方式比較，請不要傳入只有大小寫不同的兩個顏色。
- **型別。** `SwatchColor`（`colors` 中單一項目的型別）已匯出：`import type { SwatchColor } from '@openpen/module-api/uikit'`。

## 最小範例

```vue
<script setup lang="ts">
import { AppSwatchPicker } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const color = ref('#EF4444')
const colors = [
  { value: '#818CF8', label: 'Indigo' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Emerald' },
]
</script>

<template>
  <AppSwatchPicker v-model="color" :colors="colors" ariaLabel="Highlight colour" />
</template>
```
