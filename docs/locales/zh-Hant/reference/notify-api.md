---
title: ctx.notify() — Toast 通知 API
description: ModuleSetupContext 上的 ctx.notify() 方法，用於在覆蓋視窗中顯示短暫的 toast 通知。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# ctx.notify() — Toast 通知 API

`ctx.notify()` 是 `ModuleSetupContext` 上的方法，讓 module 能在覆蓋視窗中顯示短暫的 toast 通知——例如，在進入繪圖模式或觸發快捷鍵時提供即時回饋。

---

## 簽章

```typescript
import type { NotifyPayload, NotifyHandle } from '@openpen/module-api'

ctx.notify(payload: NotifyPayload): NotifyHandle
```

---

## `NotifyPayload`

| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `message` | `string` | ✓ | — | 主要訊息，已解析的純字串；i18n 請使用 `ctx.t(key)` |
| `description` | `string` | — | `undefined` | 副標題文字，例如「再按一次可退出」 |
| `icon` | `string` | — | `undefined` | 內嵌 SVG 字串，慣例與 `ToolContribution.icon` 相同 |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | — | `'default'` | 語義色彩變體 |
| `duration` | `number` | — | `1800` | 自動關閉的延遲毫秒數 |

---

## `NotifyHandle`

`ctx.notify()` 回傳一個 `NotifyHandle`，可在 `duration` 到期前關閉通知。

| 方法 | 說明 |
|------|------|
| `dismiss()` | 立即關閉此通知 |

---

## 基本範例

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

## Toast 何時會出現？

> **僅限覆蓋視窗。** Toast 透過 `NotificationLayer` 渲染，而該層僅掛載於覆蓋視窗。若 `ctx.notify()` 在覆蓋視窗未開啟時被呼叫（例如使用者只看到浮球或控制列，或應用程式已收合至系統匣），此呼叫將**靜默無效**——不會報錯，也不會排隊等待顯示。

實際影響：

- **`setup()` 啟動 toast**：呼叫會排隊，但只有在覆蓋視窗成為前景時才會顯示。若需確保首次執行時的提示，請透過自己的 contribution UI（例如控制列的首次懸停提示），而非 `ctx.notify()`。
- **shortcut 處理器**：切換繪圖模式的 shortcut 通常會使覆蓋視窗成為前景，因此在該切換後觸發的 toast 是可靠的。
- **設定視窗 toast**：從設定面板呼叫 `ctx.notify()` 同樣無效——原因相同。

請將 `ctx.notify()` 視為已在繪圖中的使用者回饋層，而非通用公告管道。

---

## i18n 最佳實踐

### 分層：manifest LocaleMap 對比 runtime ctx.t()

OpenPen i18n 分為兩層，遵循業界慣例，將各語言字串檔與有型別的 runtime 映射表分開：

| 層級 | 用途 | 機制 |
|------|------|------|
| **Manifest 中繼資料** | `name`、`description`、contribution `label` 及其他靜態欄位 | `LocaleMap`（`Record<string, string>`） |
| **Runtime 訊息** | `ctx.notify()`、狀態文字及其他動態字串 | `ctx.t(key)` → 純 `string` |

Module manifest 欄位（`name` / `description` / `label`）繼續使用 `LocaleMap`；runtime 訊息必須先透過 `ctx.t()` 解析為純字串再傳入。

### `.`（點號）是 vue-i18n 的巢狀路徑分隔符

**vue-i18n 將 `.` 解讀為巢狀物件路徑。** 這是常見的混淆來源：

```typescript
// Correct: flat key → flat dict
ctx.t('greeting')  // locale dict: { greeting: 'Hello' }

// Correct: dotted key → nested dict
ctx.t('notif.ready')  // locale dict: { notif: { ready: 'Plugin ready' } }

// Wrong: dotted key but dict is a flat string key — never resolves
//    locale dict: { 'notif.ready': 'Plugin ready' }  ← incorrect
```

**規則：**
- 單層 key（無點）→ 扁平字典 `{ greeting: 'Hello' }`
- 階層 key（帶點）→ 巢狀物件字典 `{ notif: { ready: '...' } }`——**不是** `{ 'notif.ready': '...' }`

建議慣例：plugin 語言字典使用巢狀字典（與 i18next / formatjs 一致），第一層依 plugin 功能領域分組。

### contributes.locales 字典格式

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

## 進階範例：提前關閉

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

## 使用者設定

Host 在**設定 → 行為**下提供兩個選項：

| 設定 | 說明 |
|------|------|
| `notifyOnDrawingMode` | 切換繪圖模式時是否顯示內建 HUD 通知（預設：開啟）。僅影響 host 發出的繪圖模式通知；不影響 plugin 呼叫的 `ctx.notify()` |
| `notificationPosition` | Toast 在覆蓋視窗中的顯示位置，使用 9 個位置 token 之一（見下方） |

### 位置 token（`notificationPosition`）

```
top-left      top-center      top-right
middle-left      center      middle-right
bottom-left   bottom-center   bottom-right
```

預設值：`top-center`。

---

## 限制

- `ctx.notify()` **僅在覆蓋視窗中有效**。`NotificationLayer` 僅掛載於該視窗；在 `main` 或 `settings` 視窗的邏輯中呼叫 `notify()` 將被靜默忽略。
- 目前同時顯示的 toast 數量沒有上限；頻繁呼叫將導致畫面堆疊。呼叫端應自行節流控制。

---

## 相關資源

- [`ModuleSetupContext` 完整介面](../../packages/module-api/src/types/module.ts)
- [plugin-quickstart.md](../guides/plugin-quickstart.md) — 五分鐘 plugin 開發指南
- [slots.md](../slots/) — 完整 contribution slot 目錄
