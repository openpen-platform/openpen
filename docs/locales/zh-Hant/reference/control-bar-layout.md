---
title: 控制列佈局
description: OpenPen 設定檔中控制控制列項目順序、群組與分隔線的 JSON 佈局結構。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 控制列佈局

控制列佈局以 JSON 結構儲存於你的 OpenPen 設定檔中。
編輯它可讓你重新排列項目順序、在視覺上將項目分組，以及控制
分隔線 — 完全不需要動任何 plugin 程式碼。

---

## 設定檔位置

OpenPen 從 Electron userData 目錄下的 `config.json` 讀取並寫入佈局狀態：

| 作業系統 | 路徑 |
|---|---|
| macOS | `~/Library/Application Support/OpenPen/config.json` |
| Windows | `%APPDATA%\OpenPen\config.json` |
| Linux | `~/.config/OpenPen/config.json` |

佈局儲存於 `controlBarLayout` 鍵下，與其他使用者設定並列。

> **編輯前注意**：請先關閉 OpenPen。應用程式會將檔案保留在記憶體中，
> 並於關閉時覆寫，因此在應用程式執行期間所做的修改將會遺失。

---

## Schema

```json
{
  "controlBarLayout": {
    "version": 1,
    "groups": [
      {
        "id": "tools",
        "items": ["freehand", "line", "shape"],
        "separator": "always",
        "inset": { "enabled": true }
      },
      {
        "id": "default",
        "items": ["color-picker", "stroke-width"],
        "separator": "auto"
      }
    ]
  }
}
```

### `version`

固定為 `1`，保留供未來遷移使用。

### `groups`

`LayoutGroup` 物件的有序陣列。控制列依此陣列的順序由左至右渲染各群組。

**限制**（任何違規都會在下次啟動時將佈局重設為內建預設值）：
- 必須恰好包含一個 `id: "default"` 的群組。
- 群組 `id` 值必須唯一。
- 一個項目 id 不得出現在超過一個群組中。

---

## `LayoutGroup` 欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | `string` (kebab-case) | **是** | 唯一群組識別碼。`"default"` 保留供未分組項目使用。 |
| `items` | `string[]` | **是** | 此群組中項目 contribution id 的有序清單。 |
| `separator` | `'auto' \| 'always' \| 'never'` | 否 | 此群組前的視覺分隔線（預設值：`'auto'`）。 |
| `inset` | `GroupInset` | 否 | 存在且 `enabled: true` 時，以可見背景 + 邊框容器渲染群組。 |

### `separator` 值

| 值 | 行為 |
|---|---|
| `'auto'` | 在此群組前渲染分隔線（預設值）。未來版本可能在相鄰群組來自相同 module 時省略分隔線。 |
| `'always'` | 永遠在此群組前繪製分隔線。 |
| `'never'` | 此群組前不顯示分隔線。 |

### `GroupInset` 欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `enabled` | `boolean` | **是** | 設為 `true` 以啟用視覺容器。 |
| `color` | `string` | 否 | 內嵌背景的 CSS 顏色覆寫值，預設為 `--openpen-color-control-group`。 |

當 `inset.enabled` 為 `true` 時，群組會以圓角容器渲染，將其項目在視覺上綁在一起
（即「工具群組」外觀）。容器高度與未換行的 36 px 按鈕相符 — 啟用 inset 不會改變列的高度。

---

## 項目 id 的來源

每個項目的 id 來自 module 的 `ControlBarContribution` 中的 `id` 欄位：

```ts
// packages/module-api/src/types/control-bar-layout.ts
interface ControlBarContribution {
  id: string       // globally unique across all modules — use "pluginId-itemName"
  component: Component
  defaultGroup?: string
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    label?: string | LocaleMap
  }
}
```

Plugin 作者以 `defaultGroup` 與 `groupHint` 作為首次安裝時的提示。
**一旦使用者的佈局已儲存，佈局永遠優先** — 提示僅在項目尚無已儲存位置時生效。

---

## 協調機制（安裝新 plugin 時的行為）

當 OpenPen 載入時發現某個 plugin 項目不在任何已儲存的佈局群組中：

1. 該項目會被指派到其 `defaultGroup`（來自 `ControlBarContribution.defaultGroup`）。
2. 若已儲存的佈局中尚不存在該群組，主機會自動建立它 —
   使用該項目的 `groupHint` 作為其分隔線與標籤。
3. 若未宣告 `defaultGroup`，項目會被附加至 `"default"`。

已存在於已儲存佈局中的項目不會被移動。這表示安裝新 plugin 永遠不會干擾現有項目的排列。

---

## 驗證與損毀復原

OpenPen 在啟動時套用三層驗證：

| 層級 | 檢查內容 | 失敗時 |
|---|---|---|
| **L1** — JSON 解析 | 檔案為有效 JSON | 將所有使用者設定重設為預設值 |
| **L2** — Schema | `controlBarLayout` 符合預期結構 | 僅重設佈局為內建預設值；其他設定保留 |
| **L3a** — 修復 | 缺少 `'default'` 群組；無效的 `separator` 值 | 原地修復而不遺失資料；記錄 `console.info` 訊息 |

L2 重設僅影響佈局 — 你的主題、語言與快捷鍵不受影響。

---

## 參閱

- [Contribution Slot Catalog](../slots/ui#ui-control-bar) — `ui.control-bar` slot 與 `ControlBarContribution` 型別
- [Module Architecture](../concepts/module-architecture.md) — 內建與 plugin module 如何宣告 contribution
