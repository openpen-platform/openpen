---
title: AppTooltip
description: 滑鼠懸停觸發的提示框，支援可設定的顯示位置與開啟延遲。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppTooltip`

滑鼠懸停觸發的提示框，支援可設定的顯示位置與延遲。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `content` | `string` | — (**必填**) | 提示文字 |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | 偏好的顯示位置 |
| `delay` | `number` | `200` | 懸停開啟延遲（毫秒） |

## 插槽

| 插槽 | 說明 |
|---|---|
| `default` | 觸發元素（任何接收懸停事件的元素） |

## 最小範例

```vue
<script setup lang="ts">
import { AppTooltip } from '@openpen/module-api/uikit'
</script>

<template>
  <AppTooltip content="Undo last stroke" side="bottom">
    <button class="cb-btn" aria-label="Undo">↶</button>
  </AppTooltip>
</template>
```

## 搭配 `AppPopover` 使用 `AppTooltip`

`AppTooltip`（懸停觸發）與 `AppPopover`（點擊觸發）組合使用時，MUST 將 `AppTooltip` 放置在 `AppPopover` 的 `#trigger` 插槽**內部**。這是唯一安全的巢狀順序。

### 為何此方式是安全的

- `AppPopover` 以**點擊**開啟；`AppTooltip` 以**懸停**開啟。兩個觸發條件互斥——不會同時觸發。
- 兩個元件都是獨立的 portal，會將浮動面板傳送至 `<body>`。`AppPopover` 使用 `MODAL_MANAGER_KEY` 進行互斥管理；`AppTooltip` 直接包裝 `TooltipProvider`，不使用任何共享的 inject key。將其中一個巢狀於另一個不會造成 key 衝突。
- 每個 portal 的 `z-index` 分層由包裝元件獨立控制，兩個 portal 不會互相干擾。

### 可運作的範例

```vue
<script setup lang="ts">
import { AppPopover, AppTooltip } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const opacity = ref(80)
</script>

<template>
  <AppPopover popover-id="opacity-slider" placement="auto">
    <template #trigger="{ active }">
      <!-- AppTooltip wraps the button INSIDE the trigger slot so the
           slot-scope `active` prop remains accessible. -->
      <AppTooltip content="Adjust opacity" side="bottom">
        <button class="cb-btn" :class="{ active }" aria-label="Opacity">
          ◑
        </button>
      </AppTooltip>
    </template>
    <template #content>
      <label>
        Opacity
        <input v-model.number="opacity" type="range" min="0" max="100" />
      </label>
    </template>
  </AppPopover>
</template>
```

> **注意**：當使用者點擊時，提示框會自動消失（瀏覽器會在點擊離開時觸發 `mouseleave`），因此開啟的 popover 面板與提示框之間不會產生視覺衝突。

### 不應該這樣做

```vue
<!-- ❌ AppTooltip outside #trigger — loses access to `active` slot scope -->
<AppTooltip content="Adjust opacity" side="bottom">
  <AppPopover popover-id="opacity-slider">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">◑</button>
    </template>
  </AppPopover>
</AppTooltip>
```
