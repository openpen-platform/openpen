---
title: Plugin 快速入門
description: 從零開始，五分鐘內讓 OpenPen plugin 運作。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T06:00:00Z
language: zh-Hant
---

# Plugin 快速入門

從零開始，五分鐘內讓 OpenPen plugin 運作。

## 前置條件

- Node.js 20+，npm 9+
- 已安裝 OpenPen 1.0 或更新版本

---

## 第 1 步 — 從入門範本建立專案

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
```

將 `yourscope` 替換為你的 GitHub 使用者名稱或組織名稱（小寫）。
`openpen create` 會複製 plugin-starter 範本、替換 id，並列印後續步驟。

> **手動建立的注意事項**：若你跳過 `openpen-cli create`、改為手動複製
> plugin-starter，你 MUST 保持以下三處同步 — 它們都宣告了 plugin id，
> 若不一致，`useModuleContext()` 在執行階段會拋出例外：
> - `plugin.json` → `"id"`
> - `src/module-id.ts` → `MODULE_ID`
> - `src/index.ts` 中的 `defineModule({ id })`（通常從 `module-id.ts` 匯入）

## 第 2 步 — 建置

```bash
npm run build    # outputs dist/renderer.js
npm run dev      # watch mode during development
```

## 第 3 步 — 在本機安裝以進行測試

使用 CLI 將已建置的 plugin 複製到 host 的 plugin 資料夾：

```bash
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` 會將 `plugin.json`、`dist/` 及 `locales/`
（若存在）複製到 `~/.openpen/plugins/@yourscope/my-plugin/`。Host 會在啟動時掃描
此資料夾；詳見教學的[實作範例](../tutorials/build-your-first-plugin.md#2-install-for-local-development)。

> 磁碟上的檔案只是一半 — `plugin-meta.json` 會在 OpenPen 下次啟動時由 host 重新建立。
> 關於 `plugin add` 返回後發生的事，請參閱
> [`plugin-meta.json` 所有權](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)。

### 手動安裝（替代方案）

若 CLI 不可用，等效的 shell 指令如下：

```bash
mkdir -p ~/.openpen/plugins/@yourscope/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-plugin/
```

## 第 4 步 — 在應用程式中測試

重新啟動 OpenPen，在控制列中尋找你的 contribution。

> [!IMPORTANT]
> Plugin loading requires the **production build** of OpenPen
> (`npm run build` output / a packaged release). The Vite dev server (`npm run dev`
> in the host repo) does **not** load plugins — plugins installed in
> `~/.openpen/plugins/` are skipped in dev mode. Confirm you are running a
> packaged OpenPen before debugging "plugin not loading" issues.

---

## 專案結構

```
my-plugin/
├── plugin.json             ← Manifest the host scans (id, version, etc.)
├── package.json            ← devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json           ← Optional, used by `npm run check`
└── src/
    ├── module-id.ts        ← Single source of truth for the plugin's id
    ├── index.ts            ← Default-exports an OpenPenModule
    └── *.vue / *.ts        ← Your plugin's components & helpers
```

`src/module-id.ts` 匯出單一 `MODULE_ID` 常數，`index.ts` 中的 `defineModule({ id })` 以及任何需要參照 plugin id 的其他程式路徑都從此處匯入。將 id 集中在一處是上方注意事項所強調的慣例 — 完整模式請參閱 [tutorials/build-your-first-plugin.md](../tutorials/build-your-first-plugin.md) 中的實作範例。

---

## Module 進入點

每個 plugin 都 MUST 從 `src/index.ts` 預設匯出一個 `OpenPenModule` 物件。
產生此物件的標準方式是使用 `@openpen/module-api` 提供的 `defineModule()`：

```ts
import { defineModule } from '@openpen/module-api'
```

匯入路徑為**套件根目錄** — 不需要子路徑匯出。

### 最簡 `src/index.ts`

```ts
import { defineModule } from '@openpen/module-api'
import MyButton from './MyButton.vue'

export default defineModule({
  id: '@yourscope/my-plugin',            // @scope/name format, globally unique
  contributes: {
    controlBar: [{ id: 'my-btn', component: MyButton }],
  },
})
```

`defineModule()` 對 `contributes` 提供完整的 TypeScript 型別推斷，
並在 module 自身的建置邊界執行 id 格式與 slot 鍵值合理性檢查（讓錯誤在你的
repo 中浮現，而非在 host 載入時深藏其中）。

完整的 `OpenPenModule` 介面及所有可用的 `contributes` 鍵值，請參閱
[module-architecture.md](../concepts/module-architecture.md)。

---

## `contributes` 的作用

`contributes` 是以 slot 為鍵的型別化映射表。根據需求自由組合，至少需新增一個項目。

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  contributes: {
    tools: [{ id: 'my-tool', /* onPointerDown/Move/Up + renderStroke — see slots.md */ }],
    cursors: [{ id: 'my-tool', cursor: { svg: '<svg .../>', hotspot: { x: 4, y: 20 } } }],
    controlBar: [{ id: 'btn', component: MyBtn }],
    settingsPanels: [{ id: 'prefs', label: { en: 'My Plugin' }, component: MyPrefsPanel }],
    shortcuts: [{
      id: 'do-thing',
      keys: 'CommandOrControl+Alt+D',
      scope: 'global',
      label: { en: 'Do the thing' },
      userCustomizable: true,
      handler() {},
    }],
  },
})
```

- `tools` 用於註冊繪圖工具。完整的 `ToolContribution` 介面（id、label、icon、指標處理器、選填的 `renderStroke`）請參閱 [`canvas.tools`](../slots/canvas#canvas-tools)。
- `cursors` 將自訂 DOM 游標綁定至工具 — `CursorContribution` 上的 `id` MUST 與對應 `ToolContribution` 上的 `id` 相符。游標外形選項（inline SVG / 相對路徑 / PNG）及 `--openpen-cursor-accent` 佈景主題慣例請參閱 [`ui.cursors`](../slots/ui#ui-cursors)。
- `settingsPanels` 在**設定 → 功能**中新增一個區塊。只有需要完整專屬頁籤的 module 才使用 `settingsTabs`。
- 設有 `label` 與 `userCustomizable: true` 的 shortcut 會出現在**設定 → Shortcuts** 你的 module 群組下，讓使用者自行重新綁定。若兩者皆省略，則以宣告的預設值靜默執行。
- 請選擇不會與常見作業系統綁定衝突的加速鍵預設值；若 `globalShortcut.register` 被拒絕，執行階段會在主控台記錄錯誤。

完整的設定 API（`getSettings`、`updateSettings`、`onSettingsChange`），請參閱 [guides/module-settings.md](./module-settings.md)。

完整的 slot 目錄請參閱 [slots/index.md](../slots/index.md)。

---

## 邊界規則

Plugin 程式碼只能從以下來源匯入：

- plugin 內的相對路徑
- `@openpen/module-api`（SDK）
- `node:*`（僅限主程序端處理器）
- 第三方 npm 套件

匯入 host 內部模組（例如 `src/services/...`）會被 host 的邊界測試拒絕。
SDK 已提供你所需的一切。

### 常見陷阱

**`zod` 必須來自 `@openpen/module-api`。** `zod` 已由建置 CLI 外部化，
並在執行階段透過 host 的 importmap 解析。直接使用
`import { z } from 'zod'` 在 production 建置中會產生無法解析的 specifier 錯誤。
請始終使用：

```ts
import { z } from '@openpen/module-api'
```

**`@openpen/module-api/uikit` 也已外部化。** 建置 CLI 會自動處理此問題。
若你覆寫了 `rollupOptions.external`，請納入以下三者：
`'vue'`、`'@openpen/module-api'` 與 `'@openpen/module-api/uikit'`。

---

## 使用 UIKit 元件

OpenPen 提供 UIKit 包裝元件，讓你的 plugin 無需額外作業即可符合 host 的視覺風格。
完整元件參考請參閱 [uikit/index.md](../uikit/index.md)。

快速範例 — 開啟滑桿彈出視窗的按鈕：

```vue
<script setup lang="ts">
import { AppPopover, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <AppSlider v-model="value" :min="0" :max="100" width="120px" />
    </template>
  </AppPopover>
</template>
```

若需顯示回饋與狀態訊息，請使用 `AppBanner`：

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const saveError = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="saveError" variant="error" inline>{{ saveError }}</AppBanner>
</template>
```

可用的 variant：`info`、`warning`、`success`、`error`。`inline` 屬性
切換為適合對話框和表單區域的緊湊單行版面。

---

## 後續步驟

- **發佈** → [guides/publishing.md](./publishing.md) — 建置供發行的版本
- **Module 設定** → [guides/module-settings.md](./module-settings.md) — settingsSchema、useModuleContext、panels 與 tabs
- **完整 UIKit API** → [uikit/index.md](../uikit/index.md)
- **自訂 UIKit 元件** → [uikit/custom-components.md](../uikit/custom-components.md) — 建置超出內建包裝器的 widget（標籤輸入、數字調節器、組合框）
- **設計令牌** → [reference/design-tokens.md](../reference/design-tokens.md) — 你的樣式繼承的 host 調色盤
- **所有 contribution slot** → [slots/index.md](../slots/index.md)
- **逃生艙原語** → [uikit/primitives.md](../uikit/primitives.md)
- **架構深入探討** → [module-architecture.md](../concepts/module-architecture.md)
