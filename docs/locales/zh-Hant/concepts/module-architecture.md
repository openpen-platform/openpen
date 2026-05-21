---
title: OpenPen 模組架構
description: 主機的三層核心加上 contribution-slot 系統，如何讓內建 module 與第三方 plugin 共用同一套擴充介面。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# OpenPen 模組架構

## TL;DR

OpenPen 採用 **host + contribution-slots 架構**（詳見下文）以及**共用渲染器信任模型**，plugin 與 host 並排執行，由使用者自行決定是否安裝（參見 [`guides/publishing.md`](../guides/publishing.md#trust-model--responsibility)）。兩個層次彼此解耦：slot 系統與信任模型各自獨立演進。

核心只包含框架基礎設施——它不知道工具、形狀或設定面板的存在。所有具體功能，包括內建功能集與第三方 plugin，都實作同一個 `OpenPenModule` 介面，並透過宣告的 **slot** 向 host 貢獻。新增功能永遠不需要修改 host；內建 module 可以移除，plugin 作者擁有與內建 module 相同的能力。

## 三個層次

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 1 — CORE (knows nothing about features)                  │
│   canvas-engine, stroke-store, module-loader, slot-registry,   │
│   settings-store, window-manager, ipc-bridge, i18n-resolver,   │
│   module-runtime, slot-runtime                                 │
└────────────────────────────────────────────────────────────────┘
                            │ same interface
            ┌───────────────┴───────────────┐
            │                               │
┌──────────────────────────┐    ┌──────────────────────────┐
│ LAYER 2 — BUILT-IN       │    │ LAYER 3 — PLUGINS        │
│   modules shipped        │    │ ~/.openpen/plugins/      │
│   with the host          │    │   third-party, runtime   │
│                          │    │   loaded                 │
└──────────────────────────┘    └──────────────────────────┘
```

**內建** module 與 **plugin** module 之間唯一的結構差異在於_位置_（repo 內 vs `~/.openpen/plugins/`）與_治理方式_（隨 host 發布 vs 由使用者安裝）。兩者的介面（`OpenPenModule`）、載入器、驗證器和執行環境完全相同。

## OpenPenModule 介面

每個 module 匯出一個符合 `OpenPenModule` 的單一物件：

```ts
interface OpenPenModule {
  id: string                                  // globally unique, @scope/name format
  version?: string
  minAppVersion?: string
  metadata?: {
    name: LocaleMap                           // e.g. { en: 'My Plugin', 'zh-Hant': '我的插件' }
    description?: LocaleMap
  }
  setup?(ctx: ModuleSetupContext): void | Promise<void>
  contributes?: ModuleContributions           // at least one field required
  settingsSchema?: z.ZodType                  // user-facing prefs
}
```

在「設定 → Modules」中顯示的名稱與說明，來自你語系字典中的兩個**保留鍵**，透過 `contributes.locales` 註冊：

```ts
contributes: {
  locales: {
    en: { name: 'My Plugin', description: 'What it does.' },
    'zh-Hant': { name: '我的插件', description: '功能說明。' },
  },
}
```

host 在渲染「設定 → Modules」時，會從當前語系讀取 `name` 與 `description`。其他鍵可在 `setup()` 中透過 `ctx.t()` 取用，也可在 Vue 元件中透過 `useModuleContext().t()` 取用。

> **`metadata` 作為備用**：頂層 `metadata` 欄位（`metadata.name`、`metadata.description`）是與 i18n 無關的備用來源，當 module 被停用且其 `contributes.locales` 項目尚未接入 host 時使用。以上述 locale 為主的方式才是主要來源，應優先填寫。

請使用 `@openpen/module-api` 提供的 `defineModule()` 宣告你的 module——它提供完整的型別推斷，並在 host 看到你的 contribution 物件之前先行驗證。

## Contribution slots

**slot** 是 host 上的一個型別化擴充點。module 透過在 `contributes` 中新增欄位來選擇加入：

```ts
export default defineModule({
  id: 'stroke-width',
  settingsSchema: z.object({
    defaultWidth: z.number().min(1).max(20).default(4),
    style: z.enum(['slider', 'popup']).default('slider'),
  }),
  contributes: {
    strokeStyle: { provides: ['lineWidth'] },
    controlBar: [{
      id: 'stroke-width-slider',
      component: StrokeWidthSlider,
    }],
    settingsPanels: [{
      id: 'stroke-width-settings',
      label: { en: 'Stroke Width', 'zh-Hant': '筆觸寬度' },
      component: StrokeWidthSettingsPanel,
    }],
  },
})
```

完整的 slot 目錄位於 [`slots/index.md`](../slots/index.md)。

### Slot 狀態

- **`available`** — 已接通至執行環境 adapter；現在即可使用。
- **`reserved`** — 型別與註冊已被接受，但尚無 adapter。你現在就可以發布針對 reserved slot 的 contribution；待 adapter 上線後即會開始運作，你這邊不需要做任何修改。

## `@openpen/module-api` 所提供的內容

`@openpen/module-api` 是 module 和 plugin 唯一允許從 host 匯入的路徑。它匯出：

- `defineModule()` helper
- `useModuleContext(moduleId)` — `getSettings()`、`updateSettings()`、`onSettingsChange()`，用於讀寫持久化的 module 偏好設定（參見 [guides/module-settings.md](../guides/module-settings.md)）
- `MODULE_ID_RE` / `isValidModuleId()` — id 格式驗證
- `resolveLabel()` — `LocaleMap` → 字串，含 BCP-47 fallback
- 所有 slot 定義（`ALL_SLOTS`、`V1_ACTIVE_SLOTS`、`V1_RESERVED_SLOTS`、`getSlot()`、`isKnownSlot()`）
- 所有 TypeScript 型別（`OpenPenModule`、`ModuleContributions`、每種 `*Contribution` 形狀）
- `z` — zod 的重新匯出，供 `settingsSchema` 使用

plugin MUST 只從 `@openpen/module-api` 匯入；host 會在 module 邊界驗證此規則，並拒絕任何來自 host 內部路徑的匯入。

## 你的 plugin 載入時的流程

1. **渲染器啟動**：從 `src/core/modules/` 靜態匯入內建 module，並透過 IPC 從 `~/.openpen/plugins/` 取得第三方 plugin manifest。
2. **驗證**：執行預檢：id 格式、內建與 plugin module 之間的 id 衝突、slot 鍵是否存在、settings schema 解析，以及 minAppVersion 相容性。所有錯誤會一次性收集並回報。
3. **Setup**：每個 module 的 `setup(ctx)` 在每個渲染器視窗（overlay、settings 和 main 各自執行獨立的執行環境）中依照註冊順序呼叫一次。
4. **Slot 接線**：將每個 module 的 `contributes` 連接至對應的 adapter。貢獻至 `controlBar`、`settingsTabs`、`htmlOverlays` 及其他 active slot 的 Vue 元件會被渲染至其容器中。

## 另請參閱

- [`slots/index.md`](../slots/index.md) — 每個 slot、其狀態與 contribution 形狀。
- [`guides/module-settings.md`](../guides/module-settings.md) — settingsSchema、`useModuleContext`、`settingsPanels` 與 `settingsTabs`。
- [`uikit/index.md`](../uikit/index.md) — 供 plugin 作者使用的 UIKit wrapper。
- [`uikit/primitives.md`](../uikit/primitives.md) — primitives、設計 token 與 escape-hatch 指引。
- [`guides/plugin-quickstart.md`](../guides/plugin-quickstart.md) — 從零開始到一個可執行的 plugin。
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — 貢獻至 OpenPen 核心。
- npm 上的 `@openpen/module-api` — TypeScript 型別與完整 API 介面。
