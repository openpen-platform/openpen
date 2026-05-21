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

```bash
mkdir -p ~/.openpen/plugins/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/my-plugin/
# Then restart OpenPen
```

Plugin 載入需要正式建置版本（importmap 只存在於 `dist/index.html`）。
若尚未建置 host，請先執行：

```bash
npm run build                              # host + runtime shims
cd packages/my-plugin && npm run build    # plugin
```

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

1. 建置你的 plugin，並在 GitHub Release 中附上壓縮的 `dist/`、`plugin.json` 與 `locales/`（`openpen pack` 指令會產生此 zip）。
2. 使用者可透過 `npx openpen-cli plugin add <github-url>` 直接安裝，或在你的 plugin 列入目錄後使用 `npx openpen-cli plugin install @scope/name` 安裝。

目前尚無中央 plugin registry。社群的可搜尋性來自 GitHub topics（`openpen-plugin`）以及 OpenPen Discussions 討論區。

---

## 信任模型與責任

你的 plugin 在 OpenPen 的主要渲染程序中執行，可完整存取：

- 共享的 Vue 實例（你可以修改任何響應式狀態）
- `window.openPenApi`（應用程式對外開放的所有 host IPC）
- DOM（應用程式中的任何 UI，不限於你自己的部分）
- localStorage / sessionStorage（無每個 plugin 的隔離機制）

OpenPen 採用**使用者自行安裝信任模型**。沒有權限沙盒、沒有程式碼簽署，也沒有市集審核。安裝你的 plugin 的使用者，即是將信任延伸至你的程式碼。

身為 plugin 作者，你 **SHOULD**：

- 在你的 plugin README 中說明你的 plugin 讀取、寫入以及透過網路傳送的資料內容。
- 除非你的 plugin 的用途明確需要，否則避免觸碰其他 plugin 或 host module 所有的狀態。
- 若你有對外的網路請求，請特別說明——所有請求都會記錄至使用者的除錯主控台以供稽核。


---

## 延伸閱讀

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — 先在本機開發
- [uikit/](../uikit/index.md) — UIKit 元件 API
- [slots/](../slots/index.md) — 所有 contribution slot
