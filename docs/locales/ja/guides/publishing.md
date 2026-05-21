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

```bash
mkdir -p ~/.openpen/plugins/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/my-plugin/
# Then restart OpenPen
```

Pluginの読み込みにはプロダクションビルドが必要です（インポートマップは `dist/index.html` にのみ存在します）。まだ行っていない場合は、先にホストをビルドしてください。

```bash
npm run build                              # host + runtime shims
cd packages/my-plugin && npm run build    # plugin
```

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

1. Pluginをビルドし、圧縮した `dist/`、`plugin.json`、`locales/` を含む GitHub Release を公開します（`openpen pack` コマンドでこの zip を生成できます）。
2. ユーザーは `npx openpen-cli plugin add <github-url>` で直接インストールするか、plugin がカタログに登録されたら `npx openpen-cli plugin install @scope/name` でインストールできます。

中央集権的な plugin レジストリはまだ存在しません。コミュニティでの発見可能性は GitHub トピック（`openpen-plugin`）と OpenPen Discussions ボードを通じて行われます。

---

## トラストモデルと責任

Pluginは OpenPen のメインレンダラー内で動作し、以下へのフルアクセスを持ちます。

- 共有 Vue インスタンス（任意のリアクティブステートを変更できます）
- `window.openPenApi`（アプリが公開するすべてのホスト IPC）
- DOM（自分の UI だけでなく、アプリ内のあらゆる UI）
- localStorage / sessionStorage（plugin ごとの分離なし）

OpenPen は**ユーザーインストール型のトラストモデル**を採用しています。パーミッションサンドボックス、コード署名、マーケットプレイス審査はありません。Pluginをインストールしたユーザーは、そのコードへの信頼を拡張することになります。

Plugin 作者として、以下を実施することが推奨されます。

- Pluginが読み取り、書き込み、ネットワーク送信する内容を、plugin 自身の README に記載してください。
- Plugin の目的上明示的に必要でない限り、他の plugin やホストモジュールが所有するステートへの変更を避けてください。
- 外部へのネットワークリクエストを行う場合は、それを明示してください — すべてのリクエストはユーザーのデバッグコンソールに記録され、監査できます。


---

## 関連項目

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — まずローカルで開発する
- [uikit/](../uikit/index.md) — UIKit コンポーネント API
- [slots/](../slots/index.md) — すべての contribution slot
