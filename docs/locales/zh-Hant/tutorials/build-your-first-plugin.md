---
title: 打造你的第一個 OpenPen Plugin
description: 使用 openpen-cli 工具鏈，從零開始建立、編譯、安裝並發佈一個 plugin 至 OpenPen。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 打造你的第一個 OpenPen Plugin

在本教學中，你將使用 `openpen` CLI 建立一個 plugin 的骨架、編譯它、安裝至 OpenPen，
並發佈到社群目錄。

## 前置需求

- Node.js 20+，npm 9+
- OpenPen 1.0 或更新版本已安裝並執行中
- 支援 TypeScript 的程式碼編輯器
- `gh` CLI 已安裝並完成驗證（`gh auth login`）— 執行 `openpen publish` 時必要

---

## 1. 建立專案骨架

```bash
npx openpen-cli create @yourscope/my-highlighter
cd my-highlighter
npm install
```

將 `yourscope` 替換為你的 GitHub 使用者名稱或組織名稱（小寫）。
`openpen create` 會複製 plugin-starter 範本、替換 id 佔位符，並輸出後續步驟說明。

你會得到如下的資料夾結構：

```
my-highlighter/
├── plugin.json         # manifest the host scans at load time
├── package.json        # devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json
└── src/
    └── index.ts        # default-exports a defineModule({...}) call
```

> **`plugin.json` 與 `package.json` 的差異**：`plugin.json` 是 OpenPen 在載入時讀取的檔案；`package.json` 僅供 Node.js 編譯工具鏈使用。

---

## 2. 安裝以進行本地開發

編譯 plugin 並從本地來源資料夾直接安裝：

```bash
npm run build
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` 會將 `plugin.json`、`dist/` 及 `locales/`（若存在）
複製至 `~/.openpen/plugins/@yourscope/my-highlighter/`。安裝時不會在你的機器上執行編譯步驟
——你所編譯的 `dist/` 會直接使用。

重新啟動 OpenPen。你的 plugin 會自動載入，其 contribution 也會出現在控制列中。

> **注意**：Plugin 載入需要 OpenPen 的正式版本（production build），
> 而非 Vite 開發伺服器。若尚未完成，請在 host repo 中執行 `npm run build` 來編譯 host。

### 手動安裝（替代方式）

若你偏好跳過 CLI：

```bash
npm run build
mkdir -p ~/.openpen/plugins/@yourscope/my-highlighter
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-highlighter/
```

---

## 3. `src/index.ts` 的結構解析

每個 plugin 都必須預設匯出一個 `OpenPenModule` 物件。使用來自 `@openpen/module-api` 的 `defineModule()`：

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [
      {
        id: 'highlighter',
        component: HighlighterButton,
      },
    ],
    locales: { en, 'zh-Hant': zhHant },
  },
})
```

在「設定 → 模組」中顯示的名稱與描述，來自 `locales/en.json` 中的兩個
**保留鍵**：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen."
}
```

### 重要欄位

| 欄位 | 型別 | 說明 |
|-------|------|-------|
| `id` | `string` | `@scope/name` 格式，小寫。在目錄中必須全域唯一。 |
| `version` | `string` | SemVer。第三方 plugin 必填。 |
| `minAppVersion` | `string` | 選填。若執行中的 host 版本較舊，OpenPen 會拒絕載入該 plugin。 |
| `contributes` | `ModuleContributions` | 至少需要一個 slot 項目。 |
| `setup` | `(ctx) => void` | 選填的單次初始化 hook——在 manifest 驗證後執行一次。 |

### `contributes` — 選擇 slot

`contributes` 是以 slot 名稱為鍵的型別化映射。依需求混搭使用：

```ts
contributes: {
  controlBar: [...],        // buttons in the floating control bar
  tools: [...],             // drawing tool implementations
  settingsTabs: [...],      // a tab in Settings > (Your Plugin)
  shortcuts: [...],         // global keyboard shortcuts
  cursors: [...],           // custom cursor per tool
  // ...and more — see slots/index.md
}
```

`defineModule()` 對每個 slot 提供完整的 TypeScript 型別推斷，並在編譯時執行 id 格式檢查，
讓錯誤在 host 看到 plugin 之前就出現在你的 repo 中。

### 實作範例 — 繪圖工具 + 自訂游標

起始骨架貢獻了一個控制列按鈕。若要讓它成為真正能在畫布上繪製的工具，需加入 `tools` + `cursors`。
重要的 Tool 合約細節：**三個指標事件處理器都將即時的 `canvasCtx` 作為第一個參數**；
工具在 `onPointerMove` 期間逐步繪製；只有 `onPointerUp` 返回 `Stroke`（其他返回 `void`）；
返回的 `Stroke` 必須包含 `id`（唯一值）和 `tool`（與 `ToolContribution.id` 匹配）。

```ts
// src/highlighter-tool.ts
import { resolveStrokeColor } from '@openpen/module-api'
import type { Tool, Stroke, Point, StrokeStyle } from '@openpen/module-api'

const HIGHLIGHTER_ALPHA = 0.35
const HIGHLIGHTER_WIDTH_MUL = 3

export function createHighlighterTool(toolId: string): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  function applyStyle(ctx: CanvasRenderingContext2D, s: StrokeStyle): void {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.strokeStyle = resolveStrokeColor(s.color)
    ctx.lineWidth = s.lineWidth * HIGHLIGHTER_WIDTH_MUL
    ctx.lineCap = 'square'
    ctx.lineJoin = 'miter'
  }

  return {
    needsPreviewRedraw: false,

    onPointerDown(_canvasCtx, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },

    onPointerMove(canvasCtx, point) {
      if (!style || !prev) return
      points.push(point)
      canvasCtx.save()
      applyStyle(canvasCtx, style)
      canvasCtx.beginPath()
      canvasCtx.moveTo(prev.x, prev.y)
      canvasCtx.lineTo(point.x, point.y)
      canvasCtx.stroke()
      canvasCtx.restore()
      prev = point
    },

    onPointerUp(_canvasCtx, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: toolId,
        points: [...points],
        style: { ...style },
        // tool-specific extras: survive into renderStroke for history replay
        alpha: HIGHLIGHTER_ALPHA,
        widthMul: HIGHLIGHTER_WIDTH_MUL,
      }
      points = []
      style = null
      prev = null
      return stroke
    },
  }
}

export function renderHighlighter(
  canvasCtx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  if (stroke.points.length < 2) return
  const alpha = (stroke.alpha as number) ?? HIGHLIGHTER_ALPHA
  const widthMul = (stroke.widthMul as number) ?? HIGHLIGHTER_WIDTH_MUL
  canvasCtx.save()
  canvasCtx.globalAlpha = alpha
  canvasCtx.strokeStyle = resolveStrokeColor(stroke.style.color)
  canvasCtx.lineWidth = stroke.style.lineWidth * widthMul
  canvasCtx.lineCap = 'square'
  canvasCtx.lineJoin = 'miter'
  canvasCtx.beginPath()
  canvasCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    canvasCtx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  canvasCtx.stroke()
  canvasCtx.restore()
}
```

```ts
// src/module-id.ts — single source of truth for the plugin's id
export const MODULE_ID = '@scope/highlighter'
```

```ts
// src/index.ts
import { defineModule } from '@openpen/module-api'
import { MODULE_ID } from './module-id'
import { createHighlighterTool, renderHighlighter } from './highlighter-tool'

const TOOL_ID = 'highlighter'

const highlighterCursor = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
      // chunky marker body — fill follows the user's stroke color via the
      // --openpen-cursor-accent convention.
      '<rect x="6" y="3" width="9" height="14" rx="1.5" ' +
        'fill="var(--openpen-cursor-accent, #ffeb3b)" stroke="#111" stroke-width="1.2"/>' +
      '<polygon points="6,17 15,17 12,22 9,22" fill="#111"/>' +
    '</svg>',
  hotspot: { x: 10, y: 22 },     // bottom tip
  fallback: 'crosshair' as const,
}

export default defineModule({
  id: MODULE_ID,
  version: '0.1.0',
  metadata: { name: { en: 'Highlighter' } },
  contributes: {
    tools: [{
      id: TOOL_ID,
      label: { en: 'Highlighter' },
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="9" height="14" rx="1"/><polygon points="6,17 15,17 12,22 9,22"/></svg>',
      ...createHighlighterTool(TOOL_ID),
      renderStroke: renderHighlighter,
    }],
    cursors: [{
      id: TOOL_ID,                      // MUST match the tool's id
      cursor: highlighterCursor,
    }],
  },
})
```

注意事項：

1. **Tool 合約** — `onPointerDown(canvasCtx, point, style)` 初始化狀態但返回 `void`。`onPointerMove(canvasCtx, point)` 在即時的 `canvasCtx` 上逐步繪製。`onPointerUp(canvasCtx, point)` 是唯一返回 `Stroke` 的處理器；返回的物件就是 host 儲存以供復原/重做的資料。
2. **Stroke 是值物件** — 它包含 `id`（唯一值，慣例上使用 `crypto.randomUUID()`）+ `tool`（與 `ToolContribution.id` 匹配）+ 座標點 + 樣式 + 任何你希望在歷史回放中保留的工具特定額外資料。
3. **`renderStroke` 是歷史回放 hook** — 當使用者復原／重做／調整大小時，畫布引擎會對每個 stroke 呼叫 `renderStroke(canvasCtx, stroke)` 進行回放。使用超出預設折線效果（alpha、自訂寬度、漸層處理）進行繪製的工具必須提供此函式；繪製普通折線的工具可省略。
4. **`StrokeColor` 是聯合型別** — `string | { type: 'linear'; from: string; to: string }`。自訂渲染器必須處理兩種情況；上方程式碼片段使用來自 `@openpen/module-api` 的 `resolveStrokeColor(color)` 為 `ctx.strokeStyle` 挑選一個代表性的 CSS 顏色值（線性漸層時取 `color.from`）。
5. **游標與工具的連結** — `CursorContribution.id === ToolContribution.id`。請確保 id 完全匹配，否則 host 會退回預設游標。

編譯並安裝後，新工具會在 host 載入時出現在控制列中。完整的 `ToolContribution`、`Tool`、`Stroke`、`StrokeStyle` 介面請參閱 [`canvas.tools`](../slots/canvas#canvas-tools)；`CursorContribution` 的形狀及 `--openpen-cursor-accent` 主題慣例請參閱 [`ui.cursors`](../slots/ui#ui-cursors)。

---

## 4. 新增帶有 `ctx.t()` 和 `ctx.notify()` 的 `setup` hook

`locales/en.json` 存放所有可翻譯的字串。`name` 和 `description` 鍵是保留給模組管理器 UI 使用的；在其旁邊加入你自己的執行時期字串：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "notif": { "ready": "Highlighter loaded" }
}
```

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [{ id: 'highlighter', component: HighlighterButton }],
    locales: { en, 'zh-Hant': zhHant },
  },

  setup(ctx) {
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
    ctx.onDispose(() => {
      // cancel timers, remove listeners, etc.
    })
  },
})
```

### `ctx` 提供的內容

| 方法 | 說明 |
|--------|-------------|
| `ctx.t(key, params?)` | 在此 module 的語系命名空間中解析 i18n 鍵。 |
| `ctx.notify(payload)` | 在覆蓋視窗中顯示 toast 提示。返回 `NotifyHandle`。 |
| `ctx.getSettings<T>()` | 返回此 module 的設定。 |
| `ctx.callMain(action, payload?)` | 呼叫此 module 的其中一個主程序處理器。 |
| `ctx.onDispose(fn)` | 註冊清理回呼——在 module 被卸載時呼叫。 |
| `ctx.moduleId` | 此 module 的 id 字串。 |
| `ctx.locale` | 目前啟用的語系，例如 `'en'`。唯讀。 |

---

## 4a. Vue 元件中的 i18n

`ctx.t()` 在 Vue 元件範本中同樣適用——使用 `useModuleContext()` 取得 context，
並與在 `setup()` 中完全相同的方式呼叫 `ctx.t()`。

> **重要：** 傳給 `useModuleContext()` 的參數必須與 `plugin.json`（以及 `defineModule({ id })`）
> 中的 `id` 欄位完全一致。若不匹配，執行時期會拋出 `Error`，並在訊息中指出未註冊的 id。
> 建議的做法是在某處（例如 `src/module-id.ts`）定義一個 `MODULE_ID` 常數，並在所有地方匯入使用，
> 而非重複輸入字串。

```vue
<!-- HighlighterButton.vue -->
<script setup lang="ts">
import { useModuleContext } from '@openpen/module-api'

// Keys are automatically namespaced — no full path required.
const ctx = useModuleContext('@yourscope/my-highlighter')
</script>

<template>
  <button
    :aria-label="ctx.t('button.label')"
    :data-tip="ctx.t('button.label')"
    @click="activate"
  >
    <!-- icon SVG -->
  </button>
</template>
```

搭配 `locales/en.json`：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "button": { "label": "Highlight" }
}
```

`ctx.t('button.label')` 會在全域 i18n 儲存庫中解析 `yourscope.my-highlighter.button.label`。
語系變更時，元件會響應式地重新渲染。

> **不要**直接呼叫 `vue-i18n` 的 `useI18n()` 並傳入部分路徑如 `t('button.label')`
> ——那會對 host 的語系儲存庫進行解析，而非你的 plugin 命名空間，並且會靜默地返回鍵字串而非翻譯結果。
> 在 Vue 元件中請一律透過 `useModuleContext().t()`。

---

## 5. 開發工作流程

```bash
npm run dev      # watch mode — rebuilds dist/renderer.js on every save
```

若要在 OpenPen 中測試變更，請複製並重新啟動：

```bash
npx openpen-cli plugin add .
# then restart OpenPen
```

目前沒有熱重載橋接機制。循環流程為：編輯 → 編譯 → 安裝 → 重新啟動。

---

## 6. 打包以供發佈

當你的 plugin 準備好分享時，建立可發佈的 zip 檔：

```bash
npm run build          # clean production build
npx openpen-cli pack       # creates: yourscope-my-highlighter-0.1.0.zip
                       # prints: sha256: <hex>
```

zip 檔僅包含 `plugin.json`、`dist/` 和 `locales/`——不含 `src/`、
`node_modules/` 或 lifecycle 腳本。

---

## 7. 發佈至目錄

### 步驟 1 — 建立 GitHub Release

```bash
gh release create v0.1.0 ./yourscope-my-highlighter-0.1.0.zip
```

### 步驟 2 — 開啟目錄 PR

```bash
npx openpen-cli publish
```

`openpen publish` 會讀取 `plugin.json`、驗證 GitHub Release 是否存在、
確認你已驗證的 GitHub 登入與 plugin scope 相符、計算 sha256，
並在 `OpenPen-plugins` 目錄 repo 中開啟一個**註冊 PR**。

**後續步驟：**

- 目錄機器人會自動驗證你的 PR（scope、id 格式、sha256、release URL）。
- 維護者審閱註冊 PR——首次提交需要人工審核。
- 合併後，CI 會重新生成 `plugins.json`，使你的 plugin 可在 OpenPen 市集中被發現。

### 更新你的 plugin

後續發佈的流程相同，但步驟 2 會開啟**更新 PR** 而非註冊 PR。更新 PR 在通過驗證後會由機器人自動合併——無需人工審閱。

```bash
# bump version in plugin.json, then:
npm run build
npx openpen-cli pack
gh release create v0.2.0 ./yourscope-my-highlighter-0.2.0.zip
npx openpen-cli publish
```

---

## 後續延伸

- [Module 架構](../concepts/module-architecture.md) — 四層設計以及 plugin 的定位
- [信任模型](../concepts/trust-model.md) — plugin 能做與不能做的事
- [Slot 參考](../slots/index.md) — 所有 contribution slot
- [UIKit 參考](../uikit/index.md) — 預建 UI 元件
- [Notify API](../reference/notify-api.md) — toast 通知與 i18n
