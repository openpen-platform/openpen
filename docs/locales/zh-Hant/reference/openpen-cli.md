---
title: openpen CLI
description: openpen-cli 命令列工具，用於 plugin 腳手架、安裝、封裝與目錄發佈。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# openpen CLI

`openpen` CLI（`openpen-cli` 套件）負責管理 OpenPen 的 plugin 安裝、封裝與發佈。安裝指令如下：

```bash
npm install -g openpen-cli
# or use npx without installing:
npx openpen-cli <command>
```

> **⚠️ 請務必使用 `openpen-cli` 呼叫，而非 `openpen`。** npm 上的裸名 `openpen` 套件已被一個無關的專案佔用 —— `npx openpen-cli ...` 會拉取錯誤的工具。本文件所有指令均以 `npx openpen-cli <verb>` 的形式執行。

---

## 指令

### `openpen create @scope/name`

從官方起始範本腳手架一個新的 plugin。

**行為：**
1. 驗證輸入是否符合 `@scope/name` 格式。
2. 在目前目錄下建立以 `name` 段命名的子資料夾（例如 `todo-app/`）。
3. 複製 plugin 起始範本，並將 `plugin.json` 的 `@scope/name` 填入你提供的值。
4. 印出後續步驟：`npm install` → 開發 → `npm run build` → `openpen pack`。

**認證：** 會檢查（但不會因此阻擋）你提供的 scope 是否與已認證的 GitHub 登入帳號一致。真正的 scope 驗證發生在 `openpen publish` 時。

---

### `openpen pack`

將你的 plugin 打包成可散佈的 zip 檔。在包含 `plugin.json` 的目錄中執行此指令。

**前置條件：** 你的 `dist/renderer.js` 必須已存在 —— 請先執行建置工具（例如 `npx @openpen/build` 或你自己的 bundler）。

**行為：**
1. 讀取 `plugin.json`，解析 `id`（`@scope/name`）與 `version`。
2. 驗證 `id` 格式，並確認 `dist/renderer.js` 存在。
3. 收集 `plugin.json` + `dist/` + `locales/`（若存在）。
4. 寫出 `<scope>-<name>-<version>.zip` —— 例如 `@alice/todo-app` 的版本 `1.2.0` 會產生 `alice-todo-app-1.2.0.zip`。
5. 印出輸出路徑與 SHA-256 雜湊值。

`openpen pack` **不會替你執行建置** —— 請先呼叫你的建置工具。

---

### `openpen publish`

向中央 [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) 目錄提交一個「首次註冊 PR」或「版本更新推送」。

**前置條件：** `plugin.json` 必須存在、`openpen pack` 產生的 zip 必須存在，且 `v<version>` 的 GitHub Release 必須已上線並附上該 zip。

**行為：**
1. 驗證 `plugin.json` 與 zip 檔。
2. 確認 GitHub Release 及其附加資源存在。
3. 確認已認證的 GitHub 登入帳號與 plugin `id` 中的 `scope` 相符。
4. 計算 zip 的 SHA-256。
5. 偵測這是首次註冊還是版本更新：
   - **新 plugin** → 開啟一個「首次註冊 PR」（`register/<scope>-<name>`）。合併前需要維護者審查。
   - **版本更新** → 開啟一個「更新推送 PR」（`update/<scope>-<name>-<version>`）。目錄機器人在所有檢查通過後自動合併。
6. 印出 PR 的 URL。

**認證：** 使用 GitHub OAuth token 或 `GITHUB_TOKEN` 環境變數。

---

### `openpen plugin install @scope/name`

從中央目錄下載並安裝一個 plugin。

**行為：**
1. 從目錄取得 `plugins.json`。
2. 查找 `@scope/name` 的條目；若 plugin 已被 yank 或 tombstone，則回報錯誤。
3. 下載 release zip。
4. 對照目錄記錄驗證 SHA-256 摘要。若不符則中止並刪除已下載的檔案。
5. 解壓縮至 `~/.openpen/plugins/@scope/name/`。若目錄已存在，會先備份；成功後刪除備份，失敗時還原備份。
6. 驗證解壓縮後的 `plugin.json`。
7. 提示你重新啟動 OpenPen。

---

### `openpen plugin add <source>`

從本機目錄或遠端 release 資源安裝一個 plugin。

**支援的來源格式：**

| 格式 | 範例 | 行為 |
|------|------|------|
| 本機路徑 | `./my-plugin/` | 將 `<path>/dist/`、`<path>/plugin.json` 及 `<path>/locales/`（若存在）複製到 `~/.openpen/plugins/@<scope>/<name>/`。若 `dist/` 不存在則回報明確錯誤。 |
| GitHub release zip URL | `https://github.com/owner/repo/releases/download/v1.0.0/plugin.zip` | 下載並解壓縮 zip。 |
| GitHub 倉庫 URL | `https://github.com/owner/repo` | 解析最新 release 並從其 zip 資源安裝。 |
| GitHub 簡寫 | `github:owner/repo` | 與上方倉庫 URL 相同。 |

**不支援：** npm 套件名稱。OpenPen plugin 透過 GitHub Releases 散佈，而非 npm registry。請使用 `openpen plugin install @scope/name` 進行目錄安裝，或使用上方任一 GitHub 格式進行直接安裝。

---

### `openpen plugin list`

列出目前安裝在 `~/.openpen/plugins/` 中的所有 plugin。輸出使用 `@scope/name` 格式。

---

### `openpen plugin remove @scope/name`

透過刪除 `~/.openpen/plugins/@scope/name/` 目錄來解除安裝一個 plugin。

---

## Plugin id 格式

每個 OpenPen plugin 的 id 格式為 `@scope/name`：

- `scope` 與 `name` 均為小寫 ASCII 字母、數字與連字號。
- 每段的第一個字元必須是字母或數字（不可為連字號）。
- 每段最多 39 個字元。
- 正則表達式：`/^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/`

範例：`@alice/todo-plugin`、`@openpen/freehand`。

`@openpen/*` 與 `@core/*` scope 保留供官方使用，第三方無法進行註冊。

---

## 另請參閱

- [建置你的第一個 plugin](../tutorials/build-your-first-plugin.md)
- [Plugin 發佈指南](../guides/publishing.md)
- [Contribution Slot 目錄](../slots/)
