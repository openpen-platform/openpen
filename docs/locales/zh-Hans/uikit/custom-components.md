---
title: 构建自定义 UIKit 组件
description: 使用 Reka UI 原语和 OpenPen 设计令牌构建 UIKit 封装库之外的 plugin UI 组件，以保持主题一致性。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00.000Z
language: zh-Hans
---

# 构建自定义 UIKit 组件

本指南介绍如何构建[UIKit 封装库](./index.md)中尚未提供的 plugin UI 组件。你将了解何时需要绕过封装层、如何使用设计令牌保持视觉一致性，以及如何将 Reka UI 原语组合成能自动跟随深色/浅色主题的完整组件。

---

## 何时使用现有封装 vs. 自行构建

UIKit 封装层覆盖了控制栏和设置面板的常见需求。在构建自定义组件之前，请先确认是否有现有封装可以满足需求：

| 需求 | 使用 |
|---|---|
| 控制栏中点击弹出的浮层 | `AppPopover` |
| 确认 / 提示对话框 | `AppDialog` / `useDialog()` |
| 数值范围滑块 | `AppSlider` |
| 布尔开关 | `AppToggle` |
| 单选单选组 | `AppSegmented` |
| 下拉列表 | `AppSelect` |
| 悬停提示 | `AppTooltip` |
| 标签页内容区 | `AppTabs` |
| 内联状态消息 | `AppBanner` |

当你需要封装集合未提供的控件时，再构建自定义组件——例如带增减按钮的数字微调器、支持自由输入的组合框，或标签/芯片输入框。

---

## 令牌优先原则

所有可能在不同主题间变化的属性——颜色、阴影、模糊、圆角——都 MUST 来自 `var(--openpen-*)` 令牌。在 plugin CSS 中直接使用十六进制值或 `rgba()` 是反模式：它们会在深色/浅色切换时失效，并在令牌更新后与宿主调色板产生偏差。

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

完整令牌目录请参见 [docs/reference/design-tokens.md](../reference/design-tokens.md)。

---

## 访问 Reka UI 原语

尚未被 UIKit 封装的原语可通过 `@openpen/module-api/uikit` 获取：

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

这些原语通过 `primitives.ts` 通道从 Reka UI 重新导出。通过 `@openpen/module-api/uikit`（而非直接从 `reka-ui`）导入，可使你的 plugin 免受未来库变更的影响。

---

## 示例 1 — 数字微调器（`NumberFieldRoot`）

带增减按钮的数字步进器。适用于需要在某个范围内输入整数的设置项（不透明度百分比、网格大小等）。

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

在其他组件中使用：

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

## 示例 2 — 标签/芯片输入（`TagsInputRoot`）

一种多值文本输入，每个值以可删除的芯片形式呈现。适用于标签列表、筛选集合和关键词输入。

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

## 深色/浅色主题：自动兼容

由于所有样式值均来自 `var(--openpen-*)` 令牌，宿主的 `data-theme` 属性变更会自动重新解析每个自定义属性。你的 plugin 代码中无需 JavaScript、无需主题监听器、也无需 `prefers-color-scheme` 媒体查询。

以下令牌在浅色模式下会翻转其值（具体浅色模式值请参见 [design-tokens.md](../reference/design-tokens.md)）：

- 所有表面色、边框色、文本色、控件外壳色、开关色和输入框令牌
- 阴影令牌
- 状态颜色变体

以下令牌在浅色模式下**不变**，可将其视为常量：

- 强调色令牌
- 圆角、间距、时长、缓动
- 提示框背景色和文本色（始终为深色）

---

## 反模式

### 硬编码颜色

```css
/* ❌ Breaks in light theme, diverges from host palette */
.my-chip { background: rgba(129, 140, 248, 0.18); }

/* ✅ Follows theme automatically */
.my-chip { background: var(--openpen-color-accent-bg); }
```

### 直接导入 reka-ui

```ts
// ❌ Bypasses the module-api abstraction layer — breaks the import-boundary
//    contract test and ties your plugin to Reka UI's specific version
import { ComboboxRoot } from 'reka-ui'

// ✅ Import through module-api so your plugin survives a headless library swap
import { ComboboxRoot } from '@openpen/module-api/uikit'
```

### 导入宿主内部实现

```ts
// ❌ Not part of the public API — can break without notice
import SomeHostComponent from 'src/components/SomeHostComponent.vue'

// ✅ Use only @openpen/module-api and @openpen/module-api/uikit
import { AppToggle } from '@openpen/module-api/uikit'
```

### 混用令牌层级

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

## 另请参见

- [UIKit 组件封装层](./index.md) — 预构建的高层次组件
- [设计令牌参考](../reference/design-tokens.md) — 完整的 `--openpen-*` 目录
- [原语、逃生舱口与 peer 依赖规则](./primitives.md) — Layer 2/3 访问与 importmap 规则
