---
title: plugin の互換性
description: plugin がサポートする OpenPen のバージョンを宣言する方法、ホストが plugin をロードするかどうかを判断する方法、および破壊的変更の扱い方。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T02:00:00Z
language: ja
---

# plugin の互換性

plugin がサポートする OpenPen のバージョンを宣言する方法、OpenPen が plugin をロードするかどうかを判断する方法、およびホストと SDK バージョン間での破壊的変更の扱い方について説明します。

---

## TL;DR

- plugin は 2 つのフィールドを通じて互換性を宣言します。module 定義内の `minAppVersion` と、plugin の `package.json` でインポートする `@openpen/module-api` のバージョン範囲です。
- OpenPen は、`minAppVersion` が実行中のホストバージョンより新しい plugin を拒否します。
- SDK (`@openpen/module-api`) は semver に従います。`@openpen/module-api@^1.0.0` をインポートする plugin は、同じマイナーバージョン以上の module-api `1.x` を搭載するすべてのホストで動作します。
- SDK への破壊的変更は、削除前に 1 つのマイナーバージョンの非推奨期間が設けられます。

---

## 2 つの互換性フィールド

### `minAppVersion` — ホストバージョンゲート

plugin が必要とする最小 OpenPen ホストバージョンを `defineModule()` 内で宣言します。

```ts
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  version: '1.2.0',
  minAppVersion: '1.0.0',   // requires OpenPen 1.0.0 or newer
  contributes: {
    // ...
  },
})
```

このフィールドは `OpenPenModule` インターフェース上の `minAppVersion?: string` プロパティに対応します。ロード時に、OpenPen はすべての module に対してプリフライト検証を実行します。

- 実行中のホストバージョンが `minAppVersion` より**古い**場合 → plugin は拒否され、モジュールパネルに明確なエラーがログ出力されます。
- 実行中のホストバージョンが `minAppVersion` と**同じかより新しい**場合 → 検証は次のチェック (id フォーマット、slot の存在確認、設定スキーマなど) に進みます。

このフィールドはオプションです。省略した場合、ホストバージョンゲートは適用されません。

**`minAppVersion` には plugin が実際に必要とする最も古いバージョンを設定してください。** 必要以上に高く設定すると、古い OpenPen ビルドを使用しているユーザーに対して plugin が暗黙的に動作しなくなります。

### `@openpen/module-api` の semver 範囲

plugin の `package.json` で、SDK を開発用依存関係 (または公開可能なパッケージの場合はピア依存関係) として宣言します。

```json
{
  "devDependencies": {
    "@openpen/module-api": "^1.0.0"
  }
}
```

ホストは `@openpen/module-api` 独自のコピーを同梱し、実行時にインポートマップ (`dist/openpen-runtime/module-api.js`) を通じて plugin に公開します。plugin は `@openpen/module-api` をバンドルしては**なりません** — `@openpen/build` がパッケージを外部化することでこれを自動的に強制します。plugin のビルドに使用したバージョンが依存する API サーフェスを決定しますが、実際に実行されるのはホストに同梱されたバージョンです。

ビルド設定の詳細については、[公開](../guides/publishing.md) を参照してください。

---

## 互換性マトリクス

OpenPen のモノレポは、すべてのパッケージを**一括**でリリースします — ホストアプリ、SDK、ビルド CLI、インストール CLI は、すべての安定リリースで同じバージョンを共有します。plugin 作者が追跡する必要があるのは**1 つ**のバージョン番号だけです。

| OpenPen ホスト | `@openpen/module-api` | `@openpen/build` | `openpen-cli` |
|---|---|---|---|
| 1.x (現在) | 1.x | 1.x | 1.x |
| pre-1.0 (内部) | (安定した契約なし) | — | — |

リリースノート、GitHub タグ、`package.json` など、どこかで "OpenPen 1.4.2" と表記されている場合 — モノレポ内のすべてのパッケージが同日に正確にそのバージョンになっています。

---

## 破壊的変更ポリシー

SDK と contribution slot API に対する OpenPen の互換性コミットメント:

- **パッチリリース (x.x.N)** — バグ修正のみ。`OpenPenModule` インターフェース、`ModuleSetupContext`、slot の形状、UIKit コンポーネントのプロパティ/イベント/スロットへの変更はありません。
- **マイナーリリース (x.N.0)** — 追加変更のみ。新しいフィールド、新しい slot、新しい UIKit コンポーネント。既存の plugin は変更なしで引き続き動作します。
- **メジャーリリース (N.0.0)** — 破壊的変更が含まれる場合があります。plugin の更新が必要になる場合があります。移行パスは文書化されます。

### 非推奨化プロセス

API サーフェスの形状が変化する場合 (slot フィールドの名前変更、`ModuleSetupContext` メソッドの置き換え、UIKit コンポーネントプロパティの削除):

1. 非推奨化は**マイナーリリース**で、古い API に `@deprecated` JSDoc タグと、それを使用する各 module に対して 1 回出力されるランタイム `console.warn` とともにリリースされます。
2. 非推奨化された API は**少なくとも 1 つのフルマイナーリリースサイクル**の間は機能し続けます。
3. 削除は次の**メジャーリリース**で行われ、`CHANGELOG.md` の "Breaking" セクションに移行ガイドとともに記載されます。

---

## plugin ライセンスの自由

OpenPen はレイヤードライセンスモデルを採用しています。ホストは Plugin Linking Exception 付きの GPL-3.0-or-later であり、SDK パッケージ (`@openpen/module-api`、`@openpen/build`、`openpen-cli`) は MIT ライセンスです。

つまり:

- plugin は、プロプライエタリおよびクローズドソースの商用ライセンスを含む、**あらゆるライセンス**を使用できます。
- plugin を独自の条件で販売できます。
- GPL への準拠が必要なのは、OpenPen ホスト自体を変更する場合のみであり、plugin を作成する場合は不要です。

Plugin Linking Exception の正確な文言についてはルートの [`LICENSE`](../../LICENSE) ファイルを、レイヤードライセンスの概要については [`README.md`](../../README.md#license) を参照してください。

---

## plugin ランタイムの制約

OpenPen は macOS の `hardenedRuntime` を有効にした状態でリリースされます (Gatekeeper で保護されたシステムでの Apple 公証に必要)。これは plugin が実行時に同梱できるものに影響します。

- **plugin は純粋な JavaScript / TypeScript でなければなりません。** ネイティブ Node.js アドオン (`.node` ファイル)、共有ライブラリ、または実行時にロードされる署名なしバイナリコードは macOS Gatekeeper によってブロックされます。`@openpen/build` ツールチェーン (Vite + Vue) は `.ts`、`.vue`、`.css` に対応しており、これらはプレーンな JS にコンパイルされて問題なく同梱できます。
- **外部への `fetch` / `XMLHttpRequest` は許可されています**が、OpenPen の監査ログに記録されます。詳細は [トラストモデル](./trust-model.md) を参照してください。
- **plugin コードからのサブプロセス起動は不可です。** plugin は `child_process` を通じて別のバイナリを起動できません (レンダラーはこれを公開しておらず、プリロードブリッジもプロキシしません)。

ネイティブコードを必要とする plugin をリリースする必要がある場合は、Issue を開いてください — これには現在のリリースラインのスコープ外であるホストレベルの変更 (例: 別の署名済みヘルパープロセス) が必要になります。

---

## plugin 作者のベストプラクティス

- **`minAppVersion` は最新ではなく実際の最小バージョンに固定してください。** plugin が `1.0.0` 以降に存在する API のみを使用している場合は、`minAppVersion: '1.0.0'` と記述します。現在のリリースに設定すると、理由なく古いビルドのユーザーがブロックされます。

- **`@openpen/module-api` にはキャレット範囲を使用してください** (`^1.0.0`)。キャレットは互換性のあるパッチおよびマイナーアップデートを許可しながら、メジャーバージョンの破壊的変更から保護します。完全固定 (`1.0.0`) を使用するとバグ修正を自動的に受け取れなくなります。

- **`@openpen/module-api` や `vue` をバンドルしないでください。** ホストはインポートマップを通じて両方を提供します。バンドルすると 2 つ目の Vue インスタンスが生成され、リアクティビティと `inject()` が壊れます。`@openpen/build` を使用している場合は自動的に強制されます。

- **宣言した最も低い `minAppVersion` に対してテストしてください。** より新しいマイナーバージョンにしか存在しない API を呼び出しておきながら、古いホストとの互換性を主張しないでください。

- **GitHub で OpenPen のリリースをサブスクライブしてください**。削除になる前に非推奨の警告を把握できます。

### plugin id の命名

plugin id は npm スコープ形式 `@scope/name` (例: `@acme/sticky-notes`) に従わなければなりません。これはディスク上のレイアウト `~/.openpen/plugins/@scope/name/plugin.json` に対応しています。

2 つのインストール済み plugin が同じ id を宣言した場合、OpenPen は**先勝ち**ルールを適用します。最初に検出された plugin (アルファベット順スキャン順) がロードされ、残りは警告トーストとコンソールログとともにスキップされます。組み込み module の id は予約済みです — 組み込み id を主張する plugin は常にスキップされる側であり、組み込みがスキップされることはありません。

他の plugin との暗黙的な衝突を避けるために:

- **管理しているユニークなスコープを使用してください** — GitHub org、npm org、またはドメイン由来のプレフィックス。汎用スコープ (`@plugins`、`@openpen`、`@util`) は同じショートカットを選んだ他の全員と衝突します。
- **公式ステータスを示唆するスコープ名を避けてください** (`@openpen-official`、`@openpen-team` など)。実際に OpenPen をメンテナンスしている場合を除きます。
- **plugin id は永続的なものとして扱ってください。** id の名前変更はユーザーのインストールを壊し、`installedAt` 履歴も失われます。長く使える名前を選んでください。

---

## `plugin-meta.json` の管理

OpenPen はユーザーデータディレクトリ (macOS では `~/Library/Application Support/openpen/plugin-meta.json`、Windows・Linux では対応する場所) に `plugin-meta.json` キャッシュを管理します。このキャッシュは `installedAt` などのプラグインごとのメタデータを追跡します。

ホストは**起動時に `~/.openpen/plugins/` をスキャンしてキャッシュを再構築します**。CLI (`openpen-cli plugin add` / `npm run install` パス) は `plugin-meta.json` に**書き込みません** — `~/.openpen/plugins/<scope>/<name>/` 配下にファイルを配置するだけです。

実際の影響:

- `openpen-cli plugin add .` が返った後、plugin はディスク上に存在しますが**メタデータキャッシュにはまだ含まれていません**。キャッシュに反映されるまで OpenPen を起動 (または再起動) してください。
- インストールが反映されたか確認するには:
  - `npx openpen-cli plugin list` はオンディスクの plugins ディレクトリを直接スキャンします
  - OpenPen を開いて **設定 → モジュール** を確認します
- `plugin-meta.json` を手動で編集することはサポートされていません。次回のホスト起動時に編集内容は上書きされます。

## OpenPen が意図せず何かを壊した場合

意図しないホスト側の破損はバグです。以下の情報とともに `https://github.com/openpen-platform/openpen/issues` に Issue を開いてください。

- plugin の `id`、`version`、`minAppVersion`
- OpenPen ホストバージョン (`設定 → バージョン情報` または `openpen --version`)
- 最小限の再現手順 (plugin id + 再現手順)

意図しない破損はリリースブロッカーパッチとして扱われます。

---

## 関連情報

- [module アーキテクチャ](./module-architecture.md) — ホスト / module / plugin のレイヤー構造、ロードライフサイクル、完全な `OpenPenModule` インターフェース
- [トラストモデル](./trust-model.md) — plugin がアクセスできるものと安全なインストール方法
- [公開](../guides/publishing.md) — plugin のビルドと配布
- [plugin クイックスタート](../guides/plugin-quickstart.md) — ゼロから動作する plugin まで
