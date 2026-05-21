---
title: 信任模型
description: OpenPen plugin 擁有完整 renderer process 存取權限的意義，以及使用者如何安全安裝 plugin。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 信任模型

OpenPen plugin 以**完整存取**宿主 renderer process 的權限執行。
本頁說明這代表什麼，以及如何安全安裝 plugin。

---

## 使用者安裝後的信任範圍

當你安裝一個 plugin，它將獲得：

- 完整存取 `window.openPenApi` — 宿主公開的所有 IPC 呼叫
- 完整存取共享 Vue 實例及所有響應式狀態
- 完整存取 DOM — 包括其他 plugin 和宿主所擁有的 UI
- 透過 `fetch` / `XMLHttpRequest` 進行網路存取

這是一個刻意的選擇。在生態系統的成形階段，plugin 無需繁瑣的權限申請即可建構強大的整合功能。在 contribution slot API 通過實戰考驗之前就強制使用沙箱，只會拖慢 plugin 開發速度，卻帶來極少的實際效益。

### 安裝階段的安全性

Plugin 安裝是純粹的檔案解壓縮 — 安裝過程中不會執行任何程式碼。
OpenPen CLI 和 GUI 均強制執行：

- 安裝時不執行 `npm install` / `npm run build`
- 任何階段均不執行 shell 腳本
- Plugin 套件僅包含預先建置的產出物（`plugin.json` + `dist/`）

程式碼執行恰好發生一次：當 plugin 在重新啟動後被 runtime **載入**時。這意味著安裝步驟本身不存在程式碼執行風險；風險遞延至載入步驟，此時 module 載入器可隔離並回滾失敗。

### 基本防護措施

OpenPen 強制執行以下基本防護：

| 防護措施 | 功能說明 |
|----------|----------|
| `contextIsolation: true` | Node.js 上下文與 renderer 上下文相互隔離 — plugin 無法直接從 renderer 程式碼呼叫原始 Node.js API |
| `nodeIntegration: false` | renderer 中無法使用 `require('fs')` 或 `require('path')` |
| `webSecurity: true` | 適用標準 CORS 及混合內容規則（Electron 預設值；未停用） |
| 對外請求稽核日誌 | 任何 plugin 發出的對外 HTTP(S) 請求均會記錄在記憶體內的稽核日誌環形緩衝區中，可透過 DevTools 中的 openPenApi.getAuditLogEntries() 存取。專屬 UI 面板已列入規劃。 |

這些措施能降低意外誤用的風險，但**無法**阻止你所安裝的 plugin 進行蓄意攻擊。

---

## 此模型無法防止的情況

你安裝的 plugin 可以：

- 讀取你家目錄下的檔案（透過 `callMain` 橋接至主程序處理器）
- 將檔案寫入你機器上的任意路徑
- 向任意伺服器發送 HTTP 請求
- 訂閱所有 OpenPen 事件，包括繪圖筆跡資料
- 以任意方式修改宿主 UI — 包括隱藏按鈕或注入內容

**在安裝任何 plugin 之前，請自行評估其來源。** Plugin 是在你的機器上以你的權限執行的 JavaScript / TypeScript。請以對待從 GitHub 安裝任何開源桌面應用程式的態度來看待它。

### 相同信任模型的已知攻擊案例

2026 年 4 月，Elastic Security Labs 記錄了針對 Obsidian 使用者的 **PHANTOMPULSE 行動**。攻擊者利用社交工程向金融和加密貨幣專業人士分享惡意 vault。該 vault 預先設定了兩個合法的社群 plugin — **Shell Commands** 和 **Hider** — 以靜默方式執行攻擊者控制的指令。

此攻擊無需利用 Obsidian 本身的任何漏洞，它正是按照設計利用了信任模型：使用者安裝了 plugin，而 plugin 擁有執行任意 shell 指令的完整權限。

OpenPen 的模型具有相同的結構和相同的風險面。唯一可用的緩解措施是**使用者對所安裝內容保持警覺**。

參考資料：
- [Phantom in the vault — Elastic Security Labs](https://www.elastic.co/security-labs/phantom-in-the-vault)
- [Obsidian Plugin Abuse Delivers PHANTOMPULSE RAT — The Hacker News](https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html)

---

## 如何安全安裝 plugin

1. **優先選擇知名且有聲望的作者。** 來自擁有公開 GitHub 紀錄及其他已發布專案之開發者的 plugin，風險遠低於匿名帳號發布的 plugin。

2. **閱讀原始碼。** Plugin 是 JavaScript / TypeScript — 通常是單一的 `dist/renderer.js` 檔案。如果你無法或不願意閱讀它，請以對待來自未知來源的執行檔的態度來處理安裝。

3. **監看稽核日誌。** 已安裝 plugin 的網路請求會記錄在稽核日誌中。可透過 DevTools 中的 openPenApi.getAuditLogEntries() 查詢；專屬 UI 面板已列入規劃。意外的目標位址是警示訊號。

4. **移除未使用的 plugin。** 每個非使用中的 plugin 仍會被載入。縮小攻擊面意味著減少潛在的入侵點。

5. **回報可疑行為。** 如果 plugin 出現非預期行為 — 發出無法解釋的網路呼叫、修改檔案或更改宿主 UI — 請回報。請參閱 [`SECURITY.md`](../../SECURITY.md) 了解負責任揭露流程。

---

## 回報疑慮

如果你發現 plugin 有惡意行為，或 OpenPen plugin 載入機制本身存在漏洞，請透過 [`SECURITY.md`](../../SECURITY.md) 回報。

請勿在 GitHub 公開 issue 中回報安全漏洞。
