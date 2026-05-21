---
title: openpen CLI
description: plugin のスキャフォールド、インストール、パッケージング、カタログへの公開を行う openpen-cli コマンドラインツール。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# openpen CLI

`openpen` CLI（`openpen-cli` パッケージ）は、OpenPen の plugin インストール、パッケージング、公開を管理します。次のコマンドでインストールできます。

```bash
npm install -g openpen-cli
# or use npx without installing:
npx openpen-cli <command>
```

> **⚠️ 必ず `openpen-cli` として呼び出してください。`openpen` ではありません。** npm 上の bare `openpen` パッケージは無関係なプロジェクトが使用しています — `npx openpen-cli ...` では誤ったツールが取得されます。
> このドキュメント全体において、すべてのコマンドは `npx openpen-cli <verb>` として実行されます。

---

## コマンド

### `openpen create @scope/name`

公式スターターテンプレートから新しい plugin をスキャフォールドします。

**動作:**
1. 入力が `@scope/name` 形式に一致するかを検証します。
2. カレントディレクトリに `name` セグメントの名前（例: `todo-app/`）でサブディレクトリを作成します。
3. plugin スターターテンプレートをコピーし、`plugin.json` に `@scope/name` を埋め込みます。
4. 次のステップを出力します: `npm install` → 開発 → `npm run build` → `openpen pack`。

**認証:** 指定したスコープが認証済み GitHub ログインと一致するかを確認しますが、ブロックはしません。実際のスコープチェックは `openpen publish` 時に行われます。

---

### `openpen pack`

plugin を配布可能な zip ファイルにバンドルします。`plugin.json` が含まれるディレクトリで実行してください。

**前提条件:** `dist/renderer.js` がすでに存在している必要があります — 先にビルドツールを実行してください（例: `npx @openpen/build` または独自のバンドラー）。

**動作:**
1. `plugin.json` を読み込み、`id`（`@scope/name`）と `version` をパースします。
2. `id` の形式を検証し、`dist/renderer.js` が存在するか確認します。
3. `plugin.json` + `dist/` + `locales/`（存在する場合）を収集します。
4. `<scope>-<name>-<version>.zip` を書き出します — たとえば `@alice/todo-app` のバージョン `1.2.0` は `alice-todo-app-1.2.0.zip` になります。
5. 出力パスと SHA-256 ハッシュを出力します。

`openpen pack` はビルドを**実行しません** — 先にビルドツールを呼び出してください。

---

### `openpen publish`

中央の [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) カタログに、登録 PR またはバージョン更新プッシュを送信します。

**前提条件:** `plugin.json` が存在すること、`openpen pack` で作成した zip が存在すること、および `v<version>` の GitHub Release が zip を添付した状態で公開済みであること。

**動作:**
1. `plugin.json` と zip ファイルを検証します。
2. GitHub Release と添付アセットの存在を確認します。
3. 認証済み GitHub ログインが plugin `id` の `scope` と一致するか確認します。
4. zip の SHA-256 を計算します。
5. 初回登録かバージョン更新かを検出します:
   - **新規 plugin** → 登録 PR（`register/<scope>-<name>`）を開きます。マージ前にメンテナーのレビューが必要です。
   - **バージョン更新** → 更新プッシュ PR（`update/<scope>-<name>-<version>`）を開きます。すべてのチェックが通過するとカタログボットが自動的にマージします。
6. PR の URL を出力します。

**認証:** GitHub OAuth トークン、または `GITHUB_TOKEN` 環境変数を使用します。

---

### `openpen plugin install @scope/name`

中央カタログから plugin をダウンロードしてインストールします。

**動作:**
1. カタログから `plugins.json` を取得します。
2. `@scope/name` のエントリを検索し、plugin がヤンクまたはトゥームストーン済みの場合はエラーを報告します。
3. リリース zip をダウンロードします。
4. カタログレコードと照合して SHA-256 ダイジェストを検証します。不一致の場合はダウンロードを中断して削除します。
5. `~/.openpen/plugins/@scope/name/` に展開します。
   ディレクトリがすでに存在する場合は先にバックアップを取り、成功時にバックアップを削除し、失敗時に復元します。
6. 展開された `plugin.json` を検証します。
7. OpenPen の再起動を促します。

---

### `openpen plugin add <source>`

ローカルディレクトリまたはリモートリリースアーティファクトから plugin をインストールします。

**受け付けるソース形式:**

| 形式 | 例 | 動作 |
|------|---------|-----------|
| ローカルパス | `./my-plugin/` | `<path>/dist/`、`<path>/plugin.json`、および `<path>/locales/`（存在する場合）を `~/.openpen/plugins/@<scope>/<name>/` にコピーします。`dist/` が見つからない場合は明確なエラーを報告します。 |
| GitHub リリース zip URL | `https://github.com/owner/repo/releases/download/v1.0.0/plugin.zip` | zip をダウンロードして展開します。 |
| GitHub リポジトリ URL | `https://github.com/owner/repo` | 最新リリースを解決し、その zip アセットからインストールします。 |
| GitHub ショートハンド | `github:owner/repo` | 上記のリポジトリ URL と同様です。 |

**非対応:** npm パッケージ名。OpenPen の plugin は npm レジストリではなく GitHub Releases を通じて配布されます。カタログインストールには `openpen plugin install @scope/name` を、直接インストールには上記の GitHub 形式のいずれかを使用してください。

---

### `openpen plugin list`

`~/.openpen/plugins/` に現在インストールされているすべての plugin を一覧表示します。出力は `@scope/name` 形式を使用します。

---

### `openpen plugin remove @scope/name`

`~/.openpen/plugins/@scope/name/` からディレクトリを削除して plugin をアンインストールします。

---

## Plugin id の形式

すべての OpenPen plugin の id は `@scope/name` の形式です:

- `scope` と `name` はどちらも小文字の ASCII 英字、数字、ハイフンで構成されます。
- 各セグメントの先頭文字は英字または数字（ハイフン以外）でなければなりません。
- 各セグメントは最大 39 文字です。
- 正規表現: `/^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/`

例: `@alice/todo-plugin`、`@openpen/freehand`。

`@openpen/*` および `@core/*` スコープは公式用途のために予約されており、サードパーティによる登録はできません。

---

## 関連情報

- [最初の plugin を作成する](../tutorials/build-your-first-plugin.md)
- [Plugin 公開ガイド](../guides/publishing.md)
- [Contribution Slot カタログ](../slots/)
