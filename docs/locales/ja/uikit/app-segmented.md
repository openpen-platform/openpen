---
title: AppSegmented
description: 排他的な選択肢のための単一選択セグメントコントロール（radio group）。グレーのトラックの中で選択中のセグメントが浮き上がり、選択肢はテキスト、アイコン付きテキスト、アイコンのみにできます。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
language: ja
---

# `AppSegmented`

単一選択のセグメントコントロール（radio group）です。選択肢は区切り線のない 1 本のグレーのトラックに並び、選択中のセグメントは浮き上がって（明るい背景、細い枠線、やわらかい影）表示されるので、選択状態が色だけでなく形でも分かります。キーボードフォーカスはグループ全体を囲む 1 つの枠で表示されます。

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `model-value` | `string` | — (**必須**) | 現在選択されている値（`v-model` で使用） |
| `options` | `Array<{ value: string; label: string; icon?: string; iconOnly?: boolean; tooltip?: string; testid?: string }>` | — (**必須**) | 選択肢。`icon` はラベルの前に表示する SVG 文字列です。`iconOnly: true` ではアイコンだけを表示し、`label` がアクセシブルネームとツールチップになります。`tooltip` で任意の選択肢にツールチップを設定できます |
| `ariaLabel` | `string` | — | グループ全体のアクセシブルネーム（例：`"Head style"`）。グループに見えるラベルがないときに渡します。`vue-tsc` の strict templates で型チェックされるテンプレート（`openpen-build --check` が使う設定）では `ariaLabel` と書いてください。 |
| `disabled` | `boolean` | `false` | すべての操作を無効にし、薄い表示にします |

## イベント

| イベント | Payload | 説明 |
|---|---|---|
| `update:modelValue` | `string` | 選択が変わったときに発火 |

## 最小の例

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

## アイコンだけの選択肢

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const head = ref('solid')
const options = [
  { value: 'solid', label: 'Solid head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h8M10 4l4 4-4 4z" fill="currentColor" stroke="currentColor"/></svg>', iconOnly: true },
  { value: 'open', label: 'Open head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor"/></svg>', iconOnly: true },
]
</script>

<template>
  <AppSegmented v-model="head" :options="options" ariaLabel="Head style" />
</template>
```
