---
title: UI 插槽
description: 9 個控制列項目、設定面板、游標、狀態徽章、強制回應視窗及系統匣／右鍵選單的 contribution 插槽。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# UI 插槽

UI 插槽涵蓋 host chrome 中所有渲染內容：控制列項目、
設定面板與頁籤、各工具游標、狀態徽章、受管理的強制回應視窗、系統
匣選單項目、右鍵選單，以及佈景主題 token 覆寫。

## `ui.control-bar` — ✅ 已開放 {#ui-control-bar}

- **Contribution 鍵值**：`controlBar`
- **型別**：`ControlBarContribution[]`
- **用途**：控制列中的按鈕、滑桿與彈出觸發器。群組與項目順序可透過 `config.json` 中的 `controlBarLayout` 鍵值由使用者自訂。完整 schema 請參閱 [控制列佈局](../reference/control-bar-layout.md)。
- **排序**：不由 module 宣告。項目會放置於 `'default'` 群組，直到使用者進行設定；可透過 `defaultGroup` + `groupHint` 建議新群組（詳見下方）。

### `ControlBarContribution` 型別

```ts
interface ControlBarContribution {
  id: string            // MUST be globally unique across all modules.
  component: Component  // Vue component rendered as the bar item.
  defaultGroup?: string // Preferred group on first install. Omit → 'default'.
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    // 'auto'   — host decides based on neighbouring groups (default).
    // 'always' — force a visual divider before this item's group.
    // 'never'  — suppress any auto-divider (use for tightly coupled items).
    label?: string | LocaleMap  // Display name for the auto-created group.
  }
}
```

`defaultGroup` 與 `groupHint` 僅為**提示**——在首次安裝後，使用者儲存的佈局
永遠優先於這些提示。

## `ui.settings.panels` — ✅ 已開放 {#ui-settings-panels}

- **Contribution 鍵值**：`settingsPanels`
- **型別**：`SettingsPanelContribution[]`
- **用途**：設定視窗中「功能」頁籤內依 module 分組的區塊。這是 module 偏好設定的建議起點——面板會在 module 啟用或停用時自動顯示或隱藏。

### `SettingsPanelContribution` 型別

```ts
interface SettingsPanelContribution {
  id: string                      // unique within this module
  label: string | LocaleMap       // section heading shown above the component
  component: Component            // Vue component rendered as the section body
}
```

> **選擇 `settingsPanels` 或 `settingsTabs`**：若只有一兩列偏好設定，請使用 `settingsPanels`；僅當 module 需要豐富的多區段佈局時，才使用專屬頁籤。完整決策表請參閱 [guides/module-settings.md](../guides/module-settings.md)。

## `ui.settings.tabs` — ✅ 已開放 {#ui-settings-tabs}

- **Contribution 鍵值**：`settingsTabs`
- **型別**：`SettingsTabContribution[]`
- **用途**：設定視窗中的獨立頂層頁籤。每個 contribution 是一個全寬 Vue 元件加上 i18n 標籤。除非 module 需要豐富的佈局控制（多個子區段、預覽區域等），否則請優先使用 `settingsPanels`。

## `ui.cursors` — ✅ 已開放 {#ui-cursors}

- **Contribution 鍵值**：`cursors`
- **型別**：`CursorContribution[]`
- **用途**：繪圖模式啟用時，依工具渲染的 DOM 游標。host 會隱藏 OS 游標（`cursor: none`）並將對應的游標 SVG / PNG 掛載為跟隨滑鼠的 DOM 元素——完全繞過 OS compositor，因此游標可在 macOS 透明覆蓋層上穩定渲染。

### Contribution 結構

```ts
interface CursorContribution {
  /** MUST match the `id` of the `ToolContribution` this cursor activates for. */
  id: string
  cursor: CursorSpec
}

type CursorSpec = string | SvgCursorSpec | PngCursorSpec

interface SvgCursorSpec {
  svg: string                  // inline `<svg>...</svg>` OR plugin-relative path
  hotspot?: { x: number; y: number }   // default `{x:0, y:0}`
  fallback?: string            // CSS keyword fallback, default `'crosshair'`
}

interface PngCursorSpec {
  png: string                  // plugin-relative path; no inline form
  hotspot?: { x: number; y: number }
  fallback?: string
}
```

**連結規則（關鍵）。** `CursorContribution` 上的 `id` 欄位 MUST 等於你希望此游標對應的 `ToolContribution`（位於 `canvas.tools`）的 `id`。host 會在每次工具切換時以精確 id 比對來解析游標 → 工具。`id` 若未與任何已註冊工具相符，不會報錯但也不會生效（host 會退回該工具的預設游標）。

### DX 模式

1. **CSS 關鍵字（舊式）** — `{ id, cursor: 'crosshair' }`。僅接受 32 個 W3C 游標關鍵字；此情況下 host 渲染預設 DOM 游標（關鍵字本身不會路由至 CSS）。
2. **內嵌 SVG** — `{ id, cursor: { svg: '<svg>…</svg>', hotspot: { x, y } } }`。host 會在掛載前透過 `compileCursor()` 內的 DOMPurify 處理標記，再以 `v-html` 掛載。
3. **Vite `?raw` 匯入** — `import laserSvg from './laser.svg?raw'`，再使用 `{ svg: laserSvg, hotspot: … }`。與內嵌相同；建置時會將檔案內容內嵌。
4. **相對路徑** — `{ svg: 'assets/laser.svg' }` 或 `{ png: 'assets/stamp.png' }`。host 會解析為 `openpen-plugin://<hostname>/<path>`，並在 `compileCursor()` 的掛載時機進行擷取。SVG 路徑經由 DOMPurify 處理；PNG 路徑被包裝於 `<img>`（點陣圖在 DOM 情境中不會執行）。

URL 形式（`http://`、`https://`、`data:`、`file://`、`openpen-plugin://`）、絕對路徑及 `..` 路徑穿越，均會在註冊時被拒絕。

### 以目前筆觸顏色設定佈景主題

host 會將目前作用中的筆觸顏色以 CSS 自訂屬性的形式公開於 `document.documentElement`：

```
--openpen-cursor-accent
```

游標 SVG 可在 fill / stroke 屬性中引用此屬性，以跟隨使用者選取的顏色：

```html
<circle fill="var(--openpen-cursor-accent, #818cf8)" ... />
<line stroke="var(--openpen-cursor-accent, #818cf8)" ... />
```

當使用者選取漸層時，此變數解析為漸層的 `from` 端點（游標只有一個強調色插槽）。回退值（第二個 `var()` 引數）涵蓋第一個筆觸樣式事件觸發前的短暫空窗期——請選擇符合你設計的合理預設值。

此為選用功能：硬編碼填色的游標不受使用者選取顏色影響。內建的 `freehand`、`line` 及 `shape` 游標採用此慣例；`eraser`（粉塵為中性灰）和 `stroke-eraser`（紅 + 靛藍組合代表「刪除整個筆觸」）則刻意不採用。

### 安全契約（plugin 作者須知）

- 嵌入的 `<script>`、`onload=`、`onclick=`、`<foreignObject>` 及外部 `<image href>` / `<use href>` 會在任何標記到達 `v-html` 之前，由 DOMPurify 進行清理。清理動作在 `compileCursor()` 內執行，時機為游標掛載時（即作用中工具切換時）——而非在註冊時。針對公開 API 開發的 plugin 無需自行呼叫 DOMPurify。
- 在註冊時，host 會將每個 cursor contribution 正規化為嚴格的白名單（僅允許 `id`、`cursor.svg | cursor.png`、`cursor.hotspot`、`cursor.fallback` 通過），並在自身儲存一份**不可變的凍結快照**。在 `setup()` 中修改 `myModule.contributes.cursors[0].cursor` 只會成功修改 plugin 自身的複本，對 host 實際渲染的內容毫無影響——host 讀取的是自身的快照。改變渲染游標的唯一方式，是發布新的 module 版本。
- 舊式 `cursor: string` 形式會拒絕任何包含 `url(`、`image-set(`、`-webkit-image-set(`、`javascript:` 或 `expression(` 的值。

## `ui.status` — ✅ 已開放 {#ui-status}

- **Contribution 鍵值**：`status`
- **型別**：`StatusContribution[]`
- **用途**：控制列上的短暫狀態徽章（錄製指示器、同步狀態）。

## `ui.modals` — ✅ 已開放 {#ui-modals}

- **Contribution 鍵值**：`modals`
- **型別**：`ModalContribution[]`
- **用途**：由全域強制回應視窗堆疊管理的已註冊強制回應視窗。提供焦點鎖定、ESC 關閉及重疊防護，讓 plugin 無需自行重新實作這些基本功能。

## `ui.tray.menu` — ⏳ 已保留 {#ui-tray-menu}

- **Contribution 鍵值**：`trayMenu`
- **型別**：`TrayMenuContribution[]`
- **用途**：系統匣選單項目（與內建的顯示 / 隱藏 / 結束並列）。
- **保留原因**：匣管理器尚未使用 plugin contribution。

## `ui.context.menu` — ⏳ 已保留 {#ui-context-menu}

- **Contribution 鍵值**：`contextMenu`
- **型別**：`ContextMenuContribution[]`
- **用途**：畫布、工具列或系統匣上的右鍵選單項目。
- **保留原因**：右鍵選單的 UI 設計尚未定案；將於後續版本推出。

## `ui.theme.tokens` — ⏳ 已保留 {#ui-theme-tokens}

- **Contribution 鍵值**：`themeTokens`
- **型別**：`ThemeTokenContribution`
- **用途**：由 module 提供的 CSS 自訂屬性（色彩色票、間距 token、漸層預設值）。
- **保留原因**：預期最初使用者為色彩調色盤 plugin；待該 plugin 出現時再建置此插槽。
