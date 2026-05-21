---
title: ctx.notify() — Toast Notification API
description: ModuleSetupContext の ctx.notify() メソッドは、オーバーレイウィンドウに短時間表示されるトースト通知を表示します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# ctx.notify() — Toast Notification API

`ctx.notify()` は `ModuleSetupContext` のメソッドで、オーバーレイウィンドウに短時間のトースト通知を表示できます。たとえば、描画モードへの切り替えやショートカットの実行時に即時フィードバックを提供する目的で使用します。

---

## シグネチャ

```typescript
import type { NotifyPayload, NotifyHandle } from '@openpen/module-api'

ctx.notify(payload: NotifyPayload): NotifyHandle
```

---

## `NotifyPayload`

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `message` | `string` | ✓ | — | メインメッセージ。解決済みのプレーン文字列。i18n には `ctx.t(key)` を使用してください |
| `description` | `string` | — | `undefined` | サブタイトルテキスト。例: "Press again to exit" |
| `icon` | `string` | — | `undefined` | インライン SVG 文字列。`ToolContribution.icon` と同じ規則 |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | — | `'default'` | セマンティックカラーバリアント |
| `duration` | `number` | — | `1800` | 自動消去までの遅延時間 (ミリ秒) |

---

## `NotifyHandle`

`ctx.notify()` は `NotifyHandle` を返します。これを使用すると、`duration` が経過する前に通知を閉じることができます。

| メソッド | 説明 |
|---------|------|
| `dismiss()` | この通知を即座に閉じます |

---

## 基本的な使用例

```typescript
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  name: { en: 'My Plugin' },
  contributes: {
    shortcuts: [
      {
        id: 'my-action',
        keys: 'CommandOrControl+Shift+M',
        scope: 'global',
        handler() {
          // Show a toast when the shortcut fires.
        },
      },
    ],
    locales: {
      en: { notif: { ready: 'My Plugin ready' } },
      'zh-Hant': { notif: { ready: '外掛已就緒' } },
      'zh-Hans': { notif: { ready: '插件已就绪' } },
      ja: { notif: { ready: 'プラグインの準備完了' } },
    },
  },

  setup(ctx) {
    // Show a brief initialisation toast when the module loads.
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
  },
})
```

---

## トーストはいつ表示されるか

> **オーバーレイウィンドウ専用。** トーストは `NotificationLayer` を通じてレンダリングされます。これはオーバーレイウィンドウにのみマウントされます。オーバーレイウィンドウが開いていない状態 (フロートボール/コントロールバーのみ表示中、またはアプリがトレイに格納されている場合など) で `ctx.notify()` が呼び出された場合、その呼び出しは**サイレントに何も行いません** — エラーも、表示のキューイングも発生しません。

実際の影響:

- **`setup()` での起動トースト**: 呼び出しはキューに入りますが、オーバーレイウィンドウがフォアグラウンドのコンテキストになった場合にのみ表示されます。確実に初回起動時のメッセージを表示したい場合は、`ctx.notify()` ではなく、contribution 独自の UI (例: コントロールバーの初回ホバー時のツールチップ) を使用してください。
- **ショートカットハンドラー**: 描画モードを切り替えるショートカットはオーバーレイをフォアグラウンドにする傾向があるため、その切り替え後にトリガーされるトーストは確実に動作します。
- **設定ウィンドウからのトースト**: 設定パネルからの `ctx.notify()` も同じ理由で何も行いません。

`ctx.notify()` は、すでに描画中のユーザーへのフィードバック層として扱い、汎用的なアナウンスチャンネルとして使用しないでください。

---

## i18n ベストプラクティス

### レイヤー構造: manifest の LocaleMap とランタイムの ctx.t()

OpenPen の i18n は 2 つのレイヤーに分かれており、ロケール別の文字列ファイルと型付きランタイムマップを分離するという業界慣例に従っています。

| レイヤー | 目的 | 仕組み |
|---------|------|--------|
| **manifest メタデータ** | `name`、`description`、contribution の `label`、その他の静的フィールド | `LocaleMap` (`Record<string, string>`) |
| **ランタイムメッセージ** | `ctx.notify()`、ステータステキスト、その他の動的文字列 | `ctx.t(key)` → プレーン `string` |

module の manifest フィールド (`name` / `description` / `label`) では引き続き `LocaleMap` を使用します。ランタイムメッセージはプレーン文字列として渡す前に `ctx.t()` で解決する必要があります。

### `.` (ドット) は vue-i18n のネストされたパスセパレーター

**vue-i18n は `.` をネストされたオブジェクトパスとして解釈します。** これはよくある混乱の原因です。

```typescript
// Correct: flat key → flat dict
ctx.t('greeting')  // locale dict: { greeting: 'Hello' }

// Correct: dotted key → nested dict
ctx.t('notif.ready')  // locale dict: { notif: { ready: 'Plugin ready' } }

// Wrong: dotted key but dict is a flat string key — never resolves
//    locale dict: { 'notif.ready': 'Plugin ready' }  ← incorrect
```

**ルール:**
- 単一レベルのキー (ドットなし) → フラットな辞書 `{ greeting: 'Hello' }`
- 階層キー (ドットあり) → ネストされたオブジェクト辞書 `{ notif: { ready: '...' } }` — `{ 'notif.ready': '...' }` では**ありません**

推奨規則: plugin のロケール辞書にはネストされた辞書を使用してください (i18next / formatjs と一貫性があります)。第 1 レベルでは plugin の機能ドメインごとにグループ化します。

### contributes.locales 辞書のフォーマット

```typescript
contributes: {
  locales: {
    en: {
      notif: {
        ready: 'Plugin ready',
        captured: 'Screenshot copied',
      },
    },
    'zh-Hant': {
      notif: {
        ready: '外掛已就緒',
        captured: '已複製截圖',
      },
    },
    'zh-Hans': {
      notif: {
        ready: '插件已就绪',
        captured: '已复制截图',
      },
    },
    ja: {
      notif: {
        ready: 'プラグインの準備完了',
        captured: 'スクリーンショットをコピーしました',
      },
    },
  },
},
```

---

## 応用例: 早期クローズ

```typescript
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  name: { en: 'My Plugin' },
  contributes: {
    locales: {
      en: { notif: { connecting: 'Connecting…', ready: 'Ready' } },
      'zh-Hant': { notif: { connecting: '連線中…', ready: '就緒' } },
    },
  },

  setup(ctx) {
    // Show a notification and dismiss it early when an external event fires.
    const handle = ctx.notify({
      message: ctx.t('notif.connecting'),
      duration: 5000,
    })

    // If the work finishes before the 5-second timeout, dismiss proactively.
    ctx.callMain('initialize').then(() => {
      handle.dismiss()
      ctx.notify({
        message: ctx.t('notif.ready'),
        variant: 'success',
      })
    })
  },
})
```

---

## ユーザー設定

ホストは **設定 → 動作** の下に 2 つのオプションを公開しています。

| 設定 | 説明 |
|------|------|
| `notifyOnDrawingMode` | 描画モードの切り替え時に組み込みの HUD 通知を表示するかどうか (デフォルト: オン)。ホストが発行する描画モード通知にのみ影響します。plugin からの `ctx.notify()` 呼び出しには影響しません |
| `notificationPosition` | オーバーレイウィンドウ内でトーストが表示される位置。9 つのポジショントークンのいずれかを使用します (下記参照) |

### ポジショントークン (`notificationPosition`)

```
top-left      top-center      top-right
middle-left      center      middle-right
bottom-left   bottom-center   bottom-right
```

デフォルト: `top-center`。

---

## 制限事項

- `ctx.notify()` は**オーバーレイウィンドウでのみ動作します**。`NotificationLayer` はそこにのみマウントされるため、`main` ウィンドウや `settings` ウィンドウで実行されるロジックから `notify()` を呼び出しても、サイレントに無視されます。
- 同時に表示できるトーストの上限は現在ありません。頻繁に呼び出すと画面上に積み重なります。呼び出し側で必要に応じてスロットリングを行ってください。

---

## 関連情報

- [`ModuleSetupContext` フルインターフェース](../../packages/module-api/src/types/module.ts)
- [plugin-quickstart.md](../guides/plugin-quickstart.md) — 5 分でできる plugin 開発ガイド
- [slots.md](../slots/) — contribution slot の完全なカタログ
