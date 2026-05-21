---
title: Plugin 相容性
description: Plugin 如何宣告支援哪些 OpenPen 版本、host 如何決定是否載入，以及如何處理重大變更。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# Plugin 相容性

Plugin 如何宣告支援哪些 OpenPen 版本、OpenPen 如何決定是否載入，
以及如何跨 host 與 SDK 版本處理重大變更。

---

## TL;DR

- Plugin 透過兩個欄位宣告相容性：`minAppVersion`（在 module 定義中）
  以及 plugin 的 `package.json` 裡所引入的 `@openpen/module-api` 版本範圍。
- OpenPen 會拒絕 `minAppVersion` 比目前執行的 host 版本更新的 plugin。
- SDK（`@openpen/module-api`）遵循 semver。引入 `@openpen/module-api@^1.0.0`
  的 plugin 可在所有搭載相同或更高 minor 版本的 module-api `1.x` 的 host 上運作。
- SDK 的重大變更在移除前享有一個 minor 版本的棄用緩衝期。

---

## 兩個相容性欄位

### `minAppVersion` — host 版本閘門

在 `defineModule()` 中宣告你的 plugin 所需的最低 OpenPen host 版本：

```ts
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  version: '1.2.0',
  minAppVersion: '1.0.0',   // requires OpenPen 1.0.0 or newer
  contributes: {
    // ...
  },
})
```

此欄位對應 `OpenPenModule` 介面上的 `minAppVersion?: string` 屬性。載入時，
OpenPen 會對每個 module 執行預飛驗證：

- 若目前執行的 host 版本**舊於** `minAppVersion` →
  該 plugin 會被拒絕，並在「Modules」面板記錄明確的錯誤。
- 若目前執行的 host 版本**等於或更新** → 驗證繼續進行下一項檢查
  （id 格式、slot 是否存在、設定綱要等）。

此欄位為選填。若省略，則不套用 host 版本閘門。

**請將 `minAppVersion` 設定為你的 plugin 實際需要的最舊版本。**
設定得比需求更高，會讓舊版 OpenPen 的使用者無聲地無法使用你的 plugin。

### `@openpen/module-api` semver 範圍

在你的 plugin 的 `package.json` 中，將 SDK 宣告為開發依賴
（可發佈套件則宣告為 peer dependency）：

```json
{
  "devDependencies": {
    "@openpen/module-api": "^1.0.0"
  }
}
```

Host 會附帶自己的 `@openpen/module-api` 副本，並在執行期透過
importmap（`dist/openpen-runtime/module-api.js`）將其提供給 plugin。
Plugin **不得**將 `@openpen/module-api` 打包進去——`@openpen/build` 會透過
外部化該套件自動強制執行此規則。你的 plugin 編譯時所用的版本決定了你所依賴的
API 表面；實際執行的是 host 附帶的版本。

建置設定詳情請參閱[發佈](../guides/publishing.md)。

---

## 相容性矩陣

OpenPen 的 monorepo 以**同步鎖定**的方式發佈所有套件——host 應用程式、
SDK、建置 CLI 以及安裝 CLI 在每個穩定版本中共享同一個版本號。
Plugin 作者只需追蹤**一個**版本號。

| OpenPen host | `@openpen/module-api` | `@openpen/build` | `openpen-cli` |
|---|---|---|---|
| 1.x（目前）| 1.x | 1.x | 1.x |
| pre-1.0（內部）| （無穩定合約）| — | — |

無論在發行說明、GitHub tag 還是 `package.json` 中看到「OpenPen 1.4.2」，
monorepo 中的每個套件在同一天都是完全相同的版本。

---

## 重大變更政策

OpenPen 對 SDK 與 contribution slot API 的相容性承諾：

- **Patch 版本（x.x.N）** — 僅修正錯誤。`OpenPenModule` 介面、
  `ModuleSetupContext`、slot 結構，以及 UIKit 元件的屬性／事件／插槽均不變動。
- **Minor 版本（x.N.0）** — 僅進行加法性變更。新增欄位、新增 slot、
  新增 UIKit 元件。現有 plugin 無需修改即可繼續運作。
- **Major 版本（N.0.0）** — 可能包含重大變更。Plugin 可能需要更新；
  遷移路徑將另行記錄。

### 棄用流程

當 API 表面的結構發生變更（slot 欄位被重新命名、`ModuleSetupContext` 方法被替換、
UIKit 元件屬性被移除）時：

1. 棄用會在**minor 版本**中落地，舊 API 上附加 `@deprecated` JSDoc 標籤，
   並對使用該 API 的每個 module 在執行期印出一次 `console.warn`。
2. 被棄用的 API 至少在**一個完整的 minor 版本週期**內保持可用。
3. 移除發生在下一個 **major 版本**，並在 `CHANGELOG.md` 的「Breaking」區段中
   列出，附上遷移指南。

---

## Plugin 授權自由

OpenPen 採用分層授權模式：host 採 GPL-3.0-or-later 並附帶 Plugin Linking Exception，
SDK 套件（`@openpen/module-api`、`@openpen/build`、`openpen-cli`）則採 MIT 授權。

這意味著：

- 你的 plugin 可以使用**任何授權**，包括專有授權與閉源商業授權。
- 你可以依自己選擇的條款販售你的 plugin。
- 只有在你修改 OpenPen host 本身時才需要遵守 GPL，編寫 plugin 時則不需要。

Plugin Linking Exception 的確切措辭請見根目錄的 [`LICENSE`](../../LICENSE) 檔案，
分層授權概覽請見 [`README.md`](../../README.md#license)。

---

## Plugin 執行期限制

OpenPen 在發佈時啟用了 macOS `hardenedRuntime`（在受 Gatekeeper 保護的系統上
通過 Apple 公證所必須）。這會影響 plugin 在執行期能夠載入的內容：

- **Plugin 必須是純 JavaScript／TypeScript。** 原生 Node.js 附加元件（`.node` 檔案）、
  共享函式庫，或任何在執行期載入的未簽署二進位程式碼，都會被 macOS Gatekeeper 封鎖。
  `@openpen/build` 工具鏈（Vite + Vue）支援 `.ts`、`.vue` 與 `.css`——
  這些都會編譯為純 JS，可正常發佈。
- **允許外部 `fetch`／`XMLHttpRequest`**，但會記錄在 OpenPen 的稽核日誌中；
  請參閱[信任模型](./trust-model.md)。
- **不得從 plugin 程式碼中產生子程序。** Plugin 無法透過 `child_process` 啟動
  獨立的二進位檔（渲染程序未公開此功能，preload bridge 也不代理此功能）。

如果你需要發佈需要原生程式碼的 plugin，請開一個 issue——這需要 host 層級的變更
（例如獨立的已簽署輔助程序），超出目前版本線的範疇。

---

## Plugin 作者最佳實踐

- **將 `minAppVersion` 設定為實際最低需求，而非最新版本。** 若你的 plugin
  只使用自 `1.0.0` 起就存在的 API，請寫 `minAppVersion: '1.0.0'`。
  設定為目前版本會無故封鎖舊版的使用者。

- **對 `@openpen/module-api` 使用 caret 範圍**（`^1.0.0`）。Caret 允許
  相容的 patch 與 minor 更新，同時防止 major 版本的重大變更。精確鎖定版本（`1.0.0`）
  會讓你無法自動取得錯誤修正。

- **永遠不要將 `@openpen/module-api` 或 `vue` 打包進去。** Host 透過 importmap
  提供兩者。將它們打包進去會產生第二個 Vue 實例，導致響應性與 `inject()` 失效。
  如果你使用 `@openpen/build`，這一點會自動強制執行。

- **針對你所宣告的最低 `minAppVersion` 進行測試。** 不要呼叫只存在於更新
  minor 版本中的 API，然後又宣稱與舊版 host 相容。

- **在 GitHub 上訂閱 OpenPen 的版本發佈**，以便在棄用警告變成移除之前及早察覺。

### Plugin id 命名

Plugin id 必須遵循 npm scope 格式 `@scope/name`（例如 `@acme/sticky-notes`），
對應磁碟上的目錄結構 `~/.openpen/plugins/@scope/name/plugin.json`。

當兩個已安裝的 plugin 宣告相同的 id 時，OpenPen 套用**先到先得**規則：
最先被發現的 plugin（依字母掃描順序）會被載入，其餘的會被略過，並顯示警告通知
與主控台日誌。內建 module 的 id 為保留 id——宣稱內建 id 的 plugin 永遠是被略過的
那一方，而非內建 module。

為避免與他人的 plugin 發生無聲衝突：

- **使用你所掌控的唯一 scope**——你的 GitHub org、你的 npm org，或從網域衍生的前綴。
  通用 scope（`@plugins`、`@openpen`、`@util`）會與所有選擇相同捷徑的人發生衝突。
- **避免暗示官方身份的 scope 名稱**（`@openpen-official`、`@openpen-team` 等），
  除非你實際上在維護 OpenPen。
- **將 plugin id 視為永久性的。** 重新命名 id 會破壞使用者的安裝並遺失
  `installedAt` 歷史記錄；請選一個你能長期使用的名稱。

---

## 當 OpenPen 無意間造成破壞時

非預期的 host 端破壞屬於錯誤（bug）。請至
`https://github.com/openpen-platform/openpen/issues` 開 issue，並附上：

- 你的 plugin 的 `id`、`version` 與 `minAppVersion`
- OpenPen host 版本（`設定 → 關於` 或 `openpen --version`）
- 最小重現案例（plugin id + 重現步驟）

非預期的破壞會被視為需要修補的版本阻斷問題。

---

## 參見

- [Module 架構](./module-architecture.md) — host／module／plugin 分層、
  載入生命週期，以及完整的 `OpenPenModule` 介面
- [信任模型](./trust-model.md) — plugin 可存取的資源，以及如何安全安裝
- [發佈](../guides/publishing.md) — 建置與發佈你的 plugin
- [Plugin 快速入門](../guides/plugin-quickstart.md) — 從零開始到 plugin 運作
