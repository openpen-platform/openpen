---
title: AppTabs
description: 受控的分頁內容容器，支援無障礙鍵盤導覽。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppTabs`

受控的分頁內容容器。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 目前作用中的分頁 id（使用 `v-model`） |
| `tabs` | `Array<{ id: string; label: string }>` | — (**必填**) | 依序排列的分頁描述物件 |

## 事件

| 事件 | Payload | 說明 |
|---|---|---|
| `update:modelValue` | `string` | 作用中分頁變更時觸發 |

## 插槽

| 插槽 | Scope | 說明 |
|---|---|---|
| `default` | `{ activeTabId: string }` | 分頁內容區域；依作用中的 id 進行條件渲染 |

## 最簡範例

```vue
<script setup lang="ts">
import { AppTabs } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const tab = ref('general')
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'shortcuts', label: 'Shortcuts' },
]
</script>

<template>
  <AppTabs v-model="tab" :tabs="tabs">
    <template #default="{ activeTabId }">
      <div v-if="activeTabId === 'general'">General settings…</div>
      <div v-else-if="activeTabId === 'shortcuts'">Shortcut settings…</div>
    </template>
  </AppTabs>
</template>
```
