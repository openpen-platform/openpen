---
title: AppSelect
description: OpenPen のポップアップスタイルに合わせた単一選択ドロップダウンです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppSelect`

OpenPen のポップアップスタイルに合わせた単一選択ドロップダウンです。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model-value` | `string` | — (**必須**) | 現在選択されている値 (`v-model` で使用) |
| `options` | `Array<{ value: string; label: string }>` | — (**必須**) | 選択可能なオプション |
| `placeholder` | `string` | — (**必須**) | オプションが選択されていない場合に表示されます |
| `disabled` | `boolean` | `false` | インタラクションを無効にします |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `string` | 選択が変更されたときに発火します |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppSelect } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const lang = ref('en')
const options = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
]
</script>

<template>
  <AppSelect v-model="lang" :options="options" placeholder="Pick a language" />
</template>
```
