---
title: プリミティブ、エスケープハッチ、デザイントークン
description: AppPopover / AppDialog / AppSlider ラッパーを超えたマークアップやスタイルの完全な制御が必要な場合は、Reka UI プリミティブを直接使用してください。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# プリミティブ、エスケープハッチ、デザイントークン、アップストリーム通知

---

## §1 プリミティブ (Layer 2)

アクセシビリティとキーボードナビゲーションを維持しつつ、マークアップ/スタイルを完全に制御するには以下を使用します。

```ts
import {
  // Popover
  PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow,
  // Dialog
  DialogRoot, DialogTrigger, DialogPortal, DialogContent, DialogOverlay,
  // Slider
  SliderRoot, SliderTrack, SliderRange, SliderThumb,
  // Switch (toggle)
  SwitchRoot, SwitchThumb,
  // RadioGroup (segmented control)
  RadioGroupRoot, RadioGroupItem,
  // Select (dropdown)
  SelectRoot, SelectTrigger, SelectPortal, SelectContent, SelectItem,
  // Tooltip
  TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent,
  // Tabs
  TabsRoot, TabsList, TabsTrigger, TabsContent,
  // NumberField — numeric spinner with +/– buttons (no wrapper equivalent)
  NumberFieldRoot, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement,
  // TagsInput — chip / token input (no wrapper equivalent)
  TagsInputRoot, TagsInputInput, TagsInputItem,
  TagsInputItemText, TagsInputItemDelete, TagsInputClear,
  // Combobox — searchable dropdown with free-text (no wrapper equivalent)
  ComboboxRoot, ComboboxAnchor, ComboboxInput, ComboboxTrigger,
  ComboboxPortal, ComboboxContent, ComboboxViewport, ComboboxItem,
  ComboboxItemIndicator, ComboboxGroup, ComboboxLabel,
  ComboboxSeparator, ComboboxEmpty, ComboboxArrow, ComboboxCancel,
} from '@openpen/module-api/uikit'
```

これら3つのプリミティブグループには、対応する Layer 1 ラッパーがありません。
ガイド付きの使用方法と完全なスタイル付きサンプルは
[custom-components.md](./custom-components.md) を参照してください。

**アップストリームドキュメント:**
- NumberField → [reka-ui.com/components/number-field](https://reka-ui.com/docs/components/number-field)
- TagsInput → [reka-ui.com/components/tags-input](https://reka-ui.com/docs/components/tags-input)
- Combobox → [reka-ui.com/components/combobox](https://reka-ui.com/docs/components/combobox)

このレイヤーを使用する場合、plugin 作者は以下を自己管理する必要があります。
- モーダルマネージャーの排他制御 (`MODAL_MANAGER_KEY`)
- ControlBar アニメーションガード (`CONTROL_BAR_ANIMATING_KEY`)
- マウスパススルー登録 (`usePassthroughGuard` from `@openpen/module-api/host`)
- テレポートターゲット (`WRAPPER_EL_KEY`)

---

## §2 エスケープハッチ (Layer 3)

plugin は、自身の `package.json` に任意のヘッドレスまたはコンポーネントライブラリを直接インストールしても構いません。UIKit はこれをブロックしてはなりません。OpenPen のスタイルに視覚的に合わせること、および Electron 固有のエッジケースをすべて処理することは、plugin 作者の責任となります。

---

## §3 デザイントークン

すべてのラッパーは `--openpen-*` CSS 変数を使用します。plugin はホストテーマに合わせるために、これらのトークンを参照しても構いません。

```css
color: var(--openpen-color-text-primary);
background: var(--openpen-color-surface-popup);
border-color: var(--openpen-color-border-hi);
border-radius: var(--openpen-radius-md);
```

トークンの全一覧: `packages/module-api/src/uikit/tokens.css`

---

## §4 ピア依存関係と importmap コントラクト

`vue` と `@openpen/module-api` はすべての plugin の **ピア依存関係** です。これらはホストによって実行時に提供されます。plugin はこれらをバンドルしてはなりません。

### 外部化が必要な理由

ビルド CLI (`@openpen/build`) は、これらのパッケージを外部化するよう Rollup を事前設定します。

```
rollupOptions.external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit']
```

実行時、ホストは `dist/index.html` 内の
[importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
を通じてこれらのベアスペシファイアを解決します。

```json
{
  "imports": {
    "vue": "./openpen-runtime/vue.js",
    "@openpen/module-api": "./openpen-runtime/module-api.js",
    "@openpen/module-api/uikit": "./openpen-runtime/module-api-uikit.js"
  }
}
```

`openpen-runtime/*.js` ファイルは、`npm run build` 実行時 (`scripts/build-runtime.mjs` 経由) に生成される自己完結型の ESM バンドルです。ホストアプリとすべての plugin がこれらのスペシファイアを同じファイルに解決するため、単一の Vue インスタンスを共有します。これにより、境界をまたいだリアクティビティと `provide`/`inject` が正しく動作します。

### plugin 作者のルール

- `vue` と `@openpen/module-api` を外部のままにしておく **必要があります**。バンドルすると2番目の Vue インスタンスが作成され、リアクティビティが壊れ、`inject` も壊れます。
- `@openpen/module-api/uikit` を外部のままにしておく **必要があります**。バンドルするとヘッドレスライブラリの2番目のコピーが生成され、ホストと plugin の境界をまたいで同一性で比較されるシンボルベースの inject キー (`MODAL_MANAGER_KEY`、`WRAPPER_EL_KEY` など) が壊れます。
- `vue`、`@openpen/module-api`、`@openpen/module-api/uikit` を `dependencies` や `bundledDependencies` に追加しては **なりません**。これらは `devDependencies` (または公開可能な plugin パッケージの場合は `peerDependencies`) に記載してください。
- `@openpen/build` (デフォルト) を使用する場合、3つのパッケージはすべて自動的に外部化されます。特別な理由がない限り、`rollupOptions.external` をオーバーライドしないでください。

### plugin のローカルテスト

plugin の読み込みにはプロダクションビルドが必要です (importmap は `dist/index.html` にのみ存在します)。
以下を実行してください。

```bash
npm run build                  # Build host + runtime shims
cd packages/my-plugin && npm run build  # Build plugin
# Then install to ~/.openpen/plugins/ and launch with NODE_ENV=production
```

Vite dev サーバー (`npm run dev`) は plugin を読み込みません。dev ミドルウェアはランタイムシム URL を提供しますが、`~/.openpen/plugins/` にインストールされた plugin は dev モードでスキャンされません。

---

## §5 アップストリーム依存関係の通知

OpenPen UIKit は内部的にヘッドレスライブラリをラップしています。そのライブラリは公開 API サーフェスの **一部ではありません**。基盤となるライブラリが置き換えられた場合でも、ここに記載されているラッパーのプロパティ/イベント/スロットは変更されません。

---

*最終更新: 2026-04-24*
