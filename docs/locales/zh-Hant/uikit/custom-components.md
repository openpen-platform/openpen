---
title: 建立自訂 UIKit 元件
description: 使用 Reka UI 基礎元件與 OpenPen 設計 token，建立 UIKit 封裝層以外的 plugin UI 元件，以確保主題一致性。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 建立自訂 UIKit 元件

本指南說明如何建立 [UIKit 封裝函式庫](./index.md) 中尚未提供的 plugin UI 元件。你將學會何時需要超越封裝層、如何使用設計 token 維持視覺一致性，以及如何將 Reka UI 基礎元件組合成能自動適應深色/淺色主題的完整元件。

---

## 何時使用現有封裝元件，何時自行建立

UIKit 封裝元件涵蓋了控制列與設定面板最常見的需求。在建立自訂元件之前，請先確認是否有現有封裝元件可以滿足需求：

| 需求 | 使用 |
|---|---|
| 在控制列點擊開啟彈出視窗 | `AppPopover` |
| 確認 / 提示對話框 | `AppDialog` / `useDialog()` |
| 數值範圍滑桿 | `AppSlider` |
| 布林值開關 | `AppToggle` |
| 單選按鈕群組 | `AppSegmented` |
| 下拉式清單 | `AppSelect` |
| 游標懸停提示 | `AppTooltip` |
| 分頁內容面板 | `AppTabs` |
| 行內狀態訊息 | `AppBanner` |

當你需要封裝元件集未提供的元件時，才需要建立自訂元件——例如：帶有遞增/遞減按鈕的數字微調器、支援自由文字輸入的下拉搜尋框，或標籤/晶片輸入欄位。

---

## token 優先原則

所有可能因主題而改變的屬性——顏色、陰影、模糊、圓角——都 MUST 使用 `var(--openpen-*)` token。在 plugin CSS 中直接寫入十六進位或 `rgba()` 值是反模式：這會破壞深色/淺色切換，且若 token 日後更新，也會與主程式的色板產生差異。

```css
/* ✅ Theme-aware */
.my-widget {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  color: var(--openpen-color-text-primary);
  border-radius: var(--openpen-radius-md);
  box-shadow: var(--openpen-shadow-sm);
  transition: background var(--openpen-duration-fast) var(--openpen-easing-standard);
}

/* ❌ Hardcoded — breaks in light theme */
.my-widget {
  background: rgba(20, 28, 50, 0.90);
  border: 1px solid rgba(255, 255, 255, 0.20);
  color: #f1f5f9;
}
```

完整的 token 目錄請參閱 [docs/reference/design-tokens.md](../reference/design-tokens.md)。

---

## 存取 Reka UI 基礎元件

尚未被 UIKit 封裝的基礎元件可透過 `@openpen/module-api/uikit` 取得：

```ts
import {
  // NumberField primitives (numeric spinner)
  NumberFieldRoot, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement,
  // TagsInput primitives (chip/tag input)
  TagsInputRoot, TagsInputInput,
  TagsInputItem, TagsInputItemText, TagsInputItemDelete,
  // Combobox primitives (searchable dropdown)
  ComboboxRoot, ComboboxAnchor, ComboboxInput,
  ComboboxContent, ComboboxItem,
} from '@openpen/module-api/uikit'
```

這些元件透過 `primitives.ts` 通道從 Reka UI 重新匯出。透過 `@openpen/module-api/uikit`（而非直接從 `reka-ui`）匯入，可以讓你的 plugin 與未來的函式庫變更隔離。

---

## 範例 1——數字微調器（`NumberFieldRoot`）

帶有遞增/遞減按鈕的數字步進器。適用於需要在範圍內輸入整數的設定（不透明度百分比、網格大小等）。

```vue
<!-- MyNumberSpinner.vue -->
<script setup lang="ts">
import {
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
} from '@openpen/module-api/uikit'

const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <NumberFieldRoot
    :model-value="props.modelValue"
    :min="props.min"
    :max="props.max"
    :step="props.step ?? 1"
    class="spinner-root"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <label v-if="props.label" class="spinner-label">{{ props.label }}</label>
    <div class="spinner-control">
      <NumberFieldDecrement class="spinner-btn" aria-label="Decrease">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 5h6" stroke-linecap="round"/>
        </svg>
      </NumberFieldDecrement>
      <NumberFieldInput class="spinner-input" />
      <NumberFieldIncrement class="spinner-btn" aria-label="Increase">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M5 2v6M2 5h6" stroke-linecap="round"/>
        </svg>
      </NumberFieldIncrement>
    </div>
  </NumberFieldRoot>
</template>

<style scoped>
.spinner-root {
  display: flex;
  flex-direction: column;
  gap: var(--openpen-space-xs);
}

.spinner-label {
  font-size: 11px;
  color: var(--openpen-color-text-dim);
  user-select: none;
}

.spinner-control {
  display: flex;
  align-items: center;
  background: var(--openpen-color-input-bg);
  border: 1px solid var(--openpen-color-border);
  border-radius: var(--openpen-radius-sm);
  overflow: hidden;
  transition: border-color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.spinner-control:focus-within {
  border-color: var(--openpen-color-accent);
}

.spinner-input {
  flex: 1;
  min-width: 0;
  padding: var(--openpen-space-xs) var(--openpen-space-sm);
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--openpen-color-text-primary);
  text-align: center;
}

/* Remove browser-default number spinners */
.spinner-input::-webkit-outer-spin-button,
.spinner-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.spinner-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--openpen-color-text-dim);
  cursor: pointer;
  transition: background var(--openpen-duration-fast) var(--openpen-easing-standard),
              color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.spinner-btn:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.spinner-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
```

在其他元件中使用：

```vue
<script setup lang="ts">
import MyNumberSpinner from './MyNumberSpinner.vue'
import { ref } from 'vue'

const gridSize = ref(8)
</script>

<template>
  <MyNumberSpinner v-model="gridSize" :min="2" :max="64" label="Grid size" />
</template>
```

---

## 範例 2——標籤 / 晶片輸入（`TagsInputRoot`）

多值文字輸入，每個值以可移除的晶片形式顯示。適用於標籤清單、篩選條件組合及關鍵字輸入。

```vue
<!-- MyTagsInput.vue -->
<script setup lang="ts">
import {
  TagsInputRoot,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemText,
  TagsInputItemDelete,
} from '@openpen/module-api/uikit'

const props = defineProps<{
  modelValue: string[]
  placeholder?: string
  delimiter?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
</script>

<template>
  <TagsInputRoot
    :model-value="props.modelValue"
    :delimiter="props.delimiter ?? ','"
    class="tags-root"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <TagsInputItem
      v-for="tag in props.modelValue"
      :key="tag"
      :value="tag"
      class="tag-chip"
    >
      <TagsInputItemText class="tag-text" />
      <TagsInputItemDelete class="tag-delete" aria-label="Remove">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M1 1l6 6M7 1L1 7" stroke-linecap="round"/>
        </svg>
      </TagsInputItemDelete>
    </TagsInputItem>
    <TagsInputInput
      class="tags-input"
      :placeholder="props.placeholder ?? 'Add tag…'"
    />
  </TagsInputRoot>
</template>

<style scoped>
.tags-root {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--openpen-space-xs);
  padding: var(--openpen-space-xs) var(--openpen-space-sm);
  background: var(--openpen-color-input-bg);
  border: 1px solid var(--openpen-color-border);
  border-radius: var(--openpen-radius-sm);
  min-height: 32px;
  transition: border-color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.tags-root:focus-within {
  border-color: var(--openpen-color-accent);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--openpen-space-xs);
  background: var(--openpen-color-accent-bg);
  border: 1px solid var(--openpen-color-accent);
  border-radius: var(--openpen-radius-sm);
  font-size: 11px;
  color: var(--openpen-color-text-primary);
  line-height: 1;
}

.tag-text {
  white-space: nowrap;
}

.tag-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--openpen-color-text-dim);
  transition: color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.tag-delete:hover {
  color: var(--openpen-color-text-primary);
}

.tags-input {
  flex: 1;
  min-width: 80px;
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--openpen-color-text-primary);
  padding: 0;
}

.tags-input::placeholder {
  color: var(--openpen-color-text-muted);
}
</style>
```

---

## 深色 / 淺色主題：自動符合規範

由於所有樣式值均來自 `var(--openpen-*)` token，主程式的 `data-theme` 屬性變更時，每個自訂屬性都會自動重新解析。你的 plugin 程式碼不需要任何 JavaScript、主題監聽器或 `prefers-color-scheme` 媒體查詢。

以下 token 在淺色模式下會翻轉其值（確切的淺色模式值請參閱 [design-tokens.md](../reference/design-tokens.md)）：

- 所有表面、邊框、文字、控制項外框、切換開關及輸入框 token
- 陰影 token
- 狀態顏色變體

以下 token 在淺色模式下**不會改變**——可將其視為常數：

- 強調色 token
- 圓角、間距、動畫時長、緩動函數
- 提示框背景與文字（始終為深色）

---

## 反模式

### 硬編碼顏色

```css
/* ❌ Breaks in light theme, diverges from host palette */
.my-chip { background: rgba(129, 140, 248, 0.18); }

/* ✅ Follows theme automatically */
.my-chip { background: var(--openpen-color-accent-bg); }
```

### 直接匯入 reka-ui

```ts
// ❌ Bypasses the module-api abstraction layer — breaks the import-boundary
//    contract test and ties your plugin to Reka UI's specific version
import { ComboboxRoot } from 'reka-ui'

// ✅ Import through module-api so your plugin survives a headless library swap
import { ComboboxRoot } from '@openpen/module-api/uikit'
```

### 匯入主程式內部元件

```ts
// ❌ Not part of the public API — can break without notice
import SomeHostComponent from 'src/components/SomeHostComponent.vue'

// ✅ Use only @openpen/module-api and @openpen/module-api/uikit
import { AppToggle } from '@openpen/module-api/uikit'
```

### 混用 token 層級

```css
/* ❌ Mixing raw values with tokens makes maintenance error-prone */
.panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid rgba(255, 255, 255, 0.20); /* raw value */
}

/* ✅ Consistent token usage */
.panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
}
```

---

## 參閱

- [UIKit 元件封裝層](./index.md) — 預先建立的高階元件
- [設計 token 參考](../reference/design-tokens.md) — 完整的 `--openpen-*` 目錄
- [基礎元件、逸出艙口與對等相依規則](./primitives.md) — 第 2/3 層存取與 importmap 規則
