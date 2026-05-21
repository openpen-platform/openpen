---
title: AppDialog
description: 置中強制回應對話框，具備背景遮罩、按 ESC 關閉、焦點鎖定，以及宿主 modal 管理器整合。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppDialog`

置中對話框，具備背景遮罩、按 ESC 關閉及焦點鎖定功能。與宿主 modal 管理器整合，開啟一個對話框時會自動關閉其他已開啟的對話框或彈出視窗。使用 `v-model:open` 進行雙向綁定。

## 屬性

| 屬性 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `modal-id` | `string` | — (**必填**) | 全域唯一 id；用於 modal 堆疊互斥控制 |
| `title` | `string` | — (**必填**) | 對話框標題列文字 |
| `open` | `boolean` | — (**必填**) | 受控開啟狀態；搭配 `@update:open` 或 `v-model:open` 使用 |
| `persistent` | `boolean` | `false` | 為 `true` 時，按 ESC 及點擊背景遮罩不會關閉對話框 |
| `danger` | `boolean` | `false` | 加入 `openpen-modal-danger` CSS class——作為破壞性操作樣式的掛鉤 |

## 插槽

| 插槽 | 作用域 | 說明 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | 開啟對話框的觸發元素 |
| `default` | — | 對話框主體內容 |
| `footer` | — | 選用的頁尾區域（操作按鈕等） |

## 事件

| 事件 | 載荷 | 說明 |
|---|---|---|
| `update:open` | `boolean` | 當對話框請求變更開啟狀態時觸發；`v-model:open` 必須使用此事件 |

> **MUST NOT** 在 trigger 上加入 `@click="toggle"`——`DialogTrigger` 會自動處理
> 啟動行為。作用域函式僅作為程式化控制的逃生出口使用。

## 最簡範例

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <AppDialog modal-id="confirm-clear" title="Clear canvas?" v-model:open="open">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Clear…</button>
    </template>
    Are you sure? This cannot be undone.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="primary" @click="open = false">Clear</button>
    </template>
  </AppDialog>
</template>
```

## persistent + danger 範例（破壞性操作確認）

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)

function confirmDelete() {
  // perform destructive action
  open.value = false
}
</script>

<template>
  <AppDialog
    modal-id="delete-layer"
    title="Delete layer?"
    v-model:open="open"
    :persistent="true"
    :danger="true"
  >
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Delete…</button>
    </template>
    This layer and all its strokes will be permanently removed.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="danger" @click="confirmDelete">Delete</button>
    </template>
  </AppDialog>
</template>
```

## 另請參閱

若需從非同步邏輯（而非範本按鈕）觸發對話框，請參閱 [`useDialog`](./use-dialog)（命令式 API）。
