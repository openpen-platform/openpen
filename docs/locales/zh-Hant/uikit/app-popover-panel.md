---
title: AppPopoverPanel
description: AppPopover 內容的內部排版：縱向間距、選用標題，以及與主程式自身彈出面板相同間距的表單列。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hant
---

# `AppPopoverPanel` / `AppPopoverRow`

用於 [`AppPopover`](./app-popover) 的 `content` 插槽的排版輔助元件。`AppPopover` 負責繪製外框（背景、邊框、圓角、內距、陰影），並自動跟隨淺色／深色主題與強調色；這兩個元件負責排布內部內容，因此插件不需自帶面板 CSS。

> 需要 `@openpen/module-api` 1.4.0 以上。更舊版本的主程式沒有這兩個元件。
>
> 下文的共用欄對齊是在這兩個元件首次發佈之後才加入的。早於該變更的主程式仍有這兩個元件，但每一列各自排版：標籤、控制項與數值文字在一列內並排，各列之間不會對齊。不會報錯，插件也無法在執行時偵測。

## `AppPopoverPanel`

子元素間距為 10px 的縱向堆疊，外加選用標題。面板內每個 `AppPopoverRow` 共用三欄——標籤、控制項、數值——因此每一列的控制項起點相同、數值文字也對齊，插件不需寫任何 CSS。標籤欄與面板內最長的標籤一樣寬（翻譯後的標籤不必調寬度），控制欄佔用剩餘寬度（至少 140px），數值欄是選用的，沒有任何一列使用時不佔寬度。

這些欄使用 CSS `subgrid`（Chromium 117 以上）。主程式的 Electron 已包含，插件不需額外處理。在不支援 `subgrid` 的瀏覽器中，一列的三個部分會上下堆疊。

**列必須是面板的直接子元素。**欄屬於面板，列只有在是面板自己的子元素時才會加入。不要把列包在 `<div>` 或根節點為外層容器的元件裡：被包住的列會離開共用欄，它的標籤、控制項與數值文字會縮進一個窄欄並上下堆疊。列外面的 `<template v-for>` 或 `<template v-if>` 沒問題，因為它不產生元素。

直接放在面板裡的其他內容（提示文字、分隔線）會排進標籤欄，並可能把標籤欄撐寬。請改放進沒有 `label` 的 `AppPopoverRow`；那一列會橫跨所有欄。

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `title` | `string` | — | 顯示在內容上方的標題（全大寫顯示，並加大字距） |

| 插槽 | 說明 |
|---|---|
| 預設 | 面板內容，通常是一個或多個 `AppPopoverRow` |

## `AppPopoverRow`

一個表單列：選用標籤、一個控制項、選用的數值文字，垂直置中，間距 10px。列會加入面板的共用欄，所以請把這些部分依此順序直接放在列內。沒有 `label` 的列（按鈕群組、分段控制）改為橫跨所有欄。放在列內的 [`AppSegmented`](./app-segmented) 會佔滿剩餘寬度。

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `label` | `string` | — | 顯示在控制項之前的標籤 |

| 插槽 | 說明 |
|---|---|
| 預設 | 控制項（`AppToggle`、`AppSlider`、`AppSegmented` 等），後面可接一個放數值文字的元素（例如 `<span>150px</span>`）。數值元素必須是該列的第三個子元素（標籤、控制項、數值），會靠右對齊並使用等寬數字。不要替滑桿設定 `width`；它會填滿控制欄。 |

**滑桿的數字不是數值文字。**在插件面板裡，請用 [`AppSlider`](./app-slider) 的 `value-label` 屬性顯示滑桿的數字：拖曳滑桿時，把手上方會出現一個小氣泡，面板保持安靜，滑桿也能使用整個控制欄。不要在滑桿旁放靜態數字。第三個元素只用於不是滑桿數值的文字。

選用的數值文字是依位置找出來的，所以每列請維持三個部分：

- 第四個元素會在列內換到多出來的一行；數值仍是第三個、靠右對齊。輸出多個根節點的控制項元件會佔用不只一個位置，把數值擠出第三個位置：數值會換到多出來的一行，也不會靠右。
- 沒有 `label` 的列是單純的 flex 列；其中的第三個元素不會套用欄對齊。
- 有 `label` 但沒有數值文字的列沒有問題；數值欄只是留空。

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

## 對齊的滑桿列

有滑桿的列會在整個面板中對齊，每個滑桿在拖曳時以氣泡顯示自己的數字。不要傳寬度，也不要寫樣式：

```vue
<AppPopoverPanel title="Spotlight">
  <AppPopoverRow label="Radius">
    <AppSlider v-model="radius" :min="40" :max="400" :value-label="`${radius}px`" ariaLabel="Radius" />
  </AppPopoverRow>
  <AppPopoverRow label="Dim level">
    <AppSlider v-model="dim" :min="0" :max="100" :value-label="`${dim}%`" ariaLabel="Dim level" />
  </AppPopoverRow>
</AppPopoverPanel>
```

兩條滑桿的起點與終點都相同，不論標籤多長。
