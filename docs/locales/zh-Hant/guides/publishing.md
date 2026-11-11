---
title: 發佈 Plugin
description: 從你的機器建置、安裝並發佈 OpenPen plugin 給終端使用者。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 發佈 Plugin

如何建置、安裝並發佈 OpenPen plugin。

---

## 建置

```bash
npm run build    # outputs dist/renderer.js via @openpen/build (Rollup)
```

`@openpen/build` 預先設定 Rollup，將 `vue` 與 `@openpen/module-api` 列為外部依賴——這些會在執行期由 host 提供，請不要將它們打包進去。

### Peer dependency 規則

- **MUST** 將 `vue` 與 `@openpen/module-api` 保持為外部依賴。
  將它們打包會產生第二個 Vue 實例，破壞響應性，並導致 `inject` 失效。
- **MUST NOT** 將 `vue` 或 `@openpen/module-api` 加入 `dependencies` 或 `bundledDependencies`。它們應放在 `devDependencies`（若是可發佈的 plugin 套件則放 `peerDependencies`）。
- 若你使用 `@openpen/build`（預設值），此規則會自動強制執行。
  只有在有明確原因時才覆寫 `rollupOptions.external`。

---

## 本機安裝（用於測試）

在 plugin 目錄中執行 `npm run build` 之後，再執行以下指令。它會將 `plugin.json`、`dist/` 與 `locales/`
複製到 `~/.openpen/plugins/@scope/name/`：

```bash
npx openpen-cli plugin add .
# Then restart OpenPen
```

`plugin add` 在安裝前會請你確認；在非互動式 shell 中請加上 `--yes`（或 `-y`）。

Plugin 載入需要打包後（正式）的 OpenPen 建置版本。Host 的 dev server 不會載入 plugin，
因此請重新啟動打包後的 OpenPen 來查看你的 plugin。

---

## 使用 openpen-cli 管理 plugin

```bash
npx openpen-cli plugin list                  # List installed plugins
npx openpen-cli plugin add <source>          # Install from a local path or GitHub release
npx openpen-cli plugin remove <id>           # Remove by plugin id
```

`<source>` 接受：
- 本機資料夾路徑：`./my-plugin` 或 `/abs/path/to/plugin`
- GitHub Release 的 zip 網址：`https://github.com/user/repo/releases/download/v1.0.0/plugin.zip`
- GitHub 儲存庫網址：`https://github.com/user/repo` 或 `github:user/repo`（會解析最新 Release）

OpenPen plugin **不**透過 npm registry 發佈——請使用上述 GitHub 格式之一。完整指令參考請見 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。

---

## 發佈

1. 建置你的 plugin，執行 `npx openpen-cli pack` 產生包含 `dist/`、`plugin.json` 與 `locales/` 的 zip，
   並將它附在標記為 `v<version>` 的 GitHub Release 上。
2. 使用者可直接從該 release 安裝：
   `npx openpen-cli plugin add <github-url>`。

### Plugin 目錄

OpenPen 維護一個中央目錄，即
[OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) repository。
列在其中的 plugin 可用 id 安裝：
`npx openpen-cli plugin install @scope/name`，並會顯示在應用程式的 Marketplace 分頁中。

若要將你的 plugin 列入目錄，請在把 zip 附到 GitHub Release 之後執行 `npx openpen-cli publish`。
它會檢查該 release、確認你的 GitHub 登入帳號與 plugin id 的 scope 相符，
並對目錄開啟一個 pull request：首次提交為 Registration PR，新版本則為 Update PR。
首次提交在合併前會由維護者審閱。完整流程請見
[建立你的第一個 plugin](../tutorials/build-your-first-plugin.md) 的第 7 節，
各步驟的細節請見 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。

---

## 信任模型與責任

你的 plugin 在 OpenPen 的主要渲染程序中執行，可完整存取：

- 共享的 Vue 實例（你可以修改任何響應式狀態）
- `window.openPenApi`（應用程式對外開放的所有 host IPC）
- DOM（應用程式中的任何 UI，不限於你自己的部分）
- localStorage / sessionStorage（無每個 plugin 的隔離機制）

OpenPen 採用**使用者自行安裝信任模型**。沒有權限沙盒也沒有程式碼簽署，而目錄審閱並非對你程式碼的安全稽核。安裝你的 plugin 的使用者，即是將信任延伸至你的程式碼。

身為 plugin 作者，你 **SHOULD**：

- 在你的 plugin README 中說明你的 plugin 讀取、寫入以及透過網路傳送的資料內容。
- 除非你的 plugin 的用途明確需要，否則避免觸碰其他 plugin 或 host module 所有的狀態。
- 若你有對外的網路請求，請特別說明——所有請求都會記錄至使用者的除錯主控台以供稽核。


---

## 延伸閱讀

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — 先在本機開發
- [uikit/](../uikit/index.md) — UIKit 元件 API
- [slots/](../slots/index.md) — 所有 contribution slot
