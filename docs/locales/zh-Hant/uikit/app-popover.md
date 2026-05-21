---
title: AppPopover
description: 點擊開啟、錨定至觸發元素的 popover，支援點擊外部關閉、互斥邏輯與 ControlBar 動畫防護。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppPopover`

點擊開啟、錨定至觸發元素的 popover。處理點擊外部關閉、與其他 popover 的互斥邏輯，以及 ControlBar 動畫防護。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `popover-id` | `string` | — (**必填**) | 全域唯一 id；用於互斥邏輯 |
| `placement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 偏好的展開方向 |
| `gap` | `number` | `8` | 觸發元素與內容面板之間的距離（px） |

## 插槽

| 插槽 | 作用域 | 說明 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | 開啟 popover 的觸發元素 |
| `content` | — | 渲染於 popover 面板內的內容 |

> **MUST NOT** 在觸發按鈕上加 `@click="toggle"`。`PopoverTrigger` 會在內部處理點擊事件；手動呼叫 `toggle` 會導致雙重觸發的競態問題。
> `toggle`/`open`/`close` 作用域函式僅供**程式化控制**使用
> （例如：從另一個按鈕開啟此 popover）。

## 最小範例

```vue
<script setup lang="ts">
import { AppPopover } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <input v-model.number="value" type="range" min="0" max="100" />
    </template>
  </AppPopover>
</template>
```
