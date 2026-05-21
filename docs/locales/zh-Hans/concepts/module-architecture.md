---
title: OpenPen 模块架构
description: 宿主三层核心与 contribution-slot 系统如何让内置模块和第三方 plugin 共享同一扩展面。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# OpenPen 模块架构

## 简述

OpenPen 采用**宿主 + contribution-slot 架构**（详见下文）以及**共享渲染器信任模型**——plugin 与宿主并排运行，由用户自行决定是否安装（参见 [`guides/publishing.md`](../guides/publishing.md#trust-model--responsibility)）。这两层相互解耦：slot 系统与信任模型各自独立演进。

核心层仅包含框架基础设施，对工具、图形或设置面板一无所知。所有具体功能——无论是内置集合还是第三方 plugin——均实现同一 `OpenPenModule` 接口，并通过声明的 **slot** 向宿主贡献能力。添加新功能无需修改宿主；内置模块可被移除，plugin 作者与内置模块拥有完全相同的能力。

## 三层结构

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

**内置**模块与 **plugin** 模块在结构上唯一的区别是_位置_（仓库内 vs `~/.openpen/plugins/`）和_治理方式_（随宿主发布 vs 由用户安装）。它们的接口（`OpenPenModule`）、加载器、验证器和运行时完全相同。

## OpenPenModule 接口

每个模块导出一个满足 `OpenPenModule` 的单一对象：

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

在「设置 → 模块」中显示的名称和描述来自你语言字典中的两个**保留键**，通过 `contributes.locales` 注册：

```ts
contributes: {
  locales: {
    en: { name: 'My Plugin', description: 'What it does.' },
    'zh-Hant': { name: '我的插件', description: '功能說明。' },
  },
}
```

宿主在渲染「设置 → 模块」时，会从当前语言环境读取 `name` 和 `description`。其他键可在 `setup()` 中通过 `ctx.t()` 访问，在 Vue 组件中通过 `useModuleContext().t()` 访问。

> **`metadata` 作为回退**：顶层 `metadata` 字段（`metadata.name`、`metadata.description`）是一个独立于 i18n 的回退，当模块被禁用且其 `contributes.locales` 条目尚未接入宿主时使用。上方基于语言环境的方式是主要来源，应优先填写。

使用 `@openpen/module-api` 中的 `defineModule()` 来声明你的模块——它提供完整的类型推断，并在宿主看到 contribution 对象之前对其进行验证。

## Contribution slot

**slot** 是宿主上的一个带类型的扩展点。模块通过在 `contributes` 中添加字段来选择接入：

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

完整的 slot 目录见 [`slots/index.md`](../slots/index.md)。

### Slot 状态

- **`available`** — 已接通运行时适配器，可立即使用。
- **`reserved`** — 类型和注册均被接受，但尚无适配器。你现在可以发布对 reserved slot 的 contribution；待适配器落地后即可生效，无需在你这边做任何修改。

## `@openpen/module-api` 暴露的内容

`@openpen/module-api` 是模块和 plugin 被允许从宿主导入的唯一路径。它导出：

- `defineModule()` 辅助函数
- `useModuleContext(moduleId)` — `getSettings()`、`updateSettings()`、`onSettingsChange()`，用于读写已持久化的模块偏好设置（参见 [guides/module-settings.md](../guides/module-settings.md)）
- `MODULE_ID_RE` / `isValidModuleId()` — ID 格式验证
- `resolveLabel()` — 将 `LocaleMap` 转换为字符串，支持 BCP-47 回退
- 所有 slot 定义（`ALL_SLOTS`、`V1_ACTIVE_SLOTS`、`V1_RESERVED_SLOTS`、`getSlot()`、`isKnownSlot()`）
- 所有 TypeScript 类型（`OpenPenModule`、`ModuleContributions`、每个 `*Contribution` 形态）
- `z` — zod 的重新导出，用于 `settingsSchema`

Plugin 只能从 `@openpen/module-api` 导入；宿主会在模块边界验证这一点，并拒绝任何来自宿主内部路径的导入。

## 你的 plugin 加载时

1. **渲染器启动**：从 `src/core/modules/` 静态导入内置模块，并通过 IPC 从 `~/.openpen/plugins/` 获取第三方 plugin manifest。
2. **验证**：运行预检：ID 格式、内置模块与 plugin 模块之间的 ID 冲突、slot 键是否存在、设置 schema 解析，以及 `minAppVersion` 兼容性。所有错误会被统一收集并一并上报。
3. **Setup**：每个渲染器窗口（overlay、settings 和 main 各自运行独立的运行时）按注册顺序调用每个模块的 `setup(ctx)` 一次。
4. **Slot 接线**：将每个模块的 `contributes` 连接至相关适配器。贡献给 `controlBar`、`settingsTabs`、`htmlOverlays` 及其他 active slot 的 Vue 组件会被渲染到对应容器中。

## 另请参阅

- [`slots/index.md`](../slots/index.md) — 所有 slot、其状态及 contribution 形态。
- [`guides/module-settings.md`](../guides/module-settings.md) — `settingsSchema`、`useModuleContext`、`settingsPanels` 与 `settingsTabs`。
- [`uikit/index.md`](../uikit/index.md) — 面向 plugin 作者的 UIKit 封装。
- [`uikit/primitives.md`](../uikit/primitives.md) — 基础组件、设计令牌及逃生舱指南。
- [`guides/plugin-quickstart.md`](../guides/plugin-quickstart.md) — 从零到运行一个 plugin。
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — 向 OpenPen 核心贡献代码。
- npm 上的 `@openpen/module-api` — TypeScript 类型与完整 API 面。
