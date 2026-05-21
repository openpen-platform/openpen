---
title: AppButtonDropdown
description: 分割模式控制列按鈕——將 AppButton 主要動作與切換 popover 的插入符號按鈕配對。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppButtonDropdown`

一個複合式控制列按鈕，將 `AppButton`（主要動作）與一個窄型插入符號按鈕配對。主按鈕觸發自身的點擊事件；插入符號按鈕切換一個 `AppPopover`，其內容由你透過 slot 提供。參考自 [Quasar `QBtnDropdown` 分割模式](https://quasar.dev/vue-components/button-dropdown)以及 shadcn Button + DropdownMenu 的組合方式。

在以下兩種情況同時存在時請使用此元件：

- 使用者可直接觸發的**主要動作**（啟用工具、執行指令）
- **次要選項介面**（模式選擇器、子面板、相關捷徑）

如果你只需要一個按鈕，請使用 [`AppButton`](./app-button)——它正是 `AppButtonDropdown` 內部所包裝的元件。如果你只需要一個 popover 觸發器，請直接使用 [`AppPopover`](./app-popover)。

插入符號的箭頭圖示會自動旋轉，指向開啟中的 popover：關閉時朝下、在水平列開啟時朝上、在垂直列時朝左或朝右（遠離吸附邊緣）。此元件會從 host 讀取 `SNAP_EDGE_KEY` 與 `IS_VERTICAL_KEY`——plugin 作者不需要手動設定旋轉角度。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `popoverId` | `string` | — （必填） | 傳入內部 `AppPopover` 的全域唯一 id；用於讓 modal 管理器識別此下拉選單 |
| `popoverPlacement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 偏好的 popover 側邊；`auto` 會依 host 的 `POPOVER_PLACEMENT_HINT_KEY` 自動選擇 |
| `active` | `boolean` | `false` | 以強調色標亮主按鈕（用於工具啟用狀態） |
| `disabled` | `boolean` | `false` | 停用主按鈕與插入符號按鈕；提示說明仍可懸停顯示 |
| `variant` | `'default' \| 'danger'` | `'default'` | 主按鈕的視覺意圖 |
| `mainTooltip` | `string` | — | 懸停主按鈕時顯示的提示文字 |
| `mainAriaLabel` | `string` | — | 主按鈕的無障礙名稱 |
| `caretAriaLabel` | `string` | — | 插入符號按鈕的無障礙名稱（螢幕閱讀器使用者必填） |
| `mainTestid` | `string` | — | 轉發至主按鈕的 `data-testid` |
| `caretTestid` | `string` | — | 轉發至插入符號按鈕的 `data-testid` |

## 插槽

| 插槽 | 說明 |
|---|---|
| `main-content` | 主按鈕內部呈現的內容（圖示 SVG、色票等） |
| `popover-content` | popover 開啟時呈現的內容（選單、子面板、選項清單） |

## 事件

| 事件 | 載荷 | 說明 |
|---|---|---|
| `mainClick` | — | 主按鈕點擊事件；`disabled` 為 `true` 時不觸發 |
| `caretClick` | — | 插入符號按鈕點擊事件（popover 的開關由 `AppPopover` 內部處理）；可用於附加效果，例如在工具未啟用時點擊插入符號即啟用工具 |

## 最小範例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { AppButtonDropdown } from '@openpen/module-api/uikit'

const isActive = ref(false)

function activate() {
  isActive.value = true
  // ...run primary action
}

function activateIfNeeded() {
  if (!isActive.value) isActive.value = true
}
</script>

<template>
  <AppButtonDropdown
    popover-id="shape"
    :active="isActive"
    main-tooltip="Shape tool"
    main-aria-label="Shape tool"
    caret-aria-label="Shape options"
    @main-click="activate"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </template>
    <template #popover-content>
      <div class="my-shape-picker">
        <!-- your option list / sub-panel goes here -->
      </div>
    </template>
  </AppButtonDropdown>
</template>
```

## 版面說明

在水平控制列中，包裝元素為 flex row；在垂直控制列中為 flex column；無論哪種方向，插入符號都會緊附在主按鈕的右側（或下方）。結構類別 `app-btn-dropdown-wrap`、`app-btn-dropdown-caret` 與 `app-btn-dropdown-caret-icon` 以非範疇（unscoped）方式公開，讓 host（或你的 plugin 自訂主題）可以套用情境大小調整——例如，當 `AppButtonDropdown` 位於嵌入式控制列群組中時，OpenPen host 會將插入符號縮小至 30 px 高。

popover 開啟時，插入符號按鈕會加上 `.active` 類別以顯示強調色標亮；當 host 觸發控制列動畫時，內部的 `AppPopover` 會自動關閉（不需手動協調）。
