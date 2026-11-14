---
title: Pluginの公開
description: OpenPenのpluginをビルドし、インストールして、エンドユーザーに配布します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# Pluginの公開

OpenPenのpluginをビルド、インストール、配布する方法です。

---

## ビルド

```bash
npm run build    # outputs dist/renderer.js via @openpen/build (Rollup)
```

`@openpen/build` は `vue` と `@openpen/module-api` を外部化するよう Rollup を事前設定します — これらはホストによってランタイムで提供されます。バンドルしないでください。

### ピア依存関係のルール

- `vue` と `@openpen/module-api` は必ず外部として維持してください。
  バンドルすると Vue インスタンスが二重になり、リアクティビティが壊れ、`inject` も壊れます。
- `vue` や `@openpen/module-api` を `dependencies` または `bundledDependencies` に追加してはいけません。これらは `devDependencies`（または公開可能な plugin パッケージの場合は `peerDependencies`）に属します。
- `@openpen/build`（デフォルト）を使用している場合、これは自動的に適用されます。
  特定の理由がある場合のみ `rollupOptions.external` を上書きしてください。

---

## ローカルインストール（テスト用）

`npm run build` の後、plugin のディレクトリで次を実行します。`plugin.json`、`dist/`、`locales/` を `~/.openpen/plugins/@scope/name/` にコピーします。

```bash
npx openpen-cli plugin add .
# Then restart OpenPen
```

`plugin add` はインストール前に確認を求めます。非対話型シェルでは `--yes` (または `-y`) を付けてください。

Plugin の読み込みにはパッケージ化された (プロダクション) OpenPen のビルドが必要です。ホストの開発サーバーは plugin を読み込まないため、パッケージ化された OpenPen を再起動して plugin を確認してください。

---

## openpen-cli によるplugin管理

```bash
npx openpen-cli plugin list                  # List installed plugins
npx openpen-cli plugin add <source>          # Install from a local path or GitHub release
npx openpen-cli plugin remove <id>           # Remove by plugin id
```

`<source>` に指定できる値：
- ローカルディレクトリのパス: `./my-plugin` または `/abs/path/to/plugin`
- GitHub リリースの zip URL: `https://github.com/user/repo/releases/download/v1.0.0/plugin.zip`
- GitHub リポジトリ URL: `https://github.com/user/repo` または `github:user/repo`（最新リリースを解決します）

OpenPen の plugin は npm レジストリ経由では配布されません — 上記の GitHub 形式のいずれかを使用してください。完全なコマンドリファレンスは [`reference/openpen-cli.md`](../reference/openpen-cli.md) を参照してください。

---

## 配布

1. Pluginをビルドし、`npx openpen-cli pack` を実行して `dist/`、`plugin.json`、およびフォルダーがあれば `locales/` の zip を生成し、`v<version>` タグの GitHub Release に添付します。
2. ユーザーはその release から `npx openpen-cli plugin add <github-url>` で直接インストールできます。

### 掲載の2つの方法

OpenPen には独立した2つのリストがあります。目的に合う方を選んでください。同じ手順の前後のステップではありません。

| | コミュニティリスト | 公式カタログ |
| --- | --- | --- |
| 掲載の方法 | release を公開し、リポジトリに `openpen-plugin` topic を付ける | `npx openpen-cli publish` を実行して pull request を開く |
| レビュー | なし。スキャナーがパッケージを自動チェックする | 初回提出はメンテナーがレビュー。更新はカタログボットがチェック |
| 反映までの時間 | 次回のスキャン（30分ごと） | pull request のマージ後 |
| 記録先 | カタログリポジトリの `community/plugins.json` | カタログリポジトリの `plugins.json` |

どちらのリストも [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) リポジトリにあります。コミュニティのエントリは公式の `plugins.json` にはマージされません。どちらのリストへの掲載も、コードのセキュリティ監査を意味しません。

### コミュニティリスト

スキャナーは `openpen-plugin` topic が付いた公開 GitHub リポジトリを読み取ります。掲載されるには：

1. plugin を作成します。`npx openpen-cli create @scope/name` でプロジェクトを生成し、`npm install` と `npm run build` で `dist/renderer.js` を作ります。プロジェクトにはサンプルの翻訳（`src/locales/`：`en`、`ja`、`zh-Hans`、`zh-Hant`）が含まれ、`renderer.js` にバンドルされます。残す、編集する、削除するのいずれでも構いません。開発の流れは[クイックスタート](./plugin-quickstart.md)を参照してください。
2. `plugin.json` に `id`、`name`、`version`、`description`、`minAppVersion` があることを確認します。`version` は semver、`id` のスコープはリポジトリを所有する GitHub アカウントまたは organization の名前（小文字）と一致する必要があります（`github.com/alice/todo-app` なら `@alice/todo-app`）。スキャナーが比較するのはスコープとリポジトリの所有者だけで、現在ログインしているアカウントは確認しません。organization の場合は、リポジトリがその organization の下にあれば十分です。`create` はスコープを個人のログイン名と比較するため、organization のスコープでは警告が出ることがありますが、コミュニティリストには影響しません。`@openpen` スコープと公式カタログにすでにある id は拒否されます。
3. リポジトリを公開のままにします。非公開、fork、アーカイブ済みのリポジトリはスキップされます。最初の push の前に、`.gitignore` が `node_modules/`、`dist/`、`*.zip` を除外していることを確認し、ビルド成果物と zip がリポジトリに入らないようにします。生成された README に `../../docs` で始まるリンクがある場合は、完全な URL に置き換えてください。そのリンクは OpenPen リポジトリの中でしか機能しません。プロジェクトの `package.json` にある `"private": true` は `npm publish` を止めるだけで、release やスキャンには影響しません。
4. `create` で生成したプロジェクトで `npm run pack`（内部で `npx openpen-cli pack` を実行）を実行し、zip を添付した `v<version>` の GitHub Release を作成します。例：`gh release create v<version> ./<scope>-<name>-<version>.zip`。zip には `plugin.json`、`dist/`、およびフォルダーがあれば `locales/` が入ります。`pack` の最後に「Run: npx openpen-cli publish」と表示されますが、それは公式カタログの手順なので、コミュニティリストだけなら省略できます。release は公開済みで、ドラフトやプレリリースであってはいけません。スキャナーは最新 release の最初の `.zip` アセットを使い、zip のルートに `plugin.json` が必要です。
5. リポジトリに `openpen-plugin` topic を追加します。リポジトリページの About 横の歯車、Topics から、または GitHub CLI で `gh repo edit --add-topic openpen-plugin` を実行します。
6. 次回のスキャンを待ちます。スキャナーが zip をダウンロードし、`plugin.json` を読み、sha256 を自分で計算します。ハッシュや pull request を提出する必要はありません。スキャンは 30 分ごとに実行され、自分で起動することはできないため、最大で約 30 分を見込んでください。掲載を確認するには、カタログリポジトリの [`community/plugins.json`](https://raw.githubusercontent.com/openpen-platform/OpenPen-plugins/main/community/plugins.json) を開いて plugin id を探します。`latestVersion` フィールドに、取り込まれたバージョンが表示されます。

更新を出すには `version` を上げて手順 4 を繰り返します。`plugin.json` の version が掲載中のものより高くない release は無視されます。topic を外す、リポジトリを非公開にする、アーカイブすると、後のスキャンでリストから外れます。

plugin が表示されない場合、スキャナーはカタログリポジトリの `Update community index` workflow の実行ログに、各リポジトリをスキップした理由（`.zip` アセットがない、スコープが所有者と一致しない、ドラフト release など）を記録します。メンテナーは `community/blocklist.json` で特定の plugin、リポジトリ、所有者を除外できます。

### 公式カタログ

公式カタログの plugin は `npx openpen-cli plugin install @scope/name` で id を指定してインストールでき、アプリの Marketplace タブにも表示されます。

公式カタログに登録するには、zip を GitHub Release に添付した後で `npx openpen-cli publish` を実行します。release を確認し、GitHub ログインが plugin id のスコープと一致することを検証したうえで、カタログに対して pull request を開きます。初回の提出は Registration PR、新バージョンは Update PR になります。初回の提出は、マージ前にメンテナーがレビューします。詳しい手順はチュートリアルのセクション 7 の [最初の plugin を作る](../tutorials/build-your-first-plugin.md)、各ステップの動作は [`reference/openpen-cli.md`](../reference/openpen-cli.md) を参照してください。

---

## トラストモデルと責任

Pluginは OpenPen のメインレンダラー内で動作し、以下へのフルアクセスを持ちます。

- 共有 Vue インスタンス（任意のリアクティブステートを変更できます）
- `window.openPenApi`（アプリが公開するすべてのホスト IPC）
- DOM（自分の UI だけでなく、アプリ内のあらゆる UI）
- localStorage / sessionStorage（plugin ごとの分離なし）

OpenPen は**ユーザーインストール型のトラストモデル**を採用しています。パーミッションサンドボックスとコード署名はなく、カタログのレビューは plugin コードのセキュリティ監査ではありません。Pluginをインストールしたユーザーは、そのコードへの信頼を拡張することになります。

Plugin 作者として、以下を実施することが推奨されます。

- Pluginが読み取り、書き込み、ネットワーク送信する内容を、plugin 自身の README に記載してください。
- Plugin の目的上明示的に必要でない限り、他の plugin やホストモジュールが所有するステートへの変更を避けてください。
- 外部へのネットワークリクエストを行う場合は、それを明示してください — すべてのリクエストはユーザーのデバッグコンソールに記録され、監査できます。


---

## 関連項目

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — まずローカルで開発する
- [uikit/](../uikit/index.md) — UIKit コンポーネント API
- [slots/](../slots/index.md) — すべての contribution slot
