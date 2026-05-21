---
title: Module 設定
description: 使用 Zod 設定綱要與 useModuleContext composable，為你的 module 持久化使用者偏好設定。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# Module 設定

Module 可透過**設定綱要（settings schema）**與 `useModuleContext()` composable 持久化使用者偏好設定。設定儲存於 `config.json → modules[moduleId]`，應用程式重啟後仍會保留。

---

## 定義設定綱要

使用 `@openpen/module-api` 的 `z` 重新匯出，在你的 module 定義上宣告 Zod 綱要：

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

- `settingsSchema` 對任何呼叫 `updateSettings()` 的 module 而言是**必要的**。若未宣告綱要即呼叫 `updateSettings()`，會同步拋出錯誤：`ctx.updateSettings() requires a settingsSchema on the module definition for "<id>"`。只讀取設定（僅呼叫 `getSettings()`）的 module 可省略 `settingsSchema`，在綱要宣告前將收到 `{}`。
- 以 `.default()` 宣告的預設值，會在每次 `getSettings()` 讀取時與已儲存的值合併——有預設值的鍵絕對不會回傳 `undefined`。
- 請使用 `z` 重新匯出；不要另外將 Zod 加為獨立相依套件。

---

## 在 Vue 元件中讀寫設定

從 `@openpen/module-api` 匯入 `useModuleContext`：

```ts
import { useModuleContext } from '@openpen/module-api'
```

`useModuleContext(moduleId)` 回傳一個包含 3 個設定方法的 context 物件：

| 方法 | 功能說明 |
|--------|-------------|
| `getSettings<T>()` | 回傳已與綱要預設值合併的目前設定。 |
| `updateSettings<T>(patch)` | 持久化一個部分 patch。回傳 `Promise`。 |
| `onSettingsChange<T>(cb)` | 訂閱設定變更；回傳取消訂閱函式。 |

### 範例：設定面板元件

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

**請在 `onMounted` 內呼叫 `useModuleContext`，而非在 `<script setup>` 頂層呼叫。** Module context 會在 Vue 元件樹掛載後才完成註冊；在 setup 求值階段呼叫，可能會觸發「尚未註冊」的錯誤。

---

## 在宿主 UI 中顯示偏好設定

宿主為 module 偏好設定提供 2 個 slot。請依複雜度選擇：

| | `settingsPanels` → `ui.settings.panels` | `settingsTabs` → `ui.settings.tabs` |
|---|---|---|
| **顯示位置** | **設定 → 功能**頁面內的標題區塊，與其他 module 並排 | 設定頁面中的獨立頂層分頁 |
| **建議使用時機** | 大多數 module——幾列偏好設定 | 需要深度設定的 module（多個區塊、巢狀版面、預覽區域） |
| **使用者易找程度** | 高——所有 module 偏好設定集中一處 | 較低——使用者必須找到特定分頁 |
| **停用時的可見性** | 自動消失 | 自動消失 |

若不確定，請先使用 `settingsPanels`。之後可以新增獨立分頁，且不會影響使用者資料。

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

宿主會將此元件渲染為「設定 → 功能」下的標題卡片區塊。當 module 停用或移除時，該區塊會自動消失。

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

適用於需要豐富版面配置的 module（多個子區塊、程式碼編輯器、圖片選擇器等）。

---

## 在 `setup()` 中存取設定

`ModuleSetupContext`（`setup()` 的 `ctx` 參數）提供相同的 3 個方法。可在 UI 渲染前用來初始化 module 狀態：

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

在 `setup()` 內註冊的 `onSettingsChange` 訂閱，會在 module 卸載時透過 `ctx.onDispose` 自動清除。

---

## 另請參閱

- [UI slot](../slots/ui) — [`ui.settings.panels`](../slots/ui#ui-settings-panels)、[`ui.settings.tabs`](../slots/ui#ui-settings-tabs) slot 詳細說明。
- [系統 slot](../slots/system) — [`system.shortcuts`](../slots/system#system-shortcuts) slot 詳細說明。
- [UIKit](../uikit/) — [`AppSlider`](../uikit/app-slider)、[`AppSegmented`](../uikit/app-segmented)、[`AppToggle`](../uikit/app-toggle) 及其他用於建立偏好設定列的 UIKit 元件。
