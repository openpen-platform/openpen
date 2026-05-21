---
title: 插槽目錄
description: OpenPen 公開的 25 個貢獻插槽 — 目前 17 個穩定可用，8 個保留至 v1.1+。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 插槽目錄

OpenPen 公開 25 個貢獻插槽，依領域分組。穩定插槽在執行期立即生效；保留插槽可通過驗證，但尚無對應的 adapter（向前相容 — module 現在即可針對這些插槽發布）。

## 狀態

- ✅ **available** — 已接通執行期 adapter
- ⏳ **reserved** — 尚無 adapter，將於 v1.1+ 提供

## 貢獻鍵與插槽 id

Module 在 `contributes` 上使用易讀的 camelCase 鍵（`historyCommands`、`themeTokens`）；驗證器會將它們對應到以點號分隔的插槽 id（`canvas.history.commands`、`ui.theme.tokens`）。對應關係定義於 `CONTRIBUTION_KEY_TO_SLOT_ID`。

## 所有插槽

| 插槽 id | 領域 | 狀態 | 簡述 |
|---|---|---|---|
| [`canvas.tools`](./canvas#canvas-tools) | Canvas | ✅ | 由指標事件驅動的繪圖工具 |
| [`canvas.shapes`](./canvas#canvas-shapes) | Canvas | ✅ | 形狀基元（圓形、矩形、多邊形、自訂） |
| [`canvas.stroke.style`](./canvas#canvas-stroke-style) | Canvas | ✅ | 宣告筆畫樣式鍵的所有權，用於衝突偵測 |
| [`canvas.history.commands`](./canvas#canvas-history-commands) | Canvas | ⏳ | 超出內建項目的自訂復原/重做指令類型 |
| [`canvas.layers.background`](./canvas#canvas-layers-background) | Canvas | ✅ | 在筆畫下方渲染（格線、浮水印、背景圖片） |
| [`canvas.layers.overlay`](./canvas#canvas-layers-overlay) | Canvas | ✅ | 在筆畫上方渲染（尺規、對齊參考線、選取框） |
| [`canvas.html.overlay`](./canvas#canvas-html-overlay) | Canvas | ✅ | 在畫布上方掛載 HTML / Vue 元件 |
| [`canvas.stroke.transformers`](./canvas#canvas-stroke-transformers) | Canvas | ⏳ | 在筆畫建立後進行後處理（平滑化、發光效果） |
| [`ui.control-bar`](./ui#ui-control-bar) | UI | ✅ | 控制列中的按鈕、滑桿、彈出觸發器 |
| [`ui.settings.panels`](./ui#ui-settings-panels) | UI | ✅ | 設定視窗「功能」分頁中的區段 |
| [`ui.settings.tabs`](./ui#ui-settings-tabs) | UI | ✅ | 設定視窗中的專屬頂層分頁 |
| [`ui.cursors`](./ui#ui-cursors) | UI | ✅ | 繪圖模式啟用時，依工具顯示的 DOM 游標 |
| [`ui.status`](./ui#ui-status) | UI | ✅ | 控制列上的短暫狀態標籤 |
| [`ui.modals`](./ui#ui-modals) | UI | ✅ | 由全域 modal 堆疊管理的已註冊 modal |
| [`ui.tray.menu`](./ui#ui-tray-menu) | UI | ⏳ | 系統匣選單項目，與內建的顯示 / 隱藏 / 結束並列 |
| [`ui.context.menu`](./ui#ui-context-menu) | UI | ⏳ | 畫布、工具列或系統匣上的右鍵選單項目 |
| [`ui.theme.tokens`](./ui#ui-theme-tokens) | UI | ⏳ | module 提供的 CSS 自訂屬性（色票、token） |
| [`system.shortcuts`](./system#system-shortcuts) | System | ✅ | 全域及繪圖模式鍵盤快捷鍵 |
| [`system.window.behaviors`](./system#system-window-behaviors) | System | ⏳ | 主視窗行為的修飾器（釘選、自動收合） |
| [`system.locales`](./system#system-locales) | System | ✅ | 依 BCP-47 標籤貢獻 i18n 詞典 |
| [`system.main.handlers`](./system#system-main-handlers) | System | ✅ | 主程序能力的 Node 端 IPC 處理器 |
| [`system.events`](./system#system-events) | System | ✅ | 訂閱領域事件（stroke-added、tool-changed、…） |
| [`system.lifecycle`](./system#system-lifecycle) | System | ✅ | 應用程式 lifecycle 鉤子（onReady、onSuspend、onQuit） |
| [`system.storage`](./system#system-storage) | System | ⏳ | 位於 `~/.openpen/plugins/<id>/data/` 的隔離資料夾 |
| [`system.file.drop`](./system#system-file-drop) | System | ⏳ | 拖曳至畫布之檔案的處理器 |

**合計**：17 個 available · 8 個 reserved · 共 25 個
（Canvas：6 available / 2 reserved · UI：6 available / 3 reserved · System：5 available / 3 reserved）
