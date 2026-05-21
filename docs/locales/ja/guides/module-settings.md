---
title: モジュール設定
description: Zod の設定スキーマと useModuleContext コンポーザブルを使って、module のユーザー設定を永続化します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# モジュール設定

module は**設定スキーマ**と `useModuleContext()` コンポーザブルを通じてユーザーの設定を永続化できます。設定は `config.json → modules[moduleId]` に保存され、アプリの再起動後も維持されます。

---

## 設定スキーマを定義する

`@openpen/module-api` の `z` 再エクスポートを使って、module 定義に Zod スキーマを宣言します。

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().min(0).max(1).default(0.8),
    mode: z.enum(['solid', 'gradient']).default('solid'),
  }),
  contributes: { /* ... */ },
})
```

- `settingsSchema` は `updateSettings()` を呼び出す module において**必須**です。スキーマなしで `updateSettings()` を呼び出すと、`ctx.updateSettings() requires a settingsSchema on the module definition for "<id>"` というエラーが同期的にスローされます。`getSettings()` のみを呼び出す読み取り専用 module は `settingsSchema` を省略できますが、スキーマが宣言されるまで `{}` を受け取ります。
- `.default()` で宣言されたデフォルト値は、`getSettings()` を読み取るたびに保存済みの値とマージされるため、デフォルト値を持つキーに対して `undefined` を受け取ることはありません。
- `z` は再エクスポートを使用してください。Zod を別途の依存関係として追加しないでください。

---

## Vue コンポーネントから設定を読み書きする

`@openpen/module-api` から `useModuleContext` をインポートします。

```ts
import { useModuleContext } from '@openpen/module-api'
```

`useModuleContext(moduleId)` は、3 つの設定メソッドを持つコンテキストオブジェクトを返します。

| メソッド | 説明 |
|--------|-------------|
| `getSettings<T>()` | スキーマのデフォルト値とマージされた現在の設定を返します。 |
| `updateSettings<T>(patch)` | 部分的なパッチを永続化します。`Promise` を返します。 |
| `onSettingsChange<T>(cb)` | 設定の変更を購読し、購読解除用の関数を返します。 |

### 例: 設定パネルコンポーネント

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useModuleContext } from '@openpen/module-api'
import { AppSlider, AppSegmented } from '@openpen/module-api/uikit'

type Settings = { opacity: number; mode: 'solid' | 'gradient' }

const opacity = ref(0.8)
const mode = ref<'solid' | 'gradient'>('solid')
let unsub: (() => void) | null = null

onMounted(() => {
  const ctx = useModuleContext('my-plugin')
  const s = ctx.getSettings<Settings>()
  opacity.value = s.opacity
  mode.value = s.mode
  unsub = ctx.onSettingsChange<Settings>((next) => {
    if (next.opacity != null) opacity.value = next.opacity
    if (next.mode) mode.value = next.mode
  })
})

onUnmounted(() => { unsub?.() })

async function setOpacity(v: number) {
  const ctx = useModuleContext('my-plugin')
  opacity.value = v
  await ctx.updateSettings<Settings>({ opacity: v })
}

async function setMode(v: string) {
  const ctx = useModuleContext('my-plugin')
  mode.value = v as Settings['mode']
  await ctx.updateSettings<Settings>({ mode: v as Settings['mode'] })
}
</script>

<template>
  <div>
    <AppSlider :model-value="opacity" :min="0" :max="1" :step="0.05"
               @update:model-value="setOpacity($event)" />
    <AppSegmented
      :model-value="mode"
      :options="[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]"
      @update:model-value="setMode($event)" />
  </div>
</template>
```

**`useModuleContext` は `<script setup>` の先頭ではなく、`onMounted` の内部で呼び出してください。** module のコンテキストは Vue コンポーネントツリーのマウント後に登録されます。セットアップ評価時に呼び出すと、「not registered」エラーが発生する可能性があります。

---

## ホスト UI に設定を表示する

ホストは module の設定用に 2 つの slot を提供しています。複雑さに応じて選択してください。

| | `settingsPanels` → `ui.settings.panels` | `settingsTabs` → `ui.settings.tabs` |
|---|---|---|
| **表示場所** | **設定 → 機能**内のタイトル付きセクションに、他の module とグループ化して表示 | 設定内の専用トップレベルタブ |
| **推奨用途** | ほとんどの module — 少数の設定項目 | 多くのセクション、ネストされたレイアウト、プレビューエリアなど、深い設定が必要な module |
| **ユーザーの発見しやすさ** | 高 — すべての module 設定が 1 箇所に集約 | 低 — 特定のタブを探す必要あり |
| **無効時の表示** | 自動的に非表示 | 自動的に非表示 |

迷った場合は `settingsPanels` から始めてください。ユーザーデータを変更することなく、後から専用タブを追加できます。

### `settingsPanels` を使う

```ts
import { defineModule, z } from '@openpen/module-api'
import MySettingsPanel from './MySettingsPanel.vue'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().default(0.8),
  }),
  contributes: {
    settingsPanels: [{
      id: 'my-plugin-settings',
      label: { en: 'My Plugin', 'zh-Hant': '我的插件' },
      component: MySettingsPanel,
    }],
  },
})
```

ホストは設定 → 機能の下に、タイトル付きカードセクションとしてコンポーネントをレンダリングします。module が無効化または削除されると、セクションは自動的に非表示になります。

### `settingsTabs` を使う

```ts
import { defineModule } from '@openpen/module-api'
import MyFullSettingsTab from './MyFullSettingsTab.vue'

export default defineModule({
  id: 'my-plugin',
  contributes: {
    settingsTabs: [{
      id: 'my-plugin',
      label: { en: 'My Plugin' },
      component: MyFullSettingsTab,
    }],
  },
})
```

複数のサブセクション、コードエディター、画像ピッカーなど、リッチなレイアウトが必要な module に使用してください。

---

## `setup()` 内で設定にアクセスする

`ModuleSetupContext` (`setup()` の `ctx` 引数) は同じ 3 つのメソッドを公開しています。UI がレンダリングされる前に module の状態を初期化するために使用してください。

```ts
export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  setup(ctx) {
    const { opacity } = ctx.getSettings<{ opacity: number }>()
    applyOpacity(opacity)

    ctx.onSettingsChange<{ opacity: number }>(({ opacity }) => {
      if (opacity != null) applyOpacity(opacity)
    })
  },
  contributes: { /* ... */ },
})
```

`setup()` 内で登録された `onSettingsChange` の購読は、module がアンロードされると `ctx.onDispose` を通じて自動的にクリーンアップされます。

---

## 関連項目

- [UI slots](../slots/ui) — [`ui.settings.panels`](../slots/ui#ui-settings-panels)、[`ui.settings.tabs`](../slots/ui#ui-settings-tabs) の slot 詳細。
- [システム slots](../slots/system) — [`system.shortcuts`](../slots/system#system-shortcuts) の slot 詳細。
- [UIKit](../uikit/) — 設定行を構築するための [`AppSlider`](../uikit/app-slider)、[`AppSegmented`](../uikit/app-segmented)、[`AppToggle`](../uikit/app-toggle) などの UIKit コンポーネント。
