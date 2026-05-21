---
title: 模块设置
description: 通过 Zod 设置模式和 useModuleContext 组合式函数为你的 module 持久化用户偏好。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 模块设置

Module 可通过**设置模式**和 `useModuleContext()` 组合式函数持久化用户偏好。设置存储在 `config.json → modules[moduleId]` 下，并在应用重启后保留。

---

## 定义设置模式

在 module 定义上使用 `@openpen/module-api` 重新导出的 `z` 声明 Zod 模式：

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().min(0).max(1).default(0.8),
    mode: z.enum(['solid', 'gradient']).default('solid'),
  }),
  contributes: { /* ... */ },
})
```

- `settingsSchema` 对任何调用 `updateSettings()` 的 module 均为**必填项**。在没有模式的情况下调用 `updateSettings()` 会同步抛出错误 `ctx.updateSettings() requires a settingsSchema on the module definition for "<id>"`。只调用 `getSettings()` 的只读 module 可以省略 `settingsSchema`——在声明模式之前将收到 `{}`。
- 使用 `.default()` 声明的默认值会在每次 `getSettings()` 读取时与存储的值合并——对于具有默认值的键，你永远不会收到 `undefined`。
- 请使用 `z` 重新导出；不要将 Zod 作为单独的依赖项添加。

---

## 在 Vue 组件中读写设置

从 `@openpen/module-api` 导入 `useModuleContext`：

```ts
import { useModuleContext } from '@openpen/module-api'
```

`useModuleContext(moduleId)` 返回一个包含三个设置方法的上下文对象：

| 方法 | 功能说明 |
|--------|-------------|
| `getSettings<T>()` | 返回与模式默认值合并后的当前设置。 |
| `updateSettings<T>(patch)` | 持久化一个部分补丁。返回 `Promise`。 |
| `onSettingsChange<T>(cb)` | 订阅设置变更；返回一个取消订阅的函数。 |

### 示例：设置面板组件

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useModuleContext } from '@openpen/module-api'
import { AppSlider, AppSegmented } from '@openpen/module-api/uikit'

type Settings = { opacity: number; mode: 'solid' | 'gradient' }

const opacity = ref(0.8)
const mode = ref<'solid' | 'gradient'>('solid')
let unsub: (() => void) | null = null

onMounted(() => {
  const ctx = useModuleContext('my-plugin')
  const s = ctx.getSettings<Settings>()
  opacity.value = s.opacity
  mode.value = s.mode
  unsub = ctx.onSettingsChange<Settings>((next) => {
    if (next.opacity != null) opacity.value = next.opacity
    if (next.mode) mode.value = next.mode
  })
})

onUnmounted(() => { unsub?.() })

async function setOpacity(v: number) {
  const ctx = useModuleContext('my-plugin')
  opacity.value = v
  await ctx.updateSettings<Settings>({ opacity: v })
}

async function setMode(v: string) {
  const ctx = useModuleContext('my-plugin')
  mode.value = v as Settings['mode']
  await ctx.updateSettings<Settings>({ mode: v as Settings['mode'] })
}
</script>

<template>
  <div>
    <AppSlider :model-value="opacity" :min="0" :max="1" :step="0.05"
               @update:model-value="setOpacity($event)" />
    <AppSegmented
      :model-value="mode"
      :options="[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]"
      @update:model-value="setMode($event)" />
  </div>
</template>
```

**请在 `onMounted` 内调用 `useModuleContext`，而不是在 `<script setup>` 顶部调用。** Module 上下文在 Vue 组件树挂载后才注册；在 setup 求值阶段调用可能会触发"未注册"错误。

---

## 在宿主 UI 中显示偏好设置

宿主为 module 偏好设置提供两个 slot。根据复杂程度进行选择：

| | `settingsPanels` → `ui.settings.panels` | `settingsTabs` → `ui.settings.tabs` |
|---|---|---|
| **显示位置** | **设置 → 功能**内的带标题区块，与其他 module 分组显示 | 设置中专属的顶级标签页 |
| **适用场景** | 大多数 module——几行偏好设置 | 需要深度配置的 module（多个区块、嵌套布局、预览区域） |
| **用户可发现性** | 高——所有 module 偏好设置集中在一处 | 较低——用户需要找到特定标签页 |
| **禁用时的可见性** | 自动隐藏 | 自动隐藏 |

如有疑问，请从 `settingsPanels` 开始。之后可以随时添加专属标签页，无需更改用户数据。

### 使用 `settingsPanels`

```ts
import { defineModule, z } from '@openpen/module-api'
import MySettingsPanel from './MySettingsPanel.vue'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().default(0.8),
  }),
  contributes: {
    settingsPanels: [{
      id: 'my-plugin-settings',
      label: { en: 'My Plugin', 'zh-Hant': '我的插件' },
      component: MySettingsPanel,
    }],
  },
})
```

宿主将该组件渲染为设置 → 功能下的带标题卡片区块。当 module 被禁用或移除时，该区块自动消失。

### 使用 `settingsTabs`

```ts
import { defineModule } from '@openpen/module-api'
import MyFullSettingsTab from './MyFullSettingsTab.vue'

export default defineModule({
  id: 'my-plugin',
  contributes: {
    settingsTabs: [{
      id: 'my-plugin',
      label: { en: 'My Plugin' },
      component: MyFullSettingsTab,
    }],
  },
})
```

适用于需要丰富布局的 module（多个子区块、代码编辑器、图片选择器等）。

---

## 在 `setup()` 中访问设置

`ModuleSetupContext`（`setup()` 中的 `ctx` 参数）提供相同的三个方法。使用它们在 UI 渲染前初始化 module 状态：

```ts
export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  setup(ctx) {
    const { opacity } = ctx.getSettings<{ opacity: number }>()
    applyOpacity(opacity)

    ctx.onSettingsChange<{ opacity: number }>(({ opacity }) => {
      if (opacity != null) applyOpacity(opacity)
    })
  },
  contributes: { /* ... */ },
})
```

在 `setup()` 内注册的 `onSettingsChange` 订阅会在 module 卸载时通过 `ctx.onDispose` 自动清理。

---

## 另请参阅

- [UI slot](../slots/ui) — [`ui.settings.panels`](../slots/ui#ui-settings-panels)、[`ui.settings.tabs`](../slots/ui#ui-settings-tabs) slot 详情。
- [系统 slot](../slots/system) — [`system.shortcuts`](../slots/system#system-shortcuts) slot 详情。
- [UIKit](../uikit/) — [`AppSlider`](../uikit/app-slider)、[`AppSegmented`](../uikit/app-segmented)、[`AppToggle`](../uikit/app-toggle) 及其他用于构建偏好设置行的 UIKit 组件。
