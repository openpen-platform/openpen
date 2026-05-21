---
title: AppToggle
description: OpenPen のビジュアルスタイルに合わせたブール値のオン/オフスイッチです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppToggle`

ブール値のオン/オフスイッチです。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model-value` | `boolean` | — (**必須**) | 現在の状態 (`v-model` を使用) |
| `aria-label` | `string` | `''` | アクセシブルなラベル |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `boolean` | トグル時に発行されます |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppToggle } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const enabled = ref(false)
</script>

<template>
  <AppToggle v-model="enabled" aria-label="Enable feature" />
</template>
```
