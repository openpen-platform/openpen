---
title: OpenPen モジュールアーキテクチャ
description: ホストの3層コアと contribution-slot システムが、組み込み module とサードパーティ plugin に同一の拡張インターフェースを提供する仕組みについて説明します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# OpenPen モジュールアーキテクチャ

## TL;DR

OpenPenは**ホスト + contribution-slots アーキテクチャ**（以下で説明）と**共有レンダラー信頼モデル**を採用しています。後者では、plugin はホストと並行して動作し、ユーザーが自己責任でインストールします（[`guides/publishing.md`](../guides/publishing.md#trust-model--responsibility)を参照）。この2つの層は分離されており、slot システムと信頼モデルは独立して進化します。

コアにはフレームワークのインフラストラクチャのみが含まれており、ツール、シェイプ、設定パネルの存在を認識しません。組み込みセットとサードパーティ plugin の両方を含むすべての具体的な機能は、同一の `OpenPenModule` インターフェースを実装し、宣言された **slot** を通じてホストに contribute します。新機能の追加にホストの編集は不要で、組み込み module は削除可能であり、plugin 作者は組み込み module と同等の機能を持ちます。

## 3つの層

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 1 — CORE (knows nothing about features)                  │
│   canvas-engine, stroke-store, module-loader, slot-registry,   │
│   settings-store, window-manager, ipc-bridge, i18n-resolver,   │
│   module-runtime, slot-runtime                                 │
└────────────────────────────────────────────────────────────────┘
                            │ same interface
            ┌───────────────┴───────────────┐
            │                               │
┌──────────────────────────┐    ┌──────────────────────────┐
│ LAYER 2 — BUILT-IN       │    │ LAYER 3 — PLUGINS        │
│   modules shipped        │    │ ~/.openpen/plugins/      │
│   with the host          │    │   third-party, runtime   │
│                          │    │   loaded                 │
└──────────────────────────┘    └──────────────────────────┘
```

**組み込み** module と **plugin** module の唯一の構造的な違いは、_配置場所_（リポジトリ内 vs `~/.openpen/plugins/`）と _ガバナンス_（ホストと一緒にリリースされる vs ユーザーがインストールする）です。インターフェース (`OpenPenModule`)、ローダー、バリデーター、ランタイムはすべて同一です。

## OpenPenModule インターフェース

すべての module は `OpenPenModule` を満たす単一のオブジェクトをエクスポートします。

```ts
interface OpenPenModule {
  id: string                                  // globally unique, @scope/name format
  version?: string
  minAppVersion?: string
  metadata?: {
    name: LocaleMap                           // e.g. { en: 'My Plugin', 'zh-Hant': '我的插件' }
    description?: LocaleMap
  }
  setup?(ctx: ModuleSetupContext): void | Promise<void>
  contributes?: ModuleContributions           // at least one field required
  settingsSchema?: z.ZodType                  // user-facing prefs
}
```

設定 → モジュール画面に表示される表示名と説明は、ロケール辞書内の2つの**予約済みキー**から取得され、`contributes.locales` を通じて登録されます。

```ts
contributes: {
  locales: {
    en: { name: 'My Plugin', description: 'What it does.' },
    'zh-Hant': { name: '我的插件', description: '功能說明。' },
  },
}
```

ホストは設定 → モジュール画面のレンダリング時に、アクティブなロケールから `name` と `description` を読み取ります。その他のキーは、`setup()` では `ctx.t()` を通じて、Vue コンポーネントでは `useModuleContext().t()` を通じて module から利用できます。

> **フォールバックとしての `metadata`**: トップレベルの `metadata` フィールド (`metadata.name`、`metadata.description`) は、module が無効になっており `contributes.locales` エントリがホストに接続されていない場合に参照される、i18n に依存しないフォールバックです。上記のロケールベースのアプローチが主要なソースであり、そちらを優先して設定してください。

module を宣言するには `@openpen/module-api` の `defineModule()` を使用してください。完全な型推論が提供され、ホストが contribution オブジェクトを受け取る前にバリデーションが実行されます。

## Contribution slot

**slot** はホスト上の型付き拡張ポイントです。module は `contributes` にフィールドを追加することでオプトインします。

```ts
export default defineModule({
  id: 'stroke-width',
  settingsSchema: z.object({
    defaultWidth: z.number().min(1).max(20).default(4),
    style: z.enum(['slider', 'popup']).default('slider'),
  }),
  contributes: {
    strokeStyle: { provides: ['lineWidth'] },
    controlBar: [{
      id: 'stroke-width-slider',
      component: StrokeWidthSlider,
    }],
    settingsPanels: [{
      id: 'stroke-width-settings',
      label: { en: 'Stroke Width', 'zh-Hant': '筆觸寬度' },
      component: StrokeWidthSettingsPanel,
    }],
  },
})
```

slot カタログ全体は [`slots/index.md`](../slots/index.md) にあります。

### Slot のステータス

- **`available`** — ランタイムアダプターに接続済み。現在使用可能です。
- **`reserved`** — 型と登録は受け付けられますが、アダプターはまだ存在しません。現時点で reserved slot への contribution を含めてリリースできます。アダプターが実装されると自動的に機能し始めます。変更は不要です。

## `@openpen/module-api` が公開するもの

`@openpen/module-api` は module と plugin がホストからインポートできる唯一のパスです。以下をエクスポートします。

- `defineModule()` ヘルパー
- `useModuleContext(moduleId)` — 永続化された module の設定を読み書きするための `getSettings()`、`updateSettings()`、`onSettingsChange()`（[guides/module-settings.md](../guides/module-settings.md)を参照）
- `MODULE_ID_RE` / `isValidModuleId()` — ID フォーマットのバリデーション
- `resolveLabel()` — BCP-47 フォールバック付きで `LocaleMap` を文字列に変換
- すべての slot 定義 (`ALL_SLOTS`、`V1_ACTIVE_SLOTS`、`V1_RESERVED_SLOTS`、`getSlot()`、`isKnownSlot()`)
- すべての TypeScript 型 (`OpenPenModule`、`ModuleContributions`、各 `*Contribution` シェイプ)
- `z` — `settingsSchema` 用の zod の再エクスポート

plugin は `@openpen/module-api` からのみインポートする必要があります。ホストは module の境界でこれを検証し、ホスト内部パスからのインポートをすべて拒否します。

## plugin が読み込まれるまでの流れ

1. **レンダラー起動時**に、`src/core/modules/` から組み込み module を静的にインポートし、IPC 経由で `~/.openpen/plugins/` からサードパーティ plugin の manifest を取得します。
2. **バリデーション**として、プリフライトチェックが実行されます。ID フォーマット、組み込み module と plugin module 間の ID 衝突、slot キーの存在確認、設定スキーマの解析、`minAppVersion` の互換性チェックが行われます。すべてのエラーはまとめて収集・報告されます。
3. **セットアップ**として、各 module の `setup(ctx)` がレンダラーウィンドウごとに1回呼び出されます（オーバーレイ、設定、メインウィンドウはそれぞれ独自のランタイムで動作します）。登録順に実行されます。
4. **Slot の接続**として、各 module の `contributes` が対応するアダプターに接続されます。`controlBar`、`settingsTabs`、`htmlOverlays`、その他のアクティブな slot に contribute された Vue コンポーネントは、それぞれのコンテナにレンダリングされます。

## 関連ドキュメント

- [`slots/index.md`](../slots/index.md) — すべての slot、そのステータス、contribution の形式。
- [`guides/module-settings.md`](../guides/module-settings.md) — `settingsSchema`、`useModuleContext`、`settingsPanels` と `settingsTabs` の違い。
- [`uikit/index.md`](../uikit/index.md) — plugin 作者向け UIKit ラッパー。
- [`uikit/primitives.md`](../uikit/primitives.md) — プリミティブ、デザイントークン、エスケープハッチのガイダンス。
- [`guides/plugin-quickstart.md`](../guides/plugin-quickstart.md) — ゼロから動作する plugin を作成するまで。
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — OpenPen コアへの貢献について。
- `@openpen/module-api` on npm — TypeScript 型と完全な API サーフェス。
