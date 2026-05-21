---
title: トラストモデル
description: OpenPen の plugin がホストレンダラープロセスへの完全なアクセス権を持つことの意味と、ユーザーとして plugin を安全にインストールする方法。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# トラストモデル

OpenPen の plugin は、ホストレンダラープロセスへの**完全なアクセス権**を持って実行されます。
このページでは、その意味と plugin を安全にインストールする方法を説明します。

---

## ユーザーインストール時のトラスト

plugin をインストールすると、以下へのアクセス権が付与されます。

- `window.openPenApi` への完全なアクセス権 — ホストが公開するすべての IPC 呼び出し
- 共有 Vue インスタンスとすべてのリアクティブ状態への完全なアクセス権
- DOM への完全なアクセス権 — 他の plugin やホストが所有する UI を含む
- `fetch` / `XMLHttpRequest` によるネットワークアクセス

これは意図的な設計判断です。エコシステムの形成期において、plugin は権限の摩擦なく強力な統合機能を構築できます。contribution slot API が実戦で検証される前にサンドボックスを要求しても、現実的なメリットはほとんどなく、plugin 開発を遅らせるだけになります。

### インストール時の安全性

plugin のインストールは純粋なファイル展開であり、インストール中にコードは実行されません。
OpenPen の CLI と GUI はどちらも以下を強制します。

- インストール中に `npm install` / `npm run build` を実行しない
- どの段階でもシェルスクリプトを実行しない
- plugin バンドルにはビルド済みの成果物のみを含める (`plugin.json` + `dist/`)

コードの実行は1回だけ行われます。再起動後にランタイムが plugin を**ロード**するときです。これにより、インストール手順自体にはコード実行のリスクがゼロになります。リスクはロード手順に先送りされ、そこで module ローダーが障害を隔離してロールバックできます。

### ベースラインの保護

OpenPen は以下のベースライン保護を適用します。

| 保護 | 内容 |
|------|------|
| `contextIsolation: true` | Node.js コンテキストとレンダラーコンテキストが分離され、plugin はレンダラーコードから直接 Node.js の raw API を呼び出せない |
| `nodeIntegration: false` | レンダラーで `require('fs')` や `require('path')` は使用不可 |
| `webSecurity: true` | 標準の CORS および混合コンテンツのルールが適用される (Electron のデフォルト。無効化されない) |
| アウトバウンドリクエスト監査ログ | すべての plugin によるアウトバウンド HTTP(S) リクエストは、インメモリ監査ログのリングバッファに記録され、DevTools で openPenApi.getAuditLogEntries() からアクセスできます。専用の UI パネルは計画中です。 |

これらは偶発的な誤用を軽減します。インストールした plugin による意図的な攻撃を**防ぐことはできません**。

---

## このモデルで防げないこと

インストールした plugin は以下が可能です。

- ホームディレクトリ内のファイルを読み取る (`callMain` ブリッジ経由でメインプロセスのハンドラーに接続)
- マシン上の任意のパスにファイルを書き込む
- 任意のサーバーに HTTP リクエストを送信する
- 描画ストロークデータを含む、すべての OpenPen イベントをサブスクライブする
- ホスト UI を任意の方法で変更する — ボタンを非表示にしたり、コンテンツを注入したりすることを含む

**plugin をインストールする前に、ソースを自分で評価してください。** plugin は、自分のマシン上で自分の権限で実行される JavaScript / TypeScript です。GitHub からオープンソースのデスクトップアプリケーションをインストールするのと同様に扱ってください。

### 同じトラストモデルへの記録された攻撃

2026年4月、Elastic Security Labs は Obsidian ユーザーを標的にした **PHANTOMPULSE キャンペーン**を文書化しました。攻撃者はソーシャルエンジニアリングを使い、金融・暗号資産の専門家に悪意のある vault を共有しました。その vault には、攻撃者が制御するコマンドをサイレントに実行するよう事前設定された2つの正規コミュニティ plugin — **Shell Commands** と **Hider** — が含まれていました。

この攻撃は Obsidian 自体の脆弱性を必要としませんでした。設計どおりのトラストモデルを悪用しました。ユーザーが plugin をインストールし、その plugin が任意のシェルコマンドを実行する完全なアクセス権を持っていたのです。

OpenPen のモデルは同じ形状と同じリスク面を持っています。唯一の軽減策は、**インストールするものに対するユーザーの警戒心**だけです。

参考資料:
- [Phantom in the vault — Elastic Security Labs](https://www.elastic.co/security-labs/phantom-in-the-vault)
- [Obsidian Plugin Abuse Delivers PHANTOMPULSE RAT — The Hacker News](https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html)

---

## plugin を安全にインストールする方法

1. **実績のある著名な作者を優先する。** 公開された GitHub の履歴と他の公開プロジェクトを持つ開発者の plugin は、匿名アカウントのものよりリスクがはるかに低いです。

2. **ソースを読む。** plugin は JavaScript / TypeScript で、通常は単一の `dist/renderer.js` ファイルです。読めない、または読む気がない場合は、未知のソースからバイナリを実行するのと同様に扱ってください。

3. **監査ログを確認する。** インストールされた plugin からのネットワークリクエストは監査ログに記録されます。DevTools で openPenApi.getAuditLogEntries() から照会できます。専用の UI パネルは計画中です。予期しない送信先はレッドフラグです。

4. **未使用の plugin をアンインストールする。** 非アクティブな plugin もすべてロードされます。攻撃面を小さくすることで、潜在的なエントリポイントが減ります。

5. **不審な動作を報告する。** plugin が予期しない動作をした場合 — 説明のないネットワーク呼び出し、ファイルの変更、ホスト UI の改変など — 報告してください。
   責任ある開示プロセスについては [`SECURITY.md`](../../SECURITY.md) を参照してください。

---

## 懸念の報告

悪意を持って動作している plugin を発見した場合、または OpenPen の plugin ロードメカニズム自体の脆弱性を発見した場合は、[`SECURITY.md`](../../SECURITY.md) から報告してください。

セキュリティ上の脆弱性について GitHub のパブリックな issue を立てないでください。
