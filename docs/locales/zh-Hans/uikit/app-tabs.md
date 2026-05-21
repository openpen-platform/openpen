---
title: AppTabs
description: 受控的标签页内容容器，支持无障碍键盘导航。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppTabs`

受控的标签页内容容器。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 当前激活的标签页 id（使用 `v-model`） |
| `tabs` | `Array<{ id: string; label: string }>` | — (**必填**) | 有序的标签页描述符列表 |

## 事件

| 事件 | 载荷 | 描述 |
|---|---|---|
| `update:modelValue` | `string` | 激活的标签页变更时触发 |

## 插槽

| 插槽 | 作用域 | 描述 |
|---|---|---|
| `default` | `{ activeTabId: string }` | 标签页内容区域；根据激活的 id 切换显示内容 |

## 最小示例

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
