---
title: カスタム UIKit コンポーネントの構築
description: UIKit ラッパーにない plugin UI コンポーネントを、Reka UI プリミティブと OpenPen デザイントークンを使用してテーマの一貫性を保ちながら構築します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# カスタム UIKit コンポーネントの構築

このガイドでは、[UIKit ラッパーライブラリ](./index.md)にない plugin UI コンポーネントを構築する方法を説明します。ラッパーを使わずに対処すべき場面、デザイントークンを使って視覚的な一貫性を保つ方法、そして Reka UI プリミティブを組み合わせてダーク/ライトテーマに自動対応した完成コンポーネントを作る方法を学べます。

---

## 既存ラッパーを使う場合とカスタム構築する場合の判断

UIKit ラッパーは、コントロールバーや設定パネルの最も一般的なニーズをカバーしています。カスタムコンポーネントを構築する前に、既存のラッパーで対応できるかどうかを確認してください。

| ニーズ | 使用するもの |
|---|---|
| コントロールバーでクリックして開くポップアップ | `AppPopover` |
| 確認/プロンプトダイアログ | `AppDialog` / `useDialog()` |
| 数値範囲スライダー | `AppSlider` |
| オン/オフの切り替えスイッチ | `AppToggle` |
| 単一選択ラジオグループ | `AppSegmented` |
| ドロップダウンリスト | `AppSelect` |
| ホバー時のツールチップ | `AppTooltip` |
| タブ付きコンテンツペイン | `AppTabs` |
| インラインステータスメッセージ | `AppBanner` |

ラッパーセットにないウィジェットが必要な場合にカスタムコンポーネントを構築します。たとえば、インクリメント/デクリメントボタン付きの数値スピナー、自由入力テキストのコンボボックス、タグ/チップ入力フィールドなどがその例です。

---

## トークンファースト原則

テーマ間で変わる可能性のあるすべてのプロパティ (色、シャドウ、ブラー、角丸) は、`var(--openpen-*)` トークンから取得しなければなりません。plugin の CSS に生の16進数値や `rgba()` 値を直接記述することはアンチパターンです。そうするとダーク/ライトの切り替えが壊れ、トークンが更新された場合にホストパレットから乖離してしまいます。

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

全トークンのカタログは [docs/reference/design-tokens.md](../reference/design-tokens.md) を参照してください。

---

## Reka UI プリミティブへのアクセス

UIKit にまだラップされていないプリミティブは、`@openpen/module-api/uikit` 経由で利用できます。

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

これらは `primitives.ts` チャンネル経由で Reka UI から再エクスポートされています。`reka-ui` から直接インポートするのではなく `@openpen/module-api/uikit` 経由でインポートすることで、将来のライブラリ変更から plugin を守ることができます。

---

## 例 1 — 数値スピナー (`NumberFieldRoot`)

インクリメント/デクリメントボタン付きの数値ステッパーです。範囲内の整数入力が必要な設定 (不透明度のパーセンテージ、グリッドサイズなど) に便利です。

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

別のコンポーネント内での使用例です。

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

## 例 2 — タグ/チップ入力 (`TagsInputRoot`)

各値が取り外し可能なチップとして表示される複数値テキスト入力です。タグリスト、フィルターセット、キーワード入力に便利です。

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

## ダーク/ライトテーマ: 自動準拠

すべてのスタイル値が `var(--openpen-*)` トークンから取得されているため、ホストの `data-theme` 属性が変わると、すべてのカスタムプロパティが自動的に再解決されます。plugin コードに JavaScript、テーマウォッチャー、`prefers-color-scheme` メディアクエリは必要ありません。

以下のトークンはライトモードで値が切り替わります (正確なライトモードの値は [design-tokens.md](../reference/design-tokens.md) を参照)。

- サーフェス、ボーダー、テキスト、コントロールクローム、トグル、入力に関するすべてのトークン
- シャドウトークン
- 状態カラーバリアント

以下のトークンはライトモードでも**変わりません** — 定数として扱えます。

- アクセントトークン
- 角丸、スペーシング、デュレーション、イージング
- ツールチップの背景とテキスト (常にダーク)

---

## アンチパターン

### 色のハードコード

```css
/* ❌ Breaks in light theme, diverges from host palette */
.my-chip { background: rgba(129, 140, 248, 0.18); }

/* ✅ Follows theme automatically */
.my-chip { background: var(--openpen-color-accent-bg); }
```

### reka-ui を直接インポートする

```ts
// ❌ Bypasses the module-api abstraction layer — breaks the import-boundary
//    contract test and ties your plugin to Reka UI's specific version
import { ComboboxRoot } from 'reka-ui'

// ✅ Import through module-api so your plugin survives a headless library swap
import { ComboboxRoot } from '@openpen/module-api/uikit'
```

### ホスト内部をインポートする

```ts
// ❌ Not part of the public API — can break without notice
import SomeHostComponent from 'src/components/SomeHostComponent.vue'

// ✅ Use only @openpen/module-api and @openpen/module-api/uikit
import { AppToggle } from '@openpen/module-api/uikit'
```

### トークンレイヤーを混在させる

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

## 関連情報

- [UIKit コンポーネントラッパー](./index.md) — 事前構築済みの高レベルコンポーネント
- [デザイントークンリファレンス](../reference/design-tokens.md) — `--openpen-*` の全カタログ
- [プリミティブ、エスケープハッチ、ピア依存ルール](./primitives.md) — レイヤー 2/3 アクセスとインポートマップのルール
