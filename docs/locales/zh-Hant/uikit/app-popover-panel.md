---
title: AppPopoverPanel
description: AppPopover 內容的內部排版：縱向間距、選用標題，以及與主程式自身彈出面板相同間距的表單列。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-12T00:00:00Z
language: zh-Hant
---

# `AppPopoverPanel` / `AppPopoverRow`

用於 [`AppPopover`](./app-popover) 的 `content` 插槽的排版輔助元件。`AppPopover` 負責繪製外框（背景、邊框、圓角、內距、陰影），並自動跟隨淺色／深色主題與強調色；這兩個元件負責排布內部內容，因此插件不需自帶面板 CSS。

> 需要 `@openpen/module-api` 1.4.0 以上。更舊版本的主程式沒有這兩個元件。

## `AppPopoverPanel`

子元素間距為 10px 的縱向堆疊，外加選用標題。

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `title` | `string` | — | 顯示在內容上方的標題（全大寫顯示，並加大字距） |

| 插槽 | 說明 |
|---|---|
| 預設 | 面板內容，通常是一個或多個 `AppPopoverRow` |

## `AppPopoverRow`

一個表單列：選用標籤後接一個控制項，垂直置中，間距 10px。放在列內的 [`AppSegmented`](./app-segmented) 會佔滿剩餘寬度。

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `label` | `string` | — | 顯示在控制項之前的標籤 |

| 插槽 | 說明 |
|---|---|
| 預設 | 控制項：`AppToggle`、`AppSlider`、`AppSegmented` 等 |

## 最小範例


```vue
<script setup lang="ts">
import {
  AppPopover, AppPopoverPanel, AppPopoverRow, AppToggle, AppSegmented,
} from '@openpen/module-api/uikit'
import { ref } from 'vue'

const filled = ref(false)
const style = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppPopover popover-id="my-panel">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Style</button>
    </template>
    <template #content>
      <AppPopoverPanel title="Style">
        <AppPopoverRow label="Fill">
          <AppToggle v-model="filled" ariaLabel="Fill" />
        </AppPopoverRow>
        <AppPopoverRow>
          <AppSegmented v-model="style" :options="options" />
        </AppPopoverRow>
      </AppPopoverPanel>
    </template>
  </AppPopover>
</template>
```
