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
npm run build    # outputs dist/renderer.js via @openpen/build (Vite)
```

`@openpen/build` は `vue` と `@openpen/module-api` を外部化するよう Vite を事前設定します — これらはホストによってランタイムで提供されます。バンドルしないでください。

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

OpenPen を再起動すると plugin を確認できます。パッケージ版も、ソースから実行した OpenPen (OpenPen リポジトリのチェックアウトでの `npm run dev`) も、`~/.openpen/plugins/` から plugin を読み込みます。ソースから実行した場合、チェックアウトのバージョンより `minAppVersion` が高い plugin はスキップされます。MCP ツールガイドの [OpenPen run from source](../../../guides/mcp-tools.md#try-it-in-mcp-inspector) を参照してください。

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
2. `plugin.json` に `id`、`name`、`version`、`description`、`minAppVersion` があることを確認します。プロジェクトのひな形にある `description`（「A short description of what your plugin does.」）は、実際の説明に置き換えてください。リストで plugin に表示されるのはこの文章です。`version` は semver、`id` のスコープはリポジトリを所有する GitHub アカウントまたは organization の名前（小文字）と一致する必要があります（`github.com/alice/todo-app` なら `@alice/todo-app`）。スキャナーが比較するのはスコープとリポジトリの所有者だけで、現在ログインしているアカウントは確認しません。organization の場合は、リポジトリがその organization の下にあれば十分です。`create` はスコープを個人のログイン名と比較するため、organization のスコープでは警告が出ることがありますが、コミュニティリストには影響しません。`@openpen` スコープと公式カタログにすでにある id は拒否されます。
3. プロジェクトを公開の GitHub リポジトリに置きます。`git init` を実行し、plugin id のスコープが示すアカウントまたは organization の下にリポジトリを作成して（`@alice/todo-app` なら `alice` の下）push します。例：`gh repo create alice/todo-app --public --source . --push`。リポジトリ名は plugin 名と同じである必要はなく、スコープと比較されるのは所有者だけです。非公開、fork、アーカイブ済みのリポジトリはスキップされます。最初の commit の前に、プロジェクトに `.gitignore` があり、`node_modules/`、`dist/`、`*.zip` が書かれていることを確認し、ビルド成果物と zip がリポジトリに入らないようにします。現在の `create` で作ったプロジェクトにはこのファイルが最初からあります。古い CLI で生成したプロジェクトにだけない場合があり、その場合はこの 3 行で自分で作成してください。同様に、古い CLI で生成したプロジェクトでのみ、生成された README に `../../docs` で始まるリンクがある場合は、ドキュメントサイトの完全な URL `https://openpen.pages.dev/docs/`（例：`https://openpen.pages.dev/docs/guides/publishing`）に置き換えてください。相対リンクは OpenPen リポジトリの中でしか機能しません。プロジェクトの `package.json` にある `"private": true` は `npm publish` を止めるだけで、release やスキャンには影響しません。
4. `create` で生成したプロジェクトで `npm run pack`（内部で `npx openpen-cli pack` を実行）を実行し、zip を添付した `v<version>` の GitHub Release を作成します。例：`gh release create v<version> ./<scope>-<name>-<version>.zip`。zip には `plugin.json`、`dist/`、およびフォルダーがあれば `locales/` が入ります。`pack` の最後に `publish` を実行するよう促すヒントが表示されますが、それは公式カタログの手順なので、コミュニティリストだけなら省略できます。古い一部の CLI はこのヒントを短縮したコマンド名で表示します。コマンド名は常に `npx openpen-cli` です。npm の `openpen` という名前のパッケージは無関係なツールだからです。release は公開済みで、ドラフトやプレリリースであってはいけません。スキャナーは最新 release の最初の `.zip` アセットを使い、zip のルートに `plugin.json` が必要です。`plugin.json` にマーケットプレイス用の画像を書いた場合は、release を作成する前に画像を commit して push してください（下の「マーケットプレイスのアイコン、スクリーンショット、中国語の説明」を参照）。
5. リポジトリに `openpen-plugin` topic を追加します。リポジトリページの About 横の歯車、Topics から、または GitHub CLI で `gh repo edit --add-topic openpen-plugin` を実行します。
6. 次回のスキャンを待ちます。スキャナーが zip をダウンロードし、`plugin.json` を読み、sha256 を自分で計算します。ハッシュや pull request を提出する必要はありません。スキャンは 30 分ごとに実行され、自分で起動することはできないため、最大で約 30 分を見込んでください。掲載を確認するには、カタログリポジトリの [`community/plugins.json`](https://raw.githubusercontent.com/openpen-platform/OpenPen-plugins/main/community/plugins.json) を開いて plugin id を探します。`latestVersion` フィールドに、取り込まれたバージョンが表示されます。

更新を出すには `version` を上げて手順 4 を繰り返します。`plugin.json` の version が掲載中のものより高くない release は無視されます。topic を外す、リポジトリを非公開にする、アーカイブすると、後のスキャンでリストから外れます。

plugin が表示されない場合、スキャナーはカタログリポジトリの `Update community index` workflow の実行ログに、各リポジトリをスキップした理由（`.zip` アセットがない、スコープが所有者と一致しない、ドラフト release など）を記録します。メンテナーは `community/blocklist.json` で特定の plugin、リポジトリ、所有者を除外できます。

### 公式カタログ

公式カタログの plugin は `npx openpen-cli plugin install @scope/name` で id を指定してインストールでき、アプリの Marketplace タブにも表示されます。

公式カタログに登録するには、zip を GitHub Release に添付した後で `npx openpen-cli publish` を実行します。release を確認し、GitHub ログインが plugin id のスコープと一致することを検証したうえで、カタログに対して pull request を開きます。初回の提出は Registration PR、新バージョンは Update PR になります。 組織スコープは `publish` では非対応です。公式の `@openpen` スコープは、組織メンバーがカタログリポジトリへ直接提出します。初回の提出は、マージ前にメンテナーがレビューします。詳しい手順はチュートリアルのセクション 7 の [最初の plugin を作る](../tutorials/build-your-first-plugin.md)、各ステップの動作は [`reference/openpen-cli.md`](../reference/openpen-cli.md) を参照してください。 plugin のリポジトリも個人アカウント配下にあり、plugin 名と同じ名前である必要があります（`publish` は `https://github.com/<your-login>/<plugin-name>` として記録します）。カタログボットはリポジトリの所有者を登録アカウントと照合し、組織や他のアカウントのリポジトリは拒否されます。

### マーケットプレイスのアイコン、スクリーンショット、中国語の説明

`plugin.json` の 3 つの任意フィールド `icon`、`screenshots`、`descriptionLocalized` で、Marketplace に plugin のアイコン、スクリーンショット、中国語の説明を表示できます。コミュニティスキャナーは release zip 内の `plugin.json` からエントリーにコピーします。公式カタログでは、提出する manifest に書く必要があります（下記参照）。サードパーティの plugin では任意で、`@openpen/*` の plugin は 3 つすべてが必須です（下の公式 plugin の掲載要件を参照）。

```json
{
  "id": "@alice/todo-app",
  "name": "Todo App",
  "version": "1.1.0",
  "author": "alice",
  "description": "Keeps a short to-do list on top of the screen you are sharing.",
  "descriptionLocalized": {
    "zh-Hant": "在分享中的畫面上放一份簡短的待辦清單。",
    "zh-Hans": "在共享中的画面上放一份简短的待办清单。"
  },
  "icon": ".github/marketplace/icon.png",
  "screenshots": [
    {
      "src": ".github/marketplace/cover.png",
      "alt": "A to-do list with three items floats over a slide deck."
    },
    {
      "src": ".github/readme-demo.gif",
      "alt": "An item is added, ticked off and dragged to the bottom of the list."
    }
  ],
  "minAppVersion": "1.0.0",
  "renderer": "dist/renderer.js"
}
```

| フィールド | 形式と制限 |
| --- | --- |
| `icon` | リポジトリ内の `.png` ファイルのパス。画像は 256×256 ピクセル、256 KB 以下。 |
| `screenshots` | 1–5 項目の配列で、各項目は `src` と `alt` だけを持ちます。1 項目めは Marketplace カードのカバーで、静止画の `.png`、`.jpg`、`.jpeg` のいずれかである必要があります。残りは `.gif` も使えます。同じ plugin のスクリーンショットはアスペクト比の差が 1% 以内、幅 960 px 以上、1 ファイル 5 MB 以下です。 |
| `src`（と `icon`） | リポジトリ内の相対パスで、区切りは `/`。`/` で始まる、`..` のセグメントを含む、URL である、`https:` などのスキームで始まる、バックスラッシュや制御文字を含む、のいずれも不可です。ファイルは release tag 時点のリポジトリに存在する必要があります。 |
| `alt` | 英語のプレーンテキスト、1–200 文字で、スクリーンショットの内容を書きます。カタログは、ラテン文字を 1 つ以上含み、ほかの文字体系の文字を含まないものを英語とみなします。 |
| `descriptionLocalized` | `zh-Hant`（繁体字中国語）と `zh-Hans`（簡体字中国語）の 2 つのキーだけを持つオブジェクト。値はそれぞれ 1–80 文字のプレーンテキストで、漢字 1 字を 1 文字と数えます。ほかのキーは無視されます。 |
| すべてのテキスト値 | 制御文字や双方向オーバーライド・アイソレート文字（U+202A–U+202E、U+2066–U+2069 など）を含む値はルール違反です。 |

**画像ファイルの置き場所。** release zip に入るのは `plugin.json`、`dist/`、`locales/` だけです。リポジトリのほかの場所（`.github/marketplace/` など）にある画像は zip に入りませんが、`dist/` や `locales/` の下に置いた画像は plugin と一緒に zip に入ります。どちらの場合も、カタログは zip から画像を読みません。カタログは各画像を release tag 時点のリポジトリのファイルにリンクします。URL は `https://raw.githubusercontent.com/<owner>/<repo>/<tag>/<src>`（`icon` も同じ）で、`<tag>` はカタログが読み取った release の tag です。画像は `.github/marketplace/` に置いてください。README のデモ GIF は、たとえば `.github/readme-demo.gif` のようにその場所のまま指定できます。release を作成する前に画像ファイルを commit して push してください。tag がまだない場合、`gh release create v<version> <zip>` はデフォルトブランチの最新 commit から tag を作成します。その後に push した画像はその tag に含まれず、次の release までリンクが切れたままになります。画像が tag に含まれているか確認するには、`git fetch --tags` のあと `git ls-tree -r --name-only v<version>` を実行し、一覧で各画像のパスを探します。または、カタログのエントリーにある各画像の URL をブラウザーで開きます。

**カタログによるフィールドの扱い。**

- コミュニティリスト：スキャナーはルールを満たすフィールドを `community/plugins.json` のエントリーにコピーし、満たさないものは書き込みません。plugin は通常どおり掲載されます。スクリーンショットのどれか 1 つでもルールに違反すると `screenshots` フィールド全体を書き込まないため、2 枚めがカバーに繰り上がることはありません。書き込まなかったフィールドは `Update community index` workflow の実行ログに `drop listing field of <owner>/<repo>: <理由>` の形式で記録されます。スキャナーが確認するのは `plugin.json` の値だけで、画像はダウンロードしません。そのため、画像が tag にない場合やサイズの制限を超える場合は検出されません。結果を確認するには `community/plugins.json` で plugin id を探します。`icon` と各 `screenshots[].src` は release tag を指す URL になっています。
- 公式カタログ：これらのフィールドを自動でコピーする手順はありません。`npx openpen-cli publish` は提出する manifest に書き込まないため、manifest に追加されるまでエントリーにはアイコン、スクリーンショット、中国語の説明がありません。カタログリポジトリの `scripts/sync-listing.mjs` を使うと、release の `plugin.json` から書き込めます。カタログボットは manifest を release 内の `plugin.json` と照合し、manifest にあるフィールドは `plugin.json` から上の表のルールで得られる結果と一致する必要があります。サードパーティの plugin では、manifest にフィールドがなくてもボットのコメントで注記されるだけです。`@openpen/*` の plugin では、`plugin.json` にあって manifest にないフィールドはチェック不合格になります。

**公式 plugin の掲載要件。** `@openpen/*` の plugin は、初回掲載時と毎回の更新時に以下をすべて満たす必要があります。ほかのスコープも従うことを推奨しますが、カタログはこれらが欠けていることを理由にほかのスコープを拒否しません。項目 4 も同様で、カタログはほかのスコープの `description` の書き方を確認しません。

1. `icon` がある：256×256 の PNG で、明るい背景と暗い背景のどちらでも見やすいこと。
2. 1–5 枚の `screenshots` がある：アスペクト比がそろい、幅 960 px 以上で、overlay 上で実際に操作する動画像を 1 枚以上含むこと。plugin の実際の動作だけを示し、個人情報や他社の商標を含まないこと。
3. すべてのスクリーンショットに、内容を説明する `alt` がある。
4. `description` が英語 1 文で 50–155 文字、動詞で始まりピリオドで終わる。
5. `descriptionLocalized` に `zh-Hant` と `zh-Hans` の両方がある。
6. アイコン、スクリーンショット、多言語の説明を `plugin.json` に書き、画像ファイルをリポジトリに入れて release tag とともに公開する。スクリーンショットは README のデモ画像と同じファイルでもかまいません。

カタログの pull request チェック（`scripts/validate-pr.mjs`）は、次のような `@openpen/*` の提出を拒否します：`icon`、`screenshots`、`zh-Hant`、`zh-Hans` のいずれかがない、上の表のルールに違反している、画像が tag にない、ファイルの中身が拡張子と一致しない、カバーが動画像である、アイコンが 256×256 でないか 256 KB を超える、スクリーンショットが 5 MB を超える、幅が 960 px 未満、またはアスペクト比がカバーと 1% を超えて異なる。それ以外の項目はメンテナーが手作業でレビューします：アイコンが見やすいか、スクリーンショットが overlay 上の plugin を示しているか、個人情報と商標、`description` の書き方です。

### Plugin の削除

公式カタログにはセルフサービスの削除手段はありません。`publish` が開くのは Registration PR と Update PR だけで、CLI に yank や tombstone のコマンドもありません。削除を依頼するには、[OpenPen-plugins の Issue](https://github.com/openpen-platform/OpenPen-plugins/issues) に plugin id と理由を書いて起票してください。カタログのメンテナーが plugin の `state` を設定します。

- `yanked`: エントリはカタログに残り、Marketplace にも引き続き表示されます（カードに個別の警告は出ません）。id によるインストール（Marketplace から、または `npx openpen-cli plugin install @scope/name`）は、yank 済みであることを示すメッセージで失敗し、特定の zip URL を直接指定するよう案内されます。
- `tombstoned`: エントリは公開インデックスと Marketplace から外れ、id によるインストールはブロックされます。id は予約されたままで、再登録はできません。tombstone 済み plugin のインストールエラーは、セキュリティ上の理由で完全に削除されたことを示します。

manifest を削除する PR は更新とは扱われず、カタログボットが「メンテナーが判断する」とコメントします。すでにインストールしたユーザーは、`npx openpen-cli plugin remove @scope/name` を実行するまで plugin を使い続けます。コミュニティリストの plugin の外し方は、上のコミュニティリストの節の末尾を参照してください。

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
