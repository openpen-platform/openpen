---
title: システム slot
description: キーボードショートカット、ウィンドウ動作、i18n、IPC ハンドラー、イベント、ライフサイクルフック、ストレージ、ファイルドロップに対応する 8 つの contribution slot。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# システム slot

システム slot は横断的なインフラを担います。キーボードショートカット、ウィンドウ動作モディファイア、i18n 辞書、メインプロセス IPC ハンドラー、ドメインイベントのサブスクリプション、アプリ lifecycle フック、独立ストレージ、ファイルドロップハンドラーが含まれます。

## `system.shortcuts` — ✅ 利用可能 {#system-shortcuts}

- **Contribution キー**: `shortcuts`
- **型**: `ShortcutContribution[]`
- **目的**: グローバル (`scope: 'global'`) および描画モード (`scope: 'drawing'`) のキーボード shortcut。`'global'` には Electron の `globalShortcut` を、`'drawing'` にはレンダラーのキーハンドラーをラップします。

### `ShortcutContribution` 型

```ts
interface ShortcutContribution {
  id: string                       // unique within this module
  keys: string                     // Electron accelerator string, e.g. 'CommandOrControl+Shift+D'
  scope: 'global' | 'drawing'
  handler(): void
  label?: string | LocaleMap       // human-readable name shown in Settings → Shortcuts
  userCustomizable?: boolean       // default false; set true to let users rebind the key
}
```

- `userCustomizable: true` かつ `label` を持つ shortcut は、**設定 → ショートカット** の module グループ内に表示され、ユーザーがキーを再割り当てできます。ユーザーが選択したキーは `config.json → customShortcuts[moduleId/shortcutId]` に保存されます。
- `label` は `userCustomizable` の値にかかわらず表示されます。省略するとショートカットタブ全体から非表示になります。

## `system.window.behaviors` — ⏳ 予約済み {#system-window-behaviors}

- **Contribution キー**: `windowBehaviors`
- **型**: `WindowBehaviorContribution[]`
- **目的**: メインウィンドウ動作のモディファイア (ピン留め、自動折りたたみ、カーソルへのテレポート召喚)。
- **予約済みの理由**: レンダラーおよびメインプロセスにランタイムアダプターが実装されていません。

## `system.locales` — ✅ 利用可能 {#system-locales}

- **Contribution キー**: `locales`
- **型**: `LocaleContribution`
- **目的**: BCP-47 タグごとの i18n 辞書 contribution。解決の優先順位はデフォルト → 完全一致 → 言語プレフィックス → en → 最初に宣言されたものの順です。

## `system.main.handlers` — ✅ 利用可能 {#system-main-handlers}

- **Contribution キー**: `mainHandlers`
- **型**: `MainHandlerContribution`
- **目的**: メインプロセスの機能 (ファイル IO、ネイティブ API) を扱う Node 側の IPC ハンドラー。`ctx.callMain(action, payload)` (内部的に `window.openPenApi.moduleCall(moduleId, action, payload)` を呼び出す) を介してレンダラーからルーティングされます。メインプロセスのハンドラーは `plugin.json` の `main` フィールドが参照するファイルから提供されます。

## `system.events` — ✅ 利用可能 {#system-events}

- **Contribution キー**: `events`
- **型**: `EventSubscriptionContribution[]`
- **目的**: ドメインイベント (`stroke-added`、`tool-changed`、`theme-changed` など) を購読します。リアクティブなストロークスタイルストアと組み合わせて使用します。ストアは状態スナップショット用、イベントはアクション用です。

## `system.lifecycle` — ✅ 利用可能 {#system-lifecycle}

- **Contribution キー**: `lifecycle`
- **型**: `LifecycleContribution`
- **目的**: アプリ lifecycle フック (`onReady`、`onSuspend`、`onQuit`)。オートセーブやクラウド同期系 plugin に必要です。

## `system.storage` — ⏳ 予約済み {#system-storage}

- **Contribution キー**: `storage`
- **型**: `StorageContribution`
- **目的**: この module が `~/.openpen/plugins/<id>/data/` に独立したデータディレクトリを必要としていることを示すマーカー。容量およびクォータポリシーはホストランタイムが定義します。
- **予約済みの理由**: アダプターはまだ有効になっていません。組み込みまたは plugin module が blob ストレージを必要とするまで、最初の実際のコンシューマーがストレージバックエンドの設計を主導します (実装を延期)。

## `system.file.drop` — ⏳ 予約済み {#system-file-drop}

- **Contribution キー**: `fileDrop`
- **型**: `FileDropContribution[]`
- **目的**: キャンバスにドロップされたファイル (画像スタンプ、SVG インポート) のハンドラー。
- **予約済みの理由**: 最初の実際のコンシューマーは画像スタンプ plugin のため、その時まで実装を延期します。
