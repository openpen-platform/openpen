---
title: Primitives、Escape Hatch 與設計 Token
description: 當你需要完整的標記或樣式控制，超出 AppPopover / AppDialog / AppSlider 包裝器所提供的範圍時，可直接使用 Reka UI primitives。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# Primitives、Escape Hatch、設計 Token 與上游注意事項

---

## §1 Primitives（第 2 層）

若要在保留無障礙功能與鍵盤導覽的前提下，取得完整的標記／樣式控制能力：

```ts
import {
  // Popover
  PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow,
  // Dialog
  DialogRoot, DialogTrigger, DialogPortal, DialogContent, DialogOverlay,
  // Slider
  SliderRoot, SliderTrack, SliderRange, SliderThumb,
  // Switch (toggle)
  SwitchRoot, SwitchThumb,
  // RadioGroup (segmented control)
  RadioGroupRoot, RadioGroupItem,
  // Select (dropdown)
  SelectRoot, SelectTrigger, SelectPortal, SelectContent, SelectItem,
  // Tooltip
  TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent,
  // Tabs
  TabsRoot, TabsList, TabsTrigger, TabsContent,
  // NumberField — numeric spinner with +/– buttons (no wrapper equivalent)
  NumberFieldRoot, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement,
  // TagsInput — chip / token input (no wrapper equivalent)
  TagsInputRoot, TagsInputInput, TagsInputItem,
  TagsInputItemText, TagsInputItemDelete, TagsInputClear,
  // Combobox — searchable dropdown with free-text (no wrapper equivalent)
  ComboboxRoot, ComboboxAnchor, ComboboxInput, ComboboxTrigger,
  ComboboxPortal, ComboboxContent, ComboboxViewport, ComboboxItem,
  ComboboxItemIndicator, ComboboxGroup, ComboboxLabel,
  ComboboxSeparator, ComboboxEmpty, ComboboxArrow, ComboboxCancel,
} from '@openpen/module-api/uikit'
```

這三個 primitive 群組沒有對應的第 1 層包裝器。
如需引導式用法與完整樣式範例，請參閱
[custom-components.md](./custom-components.md)。

**上游文件：**
- NumberField → [reka-ui.com/components/number-field](https://reka-ui.com/docs/components/number-field)
- TagsInput → [reka-ui.com/components/tags-input](https://reka-ui.com/docs/components/tags-input)
- Combobox → [reka-ui.com/components/combobox](https://reka-ui.com/docs/components/combobox)

使用此層時，plugin 作者 **MUST** 自行管理：
- Modal 管理器互斥鎖（`MODAL_MANAGER_KEY`）
- ControlBar 動畫保護（`CONTROL_BAR_ANIMATING_KEY`）
- 滑鼠穿透註冊（來自 `@openpen/module-api/host` 的 `usePassthroughGuard`）
- Teleport 目標（`WRAPPER_EL_KEY`）

---

## §2 Escape Hatch（第 3 層）

plugin **MAY** 直接在自己的 `package.json` 中安裝任何 headless 或元件程式庫。UIKit **MUST NOT** 封鎖此行為。視覺上符合 OpenPen 樣式，以及處理所有 Electron 特有的邊緣情況，均為 plugin 作者的責任。

---

## §3 設計 Token

所有包裝器均使用 `--openpen-*` CSS 變數。plugin **MAY** 參照這些 token 來配合主機佈景主題：

```css
color: var(--openpen-color-text-primary);
background: var(--openpen-color-surface-popup);
border-color: var(--openpen-color-border-hi);
border-radius: var(--openpen-radius-md);
```

完整 token 清單：`packages/module-api/src/uikit/tokens.css`。

---

## §4 Peer dependencies 與 importmap 合約

`vue` 和 `@openpen/module-api` 是每個 plugin 的 **peer dependencies**，由主機在執行階段提供——plugin **MUST NOT** 將它們打包。

### 為何必須設為外部依賴

建置 CLI（`@openpen/build`）預先設定 Rollup 將這些套件外部化：

```
rollupOptions.external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit']
```

執行階段時，主機透過 `dist/index.html` 中的
[importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
解析這些裸指定符：

```json
{
  "imports": {
    "vue": "./openpen-runtime/vue.js",
    "@openpen/module-api": "./openpen-runtime/module-api.js",
    "@openpen/module-api/uikit": "./openpen-runtime/module-api-uikit.js"
  }
}
```

`openpen-runtime/*.js` 檔案是在 `npm run build` 期間（透過 `scripts/build-runtime.mjs`）輸出的獨立 ESM bundle。由於主機應用程式與每個 plugin 都將這些指定符解析至相同的檔案，它們共用同一個 Vue 實例——這意味著跨邊界的響應式與 `provide`/`inject` 可正常運作。

### Plugin 作者規則

- **MUST** 將 `vue` 和 `@openpen/module-api` 保持為外部依賴。打包它們會產生第二個 Vue 實例，導致響應式失效，且 `inject` 也會無法使用。
- **MUST** 將 `@openpen/module-api/uikit` 保持為外部依賴。打包它會產生 headless 程式庫的第二份副本，並破壞在主機與 plugin 邊界之間以身份比對的 Symbol inject 鍵（`MODAL_MANAGER_KEY`、`WRAPPER_EL_KEY` 等）。
- **MUST NOT** 將 `vue`、`@openpen/module-api` 或 `@openpen/module-api/uikit` 加入 `dependencies` 或 `bundledDependencies`。它們應放在 `devDependencies`（或可發佈 plugin 套件的 `peerDependencies`）中。
- 若你使用 `@openpen/build`（預設），這三個套件會自動外部化。只有在有特定原因時才覆寫 `rollupOptions.external`。

### 在本機測試 plugin

載入 plugin 需要正式建置（importmap 僅存在於 `dist/index.html`）。請執行：

```bash
npm run build                  # Build host + runtime shims
cd packages/my-plugin && npm run build  # Build plugin
# Then install to ~/.openpen/plugins/ and launch with NODE_ENV=production
```

Vite 開發伺服器（`npm run dev`）**不會**載入 plugin——開發中介軟體雖然服務 runtime shim URL，但在開發模式下不會掃描安裝於 `~/.openpen/plugins/` 的 plugin。

---

## §5 上游依賴注意事項

OpenPen UIKit 內部包裝了一個 headless 程式庫。該程式庫**不屬於**公開 API 介面。若底層程式庫未來被替換，此處記載的包裝器屬性／事件／插槽將不會改變。

---

*最後更新：2026-04-24*
