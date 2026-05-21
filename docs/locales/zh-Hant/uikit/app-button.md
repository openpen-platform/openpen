---
title: AppButton
description: 符合 host 視覺設計的標準 36×36 控制列按鈕，內建 tooltip 支援。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppButton`

符合 host 視覺設計的標準 36×36 控制列按鈕：圓角、懸停背景、啟用狀態強調色，以及內嵌 tooltip。
在控制列新增按鈕時，請優先使用此元件而非純 `<button>`——它省去了手動複製精確尺寸、顏色與 tooltip 行為的需要。

按鈕會自動適應 host 的控制列情境：

- **垂直列**會將按鈕縮小至 34×34，以符合較窄的 vbar 佔用空間。
- **Tooltip 方向**在垂直列中會朝遠離吸附邊的方向顯示（吸附左側 → tooltip 在右；吸附右側 → tooltip 在左），並在水平模式下、控制列靠近工作區頂端時往按鈕下方翻轉。

這些行為來自 host 提供的注入鍵（`IS_VERTICAL_KEY`、`SNAP_EDGE_KEY`、`TOOLTIP_FLIP_DOWN_KEY`），plugin 開發者無需自行設定。在 host 控制列情境之外，AppButton 會以標準 36×36 水平模式按鈕呈現。

## 屬性

| 屬性 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `variant` | `'default' \| 'danger'` | `'default'` | 視覺意圖；`'danger'` 會將按鈕標為紅色，用於破壞性操作 |
| `active` | `boolean` | `false` | 以強調色突顯按鈕（用於工具啟用狀態） |
| `disabled` | `boolean` | `false` | 使按鈕內容變暗；保留滑鼠事件，讓 tooltip 仍可觸發 |
| `tooltip` | `string` | — | 懸停時顯示於按鈕上方的簡短標籤 |
| `aria-label` | `string` | — | 供螢幕閱讀器使用的無障礙名稱 |

## 插槽

| 插槽 | 說明 |
|---|---|
| `default` | 按鈕內容（圖示 SVG、文字或任意行內元素） |

## 事件

| 事件 | Payload | 說明 |
|---|---|---|
| `click` | — | 點擊時觸發；`disabled` 為 `true` 時會被抑制 |

## 最簡範例

```vue
<script setup lang="ts">
import { AppButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <AppButton
    :active="active"
    tooltip="Toggle feature"
    aria-label="Toggle feature"
    @click="active = !active"
  >
    <!-- Inline SVG icon (stroke="currentColor" — colour tracks the token) -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="3" />
    </svg>
  </AppButton>
</template>
```
