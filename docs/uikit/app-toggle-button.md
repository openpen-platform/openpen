---
title: AppToggleButton
description: A two-state button for options such as bold or italic, exposing its state through aria-pressed.
---

# `AppToggleButton`

A standalone button with two states, pressed and unpressed. Use it for options
that are switched on and off from a toolbar or a settings row, such as bold and
italic. Each button is its own tab stop. For a setting that is a plain on/off
preference, use [`AppToggle`](./app-toggle) instead.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**required**) | Pressed state (use `v-model`) |
| `ariaLabel` | `string` | — (**required**) | Accessible name. Required because the content is often a single glyph or an icon |
| `disabled` | `boolean` | `false` | Disables the button |
| `testid` | `string` | — | `data-testid` of the button |

The default slot is the button content (text or an icon).

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | Emitted with the new pressed state |

## Pressed state and keyboard

Unpressed and pressed differ by fill, border and text colour, not by hue alone:
the pressed button has an accent-tinted fill, a stronger border and primary
text. The state is exposed through `aria-pressed` on the `<button>`.

| Key | Behaviour |
|---|---|
| `Tab` | Moves focus to the next button; every button is its own tab stop |
| `Space` / `Enter` | Presses or releases the focused button |

## Minimal example

```vue
<script setup lang="ts">
import { AppToggleButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const bold = ref(false)
const italic = ref(false)
</script>

<template>
  <AppToggleButton v-model="bold" ariaLabel="Bold" style="font-weight: 700">B</AppToggleButton>
  <AppToggleButton v-model="italic" ariaLabel="Italic" style="font-style: italic">I</AppToggleButton>
</template>
```
