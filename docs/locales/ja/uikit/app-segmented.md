---
title: AppSegmented
description: 相互排他的なオプションに使用する単一選択のセグメントコントロール (ラジオグループ) です。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppSegmented`

単一選択のセグメントコントロール (ラジオグループ) です。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model-value` | `string` | — (**必須**) | 現在選択されている値です ( `v-model` を使用してください) |
| `options` | `Array<{ value: string; label: string; icon?: string }>` | — (**必須**) | 選択可能なオプションの一覧です |
| `disabled` | `boolean` | `false` | すべての操作を無効にし、ミュートスタイルを適用します |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `string` | 選択が変更されたときに発行されます |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const mode = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppSegmented v-model="mode" :options="options" />
</template>
```
