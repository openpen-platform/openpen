---
title: スロットカタログ
description: OpenPen が公開している contribution slot 全25件 — 現在安定版17件、v1.1+向け予約済み8件。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# スロットカタログ

OpenPen はドメイン別に整理された25個の contribution slot を公開しています。安定版の slot は現在すぐにランタイムで有効になります。予約済みの slot はバリデーションを通過しますが、まだアクティブなアダプターはありません (前方互換性あり — module は今から対応した状態でリリースできます)。

## ステータス

- ✅ **available** — ランタイムアダプターに接続済み
- ⏳ **reserved** — アダプターなし、v1.1+でリリース予定

## contribution キーと slot id

module は `contributes` にキャメルケースのキーを使用します (`historyCommands`、`themeTokens`)。バリデーターはこれらをドット区切りの slot id (`canvas.history.commands`、`ui.theme.tokens`) にマッピングします。このマッピングは `CONTRIBUTION_KEY_TO_SLOT_ID` に定義されています。

## 全スロット一覧

| Slot id | ドメイン | ステータス | 概要 |
|---|---|---|---|
| [`canvas.tools`](./canvas#canvas-tools) | Canvas | ✅ | ポインターイベントで動作する描画ツール |
| [`canvas.shapes`](./canvas#canvas-shapes) | Canvas | ✅ | 図形プリミティブ (円、矩形、多角形、カスタム) |
| [`canvas.stroke.style`](./canvas#canvas-stroke-style) | Canvas | ✅ | 競合検出のためのストロークスタイルキーの所有権を宣言 |
| [`canvas.history.commands`](./canvas#canvas-history-commands) | Canvas | ⏳ | 組み込み以外のカスタム アンドゥ/リドゥ コマンドタイプ |
| [`canvas.layers.background`](./canvas#canvas-layers-background) | Canvas | ✅ | ストロークの背面にレンダリング (グリッド、ウォーターマーク、背景画像) |
| [`canvas.layers.overlay`](./canvas#canvas-layers-overlay) | Canvas | ✅ | ストロークの前面にレンダリング (ルーラー、スナップガイド、選択ボックス) |
| [`canvas.html.overlay`](./canvas#canvas-html-overlay) | Canvas | ✅ | キャンバス上に HTML / Vue コンポーネントをマウント |
| [`canvas.stroke.transformers`](./canvas#canvas-stroke-transformers) | Canvas | ⏳ | ストローク作成後の後処理 (スムージング、グロー効果) |
| [`ui.control-bar`](./ui#ui-control-bar) | UI | ✅ | コントロールバー内のボタン / スライダー / ポップアップトリガー |
| [`ui.settings.panels`](./ui#ui-settings-panels) | UI | ✅ | 設定ウィンドウの機能タブ内のセクション |
| [`ui.settings.tabs`](./ui#ui-settings-tabs) | UI | ✅ | 設定ウィンドウの専用トップレベルタブ |
| [`ui.cursors`](./ui#ui-cursors) | UI | ✅ | 描画モード中にレンダリングされるツールごとのDOMカーソル |
| [`ui.status`](./ui#ui-status) | UI | ✅ | コントロールバー上のエフェメラルなステータスバッジ |
| [`ui.modals`](./ui#ui-modals) | UI | ✅ | グローバルモーダルスタックで管理される登録済みモーダル |
| [`ui.tray.menu`](./ui#ui-tray-menu) | UI | ⏳ | 組み込みの表示/非表示/終了と並ぶシステムトレイのメニュー項目 |
| [`ui.context.menu`](./ui#ui-context-menu) | UI | ⏳ | キャンバス、ツールバー、トレイの右クリックコンテキストメニュー項目 |
| [`ui.theme.tokens`](./ui#ui-theme-tokens) | UI | ⏳ | module が提供する CSS カスタムプロパティ (カラースウォッチ、トークン) |
| [`system.shortcuts`](./system#system-shortcuts) | System | ✅ | グローバルおよび描画モードのキーボード shortcut |
| [`system.window.behaviors`](./system#system-window-behaviors) | System | ⏳ | メインウィンドウの動作に関するモディファイアー (ピン留め、自動折り畳み) |
| [`system.locales`](./system#system-locales) | System | ✅ | BCP-47タグごとのi18n辞書 contribution |
| [`system.main.handlers`](./system#system-main-handlers) | System | ✅ | メインプロセス機能のためのNode側IPCハンドラー |
| [`system.events`](./system#system-events) | System | ✅ | ドメインイベントのサブスクライブ (stroke-added、tool-changed など) |
| [`system.lifecycle`](./system#system-lifecycle) | System | ✅ | アプリの lifecycle フック (onReady、onSuspend、onQuit) |
| [`system.storage`](./system#system-storage) | System | ⏳ | `~/.openpen/plugins/<id>/data/` の隔離されたデータディレクトリ |
| [`system.file.drop`](./system#system-file-drop) | System | ⏳ | キャンバスにドロップされたファイルのハンドラー |

**合計**: 17件 available · 8件 reserved · 計25件
(Canvas: 6件 available / 2件 reserved · UI: 6件 available / 3件 reserved · System: 5件 available / 3件 reserved)
