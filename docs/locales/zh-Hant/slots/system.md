---
title: 系統插槽
description: 8 個 contribution 插槽，涵蓋鍵盤快捷鍵、視窗行為、i18n、IPC 處理器、事件、生命週期勾子、儲存，以及檔案拖放。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 系統插槽

系統插槽涵蓋跨領域的基礎設施：鍵盤快捷鍵、視窗行為修飾器、i18n 字典、主程序 IPC 處理器、領域事件訂閱、應用程式 lifecycle 勾子、隔離式儲存，以及檔案拖放處理器。

## `system.shortcuts` — ✅ 可用 {#system-shortcuts}

- **Contribution 鍵**：`shortcuts`
- **型別**：`ShortcutContribution[]`
- **用途**：全域（`scope: 'global'`）與繪圖模式（`scope: 'drawing'`）鍵盤快捷鍵。`'global'` 對應 Electron `globalShortcut`，`'drawing'` 對應 renderer 端的按鍵處理器。

### `ShortcutContribution` 型別

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

- `userCustomizable: true` 且有 `label` 的快捷鍵，會出現在**設定 → 快捷鍵**的 module 群組下，使用者可在此重新綁定按鍵。使用者自訂的按鍵儲存於 `config.json → customShortcuts[moduleId/shortcutId]`。
- `label` 無論 `userCustomizable` 為何都會顯示；省略 `label` 時，該快捷鍵將完全不出現在「快捷鍵」頁籤中。

## `system.window.behaviors` — ⏳ 保留中 {#system-window-behaviors}

- **Contribution 鍵**：`windowBehaviors`
- **型別**：`WindowBehaviorContribution[]`
- **用途**：主視窗行為修飾器（釘選、自動折疊、召喚至游標位置傳送）。
- **保留原因**：renderer 與主程序均尚未實作 runtime adapter。

## `system.locales` — ✅ 可用 {#system-locales}

- **Contribution 鍵**：`locales`
- **型別**：`LocaleContribution`
- **用途**：依 BCP-47 標籤提供 i18n 字典 contribution。解析順序：預設 → 完全符合 → 語言前綴 → en → 第一個已宣告的語言。

## `system.main.handlers` — ✅ 可用 {#system-main-handlers}

- **Contribution 鍵**：`mainHandlers`
- **型別**：`MainHandlerContribution`
- **用途**：主程序端的 IPC 處理器，用於存取主程序能力（檔案 IO、原生 API）。透過 ctx.callMain(action, payload)（內部呼叫 window.openPenApi.moduleCall(moduleId, action, payload)）從 renderer 端路由。主程序處理器來自 plugin.json `main` 欄位所指向的檔案。

## `system.events` — ✅ 可用 {#system-events}

- **Contribution 鍵**：`events`
- **型別**：`EventSubscriptionContribution[]`
- **用途**：訂閱領域事件（`stroke-added`、`tool-changed`、`theme-changed` 等）。與響應式筆觸樣式 store 搭配使用：store 負責狀態快照，事件負責動作觸發。

## `system.lifecycle` — ✅ 可用 {#system-lifecycle}

- **Contribution 鍵**：`lifecycle`
- **型別**：`LifecycleContribution`
- **用途**：應用程式 lifecycle 勾子（`onReady`、`onSuspend`、`onQuit`）。自動儲存／雲端同步類 plugin 必須使用。

## `system.storage` — ⏳ 保留中 {#system-storage}

- **Contribution 鍵**：`storage`
- **型別**：`StorageContribution`
- **用途**：標記此 module 需要一個隔離的資料目錄，位於 `~/.openpen/plugins/<id>/data/`。容量／配額策略由 host runtime 定義。
- **保留原因**：Adapter 尚未啟用；儲存後端設計將由第一個實際使用者驅動（延後至內建或 plugin module 需要 blob 儲存時再實作）。

## `system.file.drop` — ⏳ 保留中 {#system-file-drop}

- **Contribution 鍵**：`fileDrop`
- **型別**：`FileDropContribution[]`
- **用途**：處理拖放至畫布的檔案（圖片戳記、SVG 匯入）。
- **保留原因**：第一個實際使用者為圖片戳記 plugin；延後至該 plugin 開發時再實作。
