---
title: AppTooltip
description: ホバーで表示されるツールチップで、配置する側とオープンのディレイを設定できます。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppTooltip`

ホバーで表示されるツールチップで、配置する側とディレイを設定できます。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `content` | `string` | — (**必須**) | ツールチップのテキスト |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | 優先する配置側 |
| `delay` | `number` | `200` | ホバーからオープンまでのディレイ (ms) |

## スロット

| スロット | 説明 |
|---|---|
| `default` | トリガー要素 (ホバーを受け取る任意の要素) |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppTooltip } from '@openpen/module-api/uikit'
</script>

<template>
  <AppTooltip content="Undo last stroke" side="bottom">
    <button class="cb-btn" aria-label="Undo">↶</button>
  </AppTooltip>
</template>
```

## `AppTooltip` と `AppPopover` を組み合わせる

`AppTooltip` (ホバー) と `AppPopover` (クリック) を組み合わせる場合は、`AppTooltip` を `AppPopover` の `#trigger` スロットの**内側**に配置しなければなりません。これが唯一の安全なネスト順序です。

### この方法が安全な理由

- `AppPopover` は**クリック**で開き、`AppTooltip` は**ホバー**で開きます。2 つのトリガーは相互排他的であり、同時に発火することはありません。
- どちらのコンポーネントも、フローティングパネルを `<body>` にテレポートする自己完結型のポータルです。`AppPopover` は相互排他のために `MODAL_MANAGER_KEY` を使用し、`AppTooltip` は `TooltipProvider` を直接ラップして共有の inject キーを使用しません。一方を他方の内側にネストしてもキーの衝突は発生しません。
- `z-index` のレイヤリングはラッパーコンポーネントがポータルごとに管理しており、2 つのポータルは干渉しません。

### 動作する例

```vue
<script setup lang="ts">
import { AppPopover, AppTooltip } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const opacity = ref(80)
</script>

<template>
  <AppPopover popover-id="opacity-slider" placement="auto">
    <template #trigger="{ active }">
      <!-- AppTooltip wraps the button INSIDE the trigger slot so the
           slot-scope `active` prop remains accessible. -->
      <AppTooltip content="Adjust opacity" side="bottom">
        <button class="cb-btn" :class="{ active }" aria-label="Opacity">
          ◑
        </button>
      </AppTooltip>
    </template>
    <template #content>
      <label>
        Opacity
        <input v-model.number="opacity" type="range" min="0" max="100" />
      </label>
    </template>
  </AppPopover>
</template>
```

> **注意**: クリック時にブラウザが `mouseleave` を発火するため、ツールチップはクリック時に自動的に消えます。そのため、開いたポポーバーパネルとツールチップの間に視覚的な競合は発生しません。

### やってはいけないこと

```vue
<!-- ❌ AppTooltip outside #trigger — loses access to `active` slot scope -->
<AppTooltip content="Adjust opacity" side="bottom">
  <AppPopover popover-id="opacity-slider">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">◑</button>
    </template>
  </AppPopover>
</AppTooltip>
```
