---
title: AppDialog
description: 带有遮罩层、ESC 关闭、焦点陷阱及宿主 modal 管理器集成的居中模态对话框。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppDialog`

带有遮罩层、ESC 关闭和焦点陷阱的居中对话框。与宿主 modal 管理器集成，打开一个对话框时会自动关闭其他已打开的对话框或弹出层。使用 `v-model:open` 进行双向绑定。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `modal-id` | `string` | — (**必填**) | 全局唯一 id；用于 modal 栈互斥 |
| `title` | `string` | — (**必填**) | 对话框标题栏文本 |
| `open` | `boolean` | — (**必填**) | 受控的打开状态；与 `@update:open` 或 `v-model:open` 配合使用 |
| `persistent` | `boolean` | `false` | 为 `true` 时，ESC 及遮罩层点击不会关闭对话框 |
| `danger` | `boolean` | `false` | 添加 `openpen-modal-danger` CSS 类——用于破坏性操作样式的钩子 |

## 插槽

| 插槽 | 作用域 | 描述 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | 用于打开对话框的元素 |
| `default` | — | 对话框主体内容 |
| `footer` | — | 可选的底部区域（操作按钮等） |

## 事件

| 事件 | 载荷 | 描述 |
|---|---|---|
| `update:open` | `boolean` | 当对话框请求改变打开状态时触发；`v-model:open` 所必需 |

> **MUST NOT** 在 trigger 上添加 `@click="toggle"`——`DialogTrigger` 会自动处理激活逻辑。作用域函数仅作为程序化控制的逃生舱口使用。

## 最简示例

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

## persistent + danger 示例（破坏性操作确认）

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

## 另请参阅

若需从异步逻辑而非模板按钮触发对话框，请参阅 [`useDialog`](./use-dialog)（命令式 API）。
