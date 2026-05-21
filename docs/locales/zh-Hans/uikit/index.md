---
title: UIKit
description: 面向 OpenPen plugin 作者的组件库——从高层封装到逃生舱口，共三个层级。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# OpenPen UIKit

OpenPen UIKit 封装层自动处理 inject key、互斥逻辑、动画守卫以及鼠标穿透。Plugin 作者 MUST 从此处入手；无需了解底层 headless 库的任何细节。

导入路径：

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

> 如需使用下列未列出的组件（标签输入、数字微调框、combobox），请参阅
> [custom-components.md](./custom-components.md)。

---

## 三个层级——选择最合适的那一级

UIKit 提供三个逐级递进的 API 访问层级。提前选对层级可以避免后期重写。

| 层级 | 导入路径 | 开发成本 | 视觉一致性 | 包体积影响 | 自由度 |
|---|---|---|---|---|---|
| **封装层** | `@openpen/module-api/uikit` | 低 | 自动——token 已为你应用 | 最小 | 低 |
| **原语重导出层** | `@openpen/module-api/uikit`（具名导出） | 中 | 由 token 驱动——你自己写 CSS | 中 | 高 |
| **逃生舱口层** | 你自己安装的 `reka-ui`（或任意库） | 自行管理 | 自行管理 | 最大 | 无限制 |

### 选择规则

**封装层** ——绝大多数组件都应使用此层级。你可以零样板代码地获得 popover、dialog、slider、toggle 等组件：inject key、互斥逻辑、ControlBar 动画守卫以及鼠标穿透均在内部处理。

**原语重导出层** ——当你需要完全掌控标记结构和样式，同时又希望保留 headless 原语所带来的无障碍访问与键盘导航行为时（焦点捕获、ARIA 属性、键盘关闭等），使用此层级。你自己编写 CSS，并自行管理互斥逻辑和穿透（参见 `docs/uikit/primitives.md`）。

**逃生舱口层** ——当你需要实现封装层或原语层均无对应实现的全新 UI 模式时使用（例如图形编辑器或 3D 视口）。你可以自由地在 plugin 自己的 `package.json` 中安装任意库。代价是：视觉一致性、无障碍访问以及该界面的长期维护工作均由你承担。尤其需要注意的是，若宿主替换了底层 headless 库（参见下文"若底层 headless 库被替换"），你所引入的任何直接导入都需要由你手动迁移——宿主的封装层 API 将保持稳定，但你自行打包的第三方导入则不然。

> 如果你不确定该选哪个层级，从封装层开始。你随时可以降到更低层级；反过来则更难。

---

## 组件

| 组件 | 层级 | 使用场景 |
|---|---|---|
| [`AppPopover`](./app-popover) | 封装层 | 锚定到触发元素的浮动面板 |
| [`AppDialog`](./app-dialog) | 封装层 | 带遮罩和焦点捕获的模态 dialog |
| [`useDialog`](./use-dialog) | 封装层 | 基于 Promise 的命令式 dialog API |
| [`AppSlider`](./app-slider) | 封装层 | 数值范围输入 |
| [`AppToggle`](./app-toggle) | 封装层 | 布尔开关 |
| [`AppSegmented`](./app-segmented) | 封装层 | 互斥分段控件 |
| [`AppSelect`](./app-select) | 封装层 | 单选下拉选择器 |
| [`AppTooltip`](./app-tooltip) | 封装层 | 悬停提示标签 |
| [`AppTabs`](./app-tabs) | 封装层 | 受控标签页内容容器 |
| [`AppBanner`](./app-banner) | 封装层 | 内联状态与反馈消息 |
| [`AppButton`](./app-button) | 封装层 | 标准控制栏操作按钮 |
| [`AppButtonDropdown`](./app-button-dropdown) | 封装层 | 分体按钮：主操作 + 箭头触发的 popover |
| [`primitives`](./primitives) | 原语重导出层 | 用于自定义标记的原始 Reka UI 重导出 |

逃生舱口层（从零编写自定义组件）参见 [`custom-components`](./custom-components)。

---

## 若底层 headless 库被替换

OpenPen UIKit 目前将 **Reka UI** 作为其 headless 行为层。这是内部实现细节。仅从 `@openpen/module-api/uikit` 导入的 plugin 作者不应感知到它的存在。

若 Reka UI 被弃用、废弃或与项目需求产生重大偏差，宿主有一套有据可查的备选顺序：

1. **Headless UI Vue**（Tailwind Labs 官方 Vue 移植版）——成熟、广泛使用，组件集较小。
2. **Ark UI**（基于 Zag.js 构建，跨框架并支持 Vue）——组件覆盖更广，由状态机驱动。
3. **自研 headless 原语**——若上述两个选项均不可行时的最后手段。

### 各层级的影响

| 层级 | 库替换的影响 |
|---|---|
| **封装层**（`@openpen/module-api/uikit`） | 你的代码无需改动。封装层 API——属性、事件、插槽——是由宿主维护的稳定契约。 |
| **原语重导出层**（`@openpen/module-api/uikit` 具名原语） | 将发布一个主版本升级。你需要进行小规模、有针对性的迁移，以更新变更了的原语组件名称或属性。 |
| **逃生舱口层**（直接导入第三方库） | 你需要自行负责迁移该界面的全部内容。宿主无法在此提供帮助，因为你已选择退出封装层契约。 |

本文档提前说明这些内容，是为了让你在选择层级时能做出充分知情的决定。封装层是宿主团队承诺在库替换过程中持续维护的长期契约。如果长期稳定性比最大 UI 自由度更重要，封装层是正确的选择。
