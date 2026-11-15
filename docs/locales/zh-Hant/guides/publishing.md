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
npm run build    # outputs dist/renderer.js via @openpen/build (Vite)
```

`@openpen/build` 預先設定 Vite，將 `vue` 與 `@openpen/module-api` 列為外部依賴——這些會在執行期由 host 提供，請不要將它們打包進去。

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

1. 建置你的 plugin，執行 `npx openpen-cli pack` 產生包含 `dist/`、`plugin.json`（以及存在時的 `locales/`）的 zip，
   並將它附在標記為 `v<version>` 的 GitHub Release 上。
2. 使用者可直接從該 release 安裝：
   `npx openpen-cli plugin add <github-url>`。

### 兩種上架方式

OpenPen 有兩份獨立的清單，依需求擇一，兩者不是同一流程的前後步驟。

| | 社群清單 | 官方目錄 |
| --- | --- | --- |
| 如何進入 | 發布 release，並在 repository 加上 `openpen-plugin` topic | 執行 `npx openpen-cli publish`，開啟 pull request |
| 審核 | 無人工審核，由掃描器自動檢查套件 | 首次提交由維護者審閱；更新由目錄機器人檢查 |
| 出現時間 | 下一次掃描（每 30 分鐘） | pull request 合併後 |
| 記錄位置 | 目錄 repository 的 `community/plugins.json` | 目錄 repository 的 `plugins.json` |

兩份清單都在 [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) repository。社群條目不會併入官方 `plugins.json`，列入任何一份清單都不代表對你的程式碼做過安全稽核。

### 社群清單

掃描器會讀取帶有 `openpen-plugin` topic 的公開 GitHub repository。要被列入：

1. 建立 plugin。執行 `npx openpen-cli create @scope/name` 產生專案，再執行 `npm install` 與 `npm run build` 產生 `dist/renderer.js`。專案內附範例翻譯（`src/locales/`：`en`、`ja`、`zh-Hans`、`zh-Hant`），它們會被打包進 `renderer.js`，可保留、修改或刪除。開發流程請見[快速入門](./plugin-quickstart.md)。
2. 確認 `plugin.json` 有 `id`、`name`、`version`、`description`、`minAppVersion`。請把專案範本預設的 `description`（「A short description of what your plugin does.」）改成真實的描述，它就是清單中顯示在你 plugin 上的文字。`version` 須為 semver，`id` 的 scope 須等於擁有該 repository 的 GitHub 帳號或組織名稱（小寫），例如 `github.com/alice/todo-app` 對應 `@alice/todo-app`。掃描器只比對 scope 與 repository 擁有者，不會檢查你目前登入哪個帳號；組織只要 repository 在該組織底下即可。`create` 會拿 scope 與你個人的登入名稱比對，組織 scope 可能出現警告，這不會影響社群清單。`@openpen` scope 與官方目錄已有的 id 會被拒絕。
3. 把專案放進公開的 GitHub repository。執行 `git init`，然後在 plugin id 的 scope 所指的帳號或組織底下建立 repository（`@alice/todo-app` 就建在 `alice` 底下）並 push，例如 `gh repo create alice/todo-app --public --source . --push`。repository 名稱不必與 plugin 名稱相同，只有擁有者會拿來與 scope 比對。私有、fork 與已封存的 repository 會被略過。第一次 commit 之前，確認專案有 `.gitignore`，並列出 `node_modules/`、`dist/` 與 `*.zip`，讓建置產物與打包的 zip 不進 repository。目前 `create` 產生的專案已附這個檔案；只有舊版 CLI 產生的專案可能沒有，此時請自行建立並寫入這三行。同樣地，僅在舊版 CLI 產生的專案中，若產生的 README 含有以 `../../docs` 開頭的連結，請改成文件站的完整網址 `https://openpen.pages.dev/docs/`（例如 `https://openpen.pages.dev/docs/guides/publishing`），因為相對連結只在 OpenPen repository 內有效。專案 `package.json` 內的 `"private": true` 只會阻止 `npm publish`，不影響 release 與掃描。
4. 在由 `create` 產生的專案中執行 `npm run pack`（它會執行 `npx openpen-cli pack`），再建立 `v<version>` 的 GitHub Release 並附上 zip，例如 `gh release create v<version> ./<scope>-<name>-<version>.zip`。zip 內有 `plugin.json`、`dist/`，以及（若資料夾存在的話）`locales/`。`pack` 結尾會印出要你執行 `publish` 的提示，那一步屬於官方目錄，走社群清單可以略過。部分舊版 CLI 印出的提示用了縮短的指令名稱：指令名稱一律是 `npx openpen-cli`，因為 npm 上裸名的 `openpen` 套件是無關的工具。release 必須已發布，不能是草稿或預發布。掃描器取最新 release 的第一個 `.zip` 附件，zip 根目錄須有 `plugin.json`。
5. 在 repository 加上 `openpen-plugin` topic：repository 頁面 About 旁的齒輪，Topics；或用 GitHub CLI：`gh repo edit --add-topic openpen-plugin`。
6. 等待下一次掃描。掃描器自行下載 zip、讀取 `plugin.json` 並計算 sha256，你不需要提交雜湊值或 pull request。掃描每 30 分鐘一次，你無法自行觸發，請預留最多約 30 分鐘。要確認是否已列入，請打開目錄 repository 的 [`community/plugins.json`](https://raw.githubusercontent.com/openpen-platform/OpenPen-plugins/main/community/plugins.json)，找你的 plugin id；`latestVersion` 欄位顯示已收錄的版本。

發布更新時，提高 `version` 後重複步驟 4。`plugin.json` 版本不高於已列出版本的 release 會被忽略。移除 topic、將 repository 設為私有或封存，之後的掃描會把該 plugin 移出清單。

plugin 沒出現時，掃描器會在目錄 repository 的 `Update community index` workflow 記錄每個 repository 被略過的原因（例如缺少 `.zip` 附件、scope 與擁有者不符、草稿 release）。維護者可透過 `community/blocklist.json` 排除特定 plugin、repository 或擁有者。

### 官方目錄

官方目錄中的 plugin 可用 id 安裝：`npx openpen-cli plugin install @scope/name`，並會顯示在應用程式的 Marketplace 分頁中。

若要列入官方目錄，請在把 zip 附到 GitHub Release 之後執行 `npx openpen-cli publish`。它會檢查該 release、確認你的 GitHub 登入帳號與 plugin id 的 scope 相符，並對目錄開啟一個 pull request：首次提交為 Registration PR，新版本則為 Update PR。 組織 scope 不支援透過 `publish` 提交；官方 `@openpen` scope 由組織成員直接提交到目錄儲存庫。首次提交在合併前會由維護者審閱。完整流程請見[建立你的第一個 plugin](../tutorials/build-your-first-plugin.md) 的第 7 節，各步驟的細節請見 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。 plugin 的儲存庫也必須位於你的個人帳號下，並以 plugin 名稱命名（`publish` 會記錄為 `https://github.com/<your-login>/<plugin-name>`）；目錄機器人會將儲存庫擁有者與註冊帳號比對，位於組織或其他帳號下的儲存庫會被拒絕。

### 下架 plugin

官方目錄沒有自助下架：`publish` 只會開 Registration PR 與 Update PR，CLI 也沒有 yank 或 tombstone 指令。要下架 plugin，請在 [OpenPen-plugins 的 Issues](https://github.com/openpen-platform/OpenPen-plugins/issues) 開 issue，寫明 plugin id 與原因。目錄維護者會設定該 plugin 的 `state`：

- `yanked`：條目仍留在目錄與 Marketplace，並顯示警告。`npx openpen-cli plugin install @scope/name` 會拒絕安裝，並提示改為直接指定某個 zip 網址安裝。
- `tombstoned`：條目從公開索引與 Marketplace 移除，依 id 安裝會被阻擋。該 id 仍被保留，不能再次註冊。

刪除 manifest 的 PR 不會被當作更新：目錄機器人會留言說明由維護者決定。已安裝的使用者在執行 `npx openpen-cli plugin remove @scope/name` 之前仍可繼續使用。社群清單中的 plugin 如何移除，請見上方社群清單一節的結尾。

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
