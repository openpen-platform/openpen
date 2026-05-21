---
title: AppTabs
description: アクセシブルなキーボードナビゲーションを備えた、制御型タブコンテンツコンテナです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppTabs`

制御型タブコンテンツコンテナです。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model-value` | `string` | — (**必須**) | アクティブなタブの id (`v-model` で使用) |
| `tabs` | `Array<{ id: string; label: string }>` | — (**必須**) | タブディスクリプターの順序付き配列 |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `string` | アクティブなタブが変更されたときに発行されます |

## スロット

| スロット | スコープ | 説明 |
|---|---|---|
| `default` | `{ activeTabId: string }` | タブコンテンツ領域。アクティブな id で切り替えます |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppTabs } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const tab = ref('general')
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'shortcuts', label: 'Shortcuts' },
]
</script>

<template>
  <AppTabs v-model="tab" :tabs="tabs">
    <template #default="{ activeTabId }">
      <div v-if="activeTabId === 'general'">General settings…</div>
      <div v-else-if="activeTabId === 'shortcuts'">Shortcut settings…</div>
    </template>
  </AppTabs>
</template>
```
