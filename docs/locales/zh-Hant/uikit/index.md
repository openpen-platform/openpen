---
title: UIKit
description: OpenPen plugin 作者專用的元件庫——從高階封裝到逃生艙口共三個層次。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# OpenPen UIKit

OpenPen UIKit 的封裝層會自動處理 inject key、互斥鎖、動畫防護以及滑鼠穿透。Plugin 作者**必須**從這裡開始；你不需要了解底層 headless 函式庫的任何細節。

Import 路徑：

```ts
import {
  AppButton, AppButtonDropdown,
  AppPopover, AppDialog,
  AppSlider, AppToggle, AppSegmented,
  AppSelect, AppTooltip, AppTabs,
  AppBanner,
  useDialog, useDialogPluginComponent,
} from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
```

> 若需要以下未列出的元件（標籤輸入、數字微調器、combobox），請參閱
> [custom-components.md](./custom-components.md)。

---

## 三個層次——為任務選擇正確的層級

UIKit 提供三個遞升的 API 存取層次。事先選對層次，可以避免日後被迫重寫。

| 層次 | Import 路徑 | DX 成本 | 視覺一致性 | Bundle 影響 | 自由度 |
|---|---|---|---|---|---|
| **封裝層（Wrapper）** | `@openpen/module-api/uikit` | 低 | 自動——設計 token 已套用 | 最小 | 低 |
| **原始元件重新匯出（Primitive re-export）** | `@openpen/module-api/uikit`（具名匯出） | 中 | Token 驅動——你自己撰寫 CSS | 中 | 高 |
| **逃生艙口（Escape hatch）** | 你自己安裝的 `reka-ui`（或任何函式庫） | 自行管理 | 自行管理 | 最大 | 無限制 |

### 決策原則

**封裝層** — 絕大多數元件請使用此層。你可以零樣板獲得 popover、dialog、slider、toggle 等：inject key、互斥鎖、ControlBar 動畫防護以及滑鼠穿透全部由內部處理。

**原始元件重新匯出** — 當你需要完全掌控標記與樣式，但又想保留 headless primitive 帶來的無障礙功能與鍵盤導覽行為（焦點捕捉、ARIA 屬性、鍵盤關閉等）時，請使用此層。你自己撰寫 CSS；你自行管理互斥鎖與穿透（請參閱 `docs/uikit/primitives.md`）。

**逃生艙口** — 當你的 UI 模式在封裝層或原始元件層均無對應實作時（例如圖形編輯器或 3D 視窗），請使用此層。你可以在 plugin 自己的 `package.json` 中自由安裝任何函式庫。代價是：視覺一致性、無障礙功能以及該介面的長期維護均由你負責。特別要注意的是，若 host 日後替換底層 headless 函式庫（參見下方「若我們替換底層 headless 函式庫」），你直接 import 的部分需要你自行移植——host 的封裝 API 會保持穩定，但你自行打包的第三方 import 則不會。

> 若不確定要使用哪個層次，請從封裝層開始。之後可以隨時降到更底層；反向升層則困難得多。

---

## 元件

| 元件 | 層次 | 使用情境 |
|---|---|---|
| [`AppPopover`](./app-popover) | 封裝層 | 錨定到觸發元素的浮動面板 |
| [`AppDialog`](./app-dialog) | 封裝層 | 含遮罩與焦點捕捉的強制回應 dialog |
| [`useDialog`](./use-dialog) | 封裝層 | 命令式 Promise 型 dialog API |
| [`AppSlider`](./app-slider) | 封裝層 | 數值範圍輸入 |
| [`AppToggle`](./app-toggle) | 封裝層 | 布林開關 |
| [`AppSegmented`](./app-segmented) | 封裝層 | 互斥分段控制項 |
| [`AppSelect`](./app-select) | 封裝層 | 單選下拉選擇器 |
| [`AppTooltip`](./app-tooltip) | 封裝層 | 懸停提示標籤 |
| [`AppTabs`](./app-tabs) | 封裝層 | 受控標籤頁內容容器 |
| [`AppBanner`](./app-banner) | 封裝層 | 內嵌狀態與回饋訊息 |
| [`AppButton`](./app-button) | 封裝層 | 標準控制列動作按鈕 |
| [`AppButtonDropdown`](./app-button-dropdown) | 封裝層 | 分離模式按鈕：主動作 + 插入號觸發 popover |
| [`primitives`](./primitives) | 原始元件重新匯出 | 用於自訂標記的原始 Reka UI 重新匯出 |

逃生艙口層（從頭自行撰寫）請參閱 [`custom-components`](./custom-components)。

---

## 若我們替換底層 headless 函式庫

OpenPen UIKit 目前以 **Reka UI** 作為其 headless 行為層。這是內部實作細節。只從 `@openpen/module-api/uikit` import 的 plugin 作者永遠不應感知到它。

若 Reka UI 日後被棄用、停止維護，或與專案需求出現重大分歧，host 有一份已記錄的備援順序：

1. **Headless UI Vue**（Tailwind Labs 官方 Vue 移植版）——成熟、廣泛使用、元件集較小。
2. **Ark UI**（基於 Zag.js 建構，跨框架並支援 Vue）——元件覆蓋範圍更廣，以狀態機驅動。
3. **自行撰寫 headless primitive**——若以上兩個選項均不可行的最後手段。

### 各層次的影響

| 層次 | 函式庫替換的影響 |
|---|---|
| **封裝層**（`@openpen/module-api/uikit`） | 你的程式碼無需修改。封裝 API——屬性、事件、插槽——是由 host 管理的穩定契約。 |
| **原始元件重新匯出**（`@openpen/module-api/uikit` 具名 primitive） | 將發布主版本號升級。你需要進行小規模、有針對性的移植，以更新有變動的原始元件名稱或屬性。 |
| **逃生艙口**（直接 import 第三方函式庫） | 你需自行負責完整移植該介面。host 無法在此提供協助，因為你已選擇退出封裝契約。 |

這份說明提前記錄，讓你在選擇投入哪個層次時能做出知情的決定。封裝層是 host 團隊承諾在函式庫替換期間持續維護的長期契約。若長期穩定性比最大 UI 自由度更重要，封裝層是正確的選擇。
