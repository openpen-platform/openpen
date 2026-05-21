---
title: AppBanner
description: お知らせ・警告・成功確認・エラーをインライン表示するステータスバナーです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppBanner`

フィードバックメッセージ（お知らせ、警告、成功確認、エラー）をインライン表示するステータスバナーです。ヘッドレス依存なし — 純粋な CSS トークンで動作します。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'success' \| 'error'` | — (**必須**) | 見た目とセマンティクスの意図 |
| `inline` | `boolean` | `false` | 狭いコンテキスト (ダイアログ、フォームフィールド) 向けのコンパクトな1行レイアウト |

## スロット

| スロット | 説明 |
|---|---|
| `default` | バナーのメッセージテキスト |
| `actions` | 末尾に表示されるアクションボタンの行 (省略可能) |

## アクセシビリティ

`variant="error"` は `role="alert"` (アサーティブ — スクリーンリーダーが即座に読み上げ) でレンダリングされます。
その他のバリアントはすべて `role="status"` (ポライト — 次の機会に読み上げ) を使用します。

## 基本的な使用例

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
</script>

<template>
  <!-- Informational -->
  <AppBanner variant="info">Sync completes in the background.</AppBanner>

  <!-- Warning with dismiss action -->
  <AppBanner variant="warning">
    Restart required to apply changes.
    <template #actions>
      <button @click="restart">Restart now</button>
    </template>
  </AppBanner>

  <!-- Success -->
  <AppBanner variant="success">Plugin installed successfully.</AppBanner>

  <!-- Error -->
  <AppBanner variant="error">Installation failed — check permissions.</AppBanner>
</template>
```

## インライン使用例 (ダイアログまたは設定行)

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const error = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="error" variant="error" inline>{{ error }}</AppBanner>
</template>
```

## 動的バリアント

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const variant = ref<BannerVariant>('info')
const message = ref('Ready.')
</script>

<template>
  <AppBanner :variant="variant">{{ message }}</AppBanner>
</template>
```
