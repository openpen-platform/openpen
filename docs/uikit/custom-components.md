---
title: Building Custom UIKit Components
description: Build plugin UI components beyond the UIKit wrappers using Reka UI primitives and OpenPen design tokens for theme consistency.
---

# Building Custom UIKit Components

This guide covers how to build plugin UI components that are not available in
the [UIKit wrapper library](./index.md). You will learn when to reach
past the wrappers, how to use design tokens for visual consistency, and how to
compose Reka UI primitives into finished components that follow dark/light theme
automatically.

---

## When to use existing wrappers vs. build your own

The UIKit wrappers cover the most common control-bar and settings-panel needs.
Before building a custom component, check whether an existing wrapper can do
the job:

| Need | Use |
|---|---|
| Click-to-open popup in the control bar | `AppPopover` |
| Confirmation / prompt dialog | `AppDialog` / `useDialog()` |
| Numeric range slider | `AppSlider` |
| Boolean on/off switch | `AppToggle` |
| Single-select radio group | `AppSegmented` |
| Dropdown list | `AppSelect` |
| Hover tooltip | `AppTooltip` |
| Tabbed content pane | `AppTabs` |
| Inline status message | `AppBanner` |

Build a custom component when you need a widget that the wrapper set does not
provide — for example, a numeric spinner with increment/decrement buttons, a
combobox with free-text input, or a tags/chips input field.

---

## The token-first principle

Every property that can vary between themes — colour, shadow, blur, radius —
MUST come from a `var(--openpen-*)` token. Raw hex or `rgba()` values in plugin
CSS are anti-patterns: they break dark/light switching and will diverge from the
host palette if tokens are ever updated.

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

See [docs/reference/design-tokens.md](../reference/design-tokens.md) for the
full token catalogue.

---

## Accessing Reka UI primitives

Primitives not yet wrapped by UIKit are available via `@openpen/module-api/uikit`:

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

These are re-exported from Reka UI via the `primitives.ts` channel. Using them
through `@openpen/module-api/uikit` (not directly from `reka-ui`) keeps your
plugin insulated from future library changes.

---

## Example 1 — Numeric spinner (`NumberFieldRoot`)

A numeric stepper with increment/decrement buttons. Useful for settings that
require integer input within a range (opacity percentage, grid size, etc.).

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

Usage inside another component:

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

## Example 2 — Tags / chip input (`TagsInputRoot`)

A multi-value text input where each value is rendered as a removable chip.
Useful for tag lists, filter sets, and keyword inputs.

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

## Dark / light theme: automatic compliance

Because all style values come from `var(--openpen-*)` tokens, the host's
`data-theme` attribute change automatically re-resolves every custom property.
No JavaScript, no theme watcher, no `prefers-color-scheme` media query needed
in your plugin code.

The following tokens flip their values in light mode (see
[design-tokens.md](../reference/design-tokens.md) for exact light-mode values):

- All surface, border, text, control-chrome, toggle, and input tokens
- Shadow tokens
- State colour variants

These tokens are **unchanged** in light mode — you can treat them as constants:

- Accent tokens
- Radius, spacing, duration, easing
- Tooltip background and text (always dark)

---

## Anti-patterns

### Hardcoding colours

```css
/* ❌ Breaks in light theme, diverges from host palette */
.my-chip { background: rgba(129, 140, 248, 0.18); }

/* ✅ Follows theme automatically */
.my-chip { background: var(--openpen-color-accent-bg); }
```

### Importing reka-ui directly

```ts
// ❌ Bypasses the module-api abstraction layer — breaks the import-boundary
//    contract test and ties your plugin to Reka UI's specific version
import { ComboboxRoot } from 'reka-ui'

// ✅ Import through module-api so your plugin survives a headless library swap
import { ComboboxRoot } from '@openpen/module-api/uikit'
```

### Importing host internals

```ts
// ❌ Not part of the public API — can break without notice
import SomeHostComponent from 'src/components/SomeHostComponent.vue'

// ✅ Use only @openpen/module-api and @openpen/module-api/uikit
import { AppToggle } from '@openpen/module-api/uikit'
```

### Mixing token layers

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

## See also

- [UIKit component wrappers](./index.md) — pre-built high-level components
- [Design tokens reference](../reference/design-tokens.md) — full `--openpen-*` catalogue
- [Primitives, escape hatch & peer dependency rules](./primitives.md) — Layer 2/3 access and importmap rules
