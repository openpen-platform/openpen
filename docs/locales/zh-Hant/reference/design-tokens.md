---
title: OpenPen Design Tokens
description: 以 --openpen-* 前綴公開給 plugin 元件使用的 CSS 自訂屬性，代表宿主應用程式的視覺語言。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# OpenPen Design Tokens

OpenPen 以 `--openpen-*` 前綴公開一組 CSS 自訂屬性（design tokens）。這些 token 代表宿主應用程式的視覺語言：顏色、間距、圓角、動畫時間與視覺效果。

Plugin 作者 SHOULD 在元件樣式中參照這些 token，而非直接寫死原始數值。Token 是確保視覺一致性以及在 OpenPen 各版本間自動切換深色／淺色主題的唯一可靠方式。

---

## Plugin 如何自動取得 token

OpenPen 的 design tokens 在宿主應用程式啟動時載入一次（透過匯入至宿主 CSS 串接的 `@openpen/module-api/uikit/tokens.css`）。由於 plugin 與宿主在**同一份文件**中執行——`openpen-plugin://` scheme 與 importmap 將每個 plugin 接入共享的 Vue 實例與共享的瀏覽情境——CSS 串接會自動繼承。

具體而言：plugin SFC 中任何寫了 `var(--openpen-*)` 的作用域樣式，都會在不需額外設定的情況下解析為當前主題的 token 值。

```css
/* Works out of the box in any plugin SFC */
.my-panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  color: var(--openpen-color-text-primary);
}
```

**請勿**在你的 plugin 進入點加入 `import '@openpen/module-api/uikit/tokens.css'`。宿主已將這些宣告注入至 `:root`；在 plugin bundle 中重複匯入會造成多餘（且可能產生衝突）的第二次注入。

---

## 選擇性顯式匯入

如果你需要建構一個在宿主文件範圍之外渲染的元件——例如，一個開啟獨立 `BrowserWindow` 的 plugin——就需要直接將 token 樣式表匯入至該視窗的文件中。目前 plugin 系統不支援這個情境，但為了向前相容，匯出路徑已預留：

```ts
// Only needed if your component renders in a completely separate window.
// In normal plugins this import is unnecessary.
import '@openpen/module-api/uikit/tokens.css'
```

---

## Token 參考

所有 token 定義在 `:root`（深色主題預設值），並以 `[data-theme='light']` 覆寫區塊處理淺色主題。請參閱下方的[深色／淺色主題相容性](#深色淺色主題相容性)章節。

### Color — Accent

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-accent` | `#818cf8` | 主要品牌色／互動高亮 |
| `--openpen-color-accent-hover` | `#6366f1` | `:hover` 狀態的深色 accent |
| `--openpen-color-accent-bg` | `rgba(129,140,248,0.18)` | 作用中項目的著色背景 |
| `--openpen-color-accent-glow` | `rgba(129,140,248,0.35)` | 作用中元素的 box-shadow 光暈 |

### Color — Surface

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-surface` | `rgba(18,26,48,0.88)` | 浮動面板／工具列的主要背景 |
| `--openpen-color-surface-hi` | `rgba(30,41,70,0.92)` | 巢狀面板／懸停狀態的上浮 surface |
| `--openpen-color-surface-popup` | `rgba(20,28,50,0.90)` | Popover／下拉面板背景 |

### Color — Border

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-border` | `rgba(255,255,255,0.10)` | 預設的細緻邊框 |
| `--openpen-color-border-hi` | `rgba(255,255,255,0.20)` | 焦點環／popup 框架的高對比邊框 |
| `--openpen-color-popover-frame` | `var(--openpen-color-border-hi)` | popover 的共用邊框與箭頭填色（確保連續邊緣） |

### Color — Text

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-text-primary` | `#f1f5f9` | 主要內容文字 |
| `--openpen-color-text-dim` | `#94a3b8` | 次要／標籤文字 |
| `--openpen-color-text-muted` | `#64748b` | 佔位符／停用狀態文字 |

### Color — Tooltip

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-tooltip-bg` | `rgba(15,23,42,0.96)` | Tooltip 背景（永遠為深色，與主題無關） |
| `--openpen-color-tooltip-text` | `#f1f5f9` | Tooltip 文字（永遠為淺色，與主題無關） |
| `--openpen-color-tooltip-border` | `rgba(255,255,255,0.15)` | Tooltip 邊框（永遠為深底淺色，與主題無關） |

### Color — Control bar chrome

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-control-hover` | `rgba(255,255,255,0.08)` | Control bar 按鈕懸停背景 |
| `--openpen-color-control-group` | `rgba(255,255,255,0.04)` | Control bar 群組容器背景 |

### Color — State（info / warning / success / error）

每個語意狀態各有 4 個 token：`bg`、`border`、`text`、`icon`。

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-state-info-bg` | `rgba(59,130,246,0.10)` | Info 狀態背景 |
| `--openpen-color-state-info-border` | `rgba(59,130,246,0.26)` | Info 狀態邊框 |
| `--openpen-color-state-info-text` | `#93c5fd` | Info 狀態文字 |
| `--openpen-color-state-info-icon` | `#60a5fa` | Info 狀態圖示填色 |
| `--openpen-color-state-warning-bg` | `rgba(251,191,36,0.10)` | Warning 狀態背景 |
| `--openpen-color-state-warning-border` | `rgba(251,191,36,0.28)` | Warning 狀態邊框 |
| `--openpen-color-state-warning-text` | `#fde68a` | Warning 狀態文字 |
| `--openpen-color-state-warning-icon` | `#fbbf24` | Warning 狀態圖示填色 |
| `--openpen-color-state-success-bg` | `rgba(52,211,153,0.10)` | Success 狀態背景 |
| `--openpen-color-state-success-border` | `rgba(52,211,153,0.26)` | Success 狀態邊框 |
| `--openpen-color-state-success-text` | `#6ee7b7` | Success 狀態文字 |
| `--openpen-color-state-success-icon` | `#34d399` | Success 狀態圖示填色 |
| `--openpen-color-state-error-bg` | `rgba(248,113,113,0.10)` | Error 狀態背景 |
| `--openpen-color-state-error-border` | `rgba(248,113,113,0.26)` | Error 狀態邊框 |
| `--openpen-color-state-error-text` | `#fca5a5` | Error 狀態文字 |
| `--openpen-color-state-error-icon` | `#f87171` | Error 狀態圖示填色 |

### Color — 表單控制項

| Token | 預設值（深色） | 說明 |
|---|---|---|
| `--openpen-color-toggle-off` | `rgba(255,255,255,0.12)` | Toggle 切換開關非作用中軌道 |
| `--openpen-color-input-bg` | `rgba(255,255,255,0.07)` | 文字輸入框背景 |

### Layout — Radius

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-radius-sm` | `6px` | 小型元素：tooltip、badge |
| `--openpen-radius-md` | `10px` | 標準元素：按鈕、輸入框 |
| `--openpen-radius-lg` | `14px` | 大型面板：popover、下拉選單 |

### Layout — Spacing

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-space-xs` | `4px` | 緊湊間距 |
| `--openpen-space-sm` | `8px` | 標準內距 |
| `--openpen-space-md` | `12px` | 區塊間距 |
| `--openpen-space-lg` | `16px` | 外邊距／區段間距 |

### Animation — Duration

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-duration-fast` | `150ms` | 微互動（按鈕懸停） |
| `--openpen-duration-base` | `250ms` | 標準過渡（收合） |
| `--openpen-duration-bounce` | `400ms` | 動畫進場（帶回彈的展開） |

### Animation — Easing

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-easing-bounce` | `cubic-bezier(0.34,1.56,0.64,1)` | 帶超出量的彈簧式進場 |
| `--openpen-easing-standard` | `cubic-bezier(0.4,0,0.2,1)` | Material 風格標準緩動 |

### Effects — Shadow

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-shadow` | `0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset` | 完整浮動面板陰影 |
| `--openpen-shadow-sm` | `0 4px 16px rgba(0,0,0,0.40)` | 較小元素的輕量陰影 |

### Effects — Blur

| Token | 值 | 說明 |
|---|---|---|
| `--openpen-blur` | `blur(18px) saturate(160%)` | 磨砂玻璃面板的背景模糊 |

---

## 深色／淺色主題相容性

宿主透過文件根元素上的 `data-theme` 屬性管理主題狀態（`<html data-theme="light">`）。Token 會自動切換數值——只要你的 plugin 元件使用 `var(--openpen-*)`，就能免費跟隨主題。

在主題之間會變化的 token 群組：

- Surface、border、text、control chrome、toggle、input——淺色模式下均有覆寫值
- 語意狀態顏色變體（info / warning / success / error）——淺色模式下均有覆寫值
- Shadow——淺色模式下有覆寫值（更輕、更柔和）
- **Accent、radius、spacing、duration、easing**——在主題之間保持不變

**刻意設計為與主題無關**的 token：

- `--openpen-color-tooltip-bg`、`--openpen-color-tooltip-text` 與 `--openpen-color-tooltip-border`——無論主題為何，永遠保持深色背景搭配淺色文字與邊框，確保可讀性。

```vue
<style scoped>
/* This panel is theme-aware with no extra JS */
.status-card {
  background: var(--openpen-color-surface-hi);
  border: 1px solid var(--openpen-color-border);
  color: var(--openpen-color-text-primary);
  padding: var(--openpen-space-md);
  border-radius: var(--openpen-radius-md);
}
</style>
```

---

## 反面模式

### 寫死顏色值

```css
/* ❌ Hardcoded — breaks in light theme, breaks if host palette changes */
.my-button {
  background: #818cf8;
  border-color: rgba(255, 255, 255, 0.20);
  color: #f1f5f9;
}

/* ✅ Token-driven — follows theme automatically */
.my-button {
  background: var(--openpen-color-accent);
  border-color: var(--openpen-color-border-hi);
  color: var(--openpen-color-text-primary);
}
```

### 在 plugin 中匯入 tokens.css

```ts
// ❌ Redundant — host already injects tokens into :root
import '@openpen/module-api/uikit/tokens.css'

// ✅ Nothing to import — use var(--openpen-*) directly
```

### 自訂 --my-plugin-* token 重複宿主已有的語意

```css
/* ❌ Reinventing what the host already provides */
:root {
  --my-plugin-bg: #818cf8; /* same as --openpen-color-accent */
}

/* ✅ Reference the host token directly */
.item { background: var(--openpen-color-accent-bg); }
```

---

## 延伸閱讀

- [UIKit 元件包裝器](../uikit/index.md) — 自動套用 token 的預建元件
- [Primitives、逃生艙口與 peer dependency 規則](../uikit/primitives.md) — Layer 2/3 存取與 importmap 合約
- [自訂 UIKit 元件指南](../uikit/custom-components.md) — 使用 token 建構自己的元件
