---
title: Plugin 兼容性
description: Plugin 如何声明其支持的 OpenPen 版本、宿主如何决定是否加载它们，以及如何处理破坏性变更。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# Plugin 兼容性

Plugin 如何声明其支持的 OpenPen 版本、OpenPen 如何决定是否加载它们，
以及如何跨宿主和 SDK 版本处理破坏性变更。

---

## TL;DR

- Plugin 通过两个字段声明兼容性：`minAppVersion`（在 module 定义中）以及
  plugin 的 `package.json` 中导入的 `@openpen/module-api` 版本范围。
- OpenPen 会拒绝 `minAppVersion` 比当前运行宿主版本更新的 plugin。
- SDK（`@openpen/module-api`）遵循语义化版本控制。导入
  `@openpen/module-api@^1.0.0` 的 plugin 可在所有搭载
  module-api `1.x`（相同次版本或更高）的宿主上运行。
- SDK 的破坏性变更在移除前会有一个次版本的弃用过渡期。

---

## 两个兼容性字段

### `minAppVersion` — 宿主版本门控

在 `defineModule()` 中声明你的 plugin 所需的最低 OpenPen 宿主版本：

```ts
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  version: '1.2.0',
  minAppVersion: '1.0.0',   // requires OpenPen 1.0.0 or newer
  contributes: {
    // ...
  },
})
```

此字段对应 `OpenPenModule` 接口上的 `minAppVersion?: string` 属性。
加载时，OpenPen 会对每个 module 执行预检验证：

- 若当前运行的宿主版本**早于** `minAppVersion` →
  plugin 将被拒绝，并在 Modules 面板中记录明确的错误信息。
- 若当前运行的宿主版本**等于或晚于** `minAppVersion` → 验证
  继续进行下一项检查（id 格式、slot 是否存在、settings schema 等）。

该字段为可选项。若省略，则不应用宿主版本门控。

**将 `minAppVersion` 设为 plugin 实际所需的最低版本。**
设置得比实际需求更高会静默地导致 plugin 在旧版 OpenPen 用户处无法运行。

### `@openpen/module-api` 语义化版本范围

在 plugin 的 `package.json` 中，将 SDK 声明为开发依赖
（或可发布软件包的对等依赖）：

```json
{
  "devDependencies": {
    "@openpen/module-api": "^1.0.0"
  }
}
```

宿主自带一份 `@openpen/module-api`，并在运行时通过 importmap
（`dist/openpen-runtime/module-api.js`）将其暴露给 plugin。
Plugin **不得**打包 `@openpen/module-api` — `@openpen/build` 会自动将该软件包外部化来强制执行此规则。
你的 plugin 构建时所依赖的版本决定了你使用的 API 接口；
宿主实际运行的是其自带的版本。

构建配置详情请参阅 [发布](../guides/publishing.md)。

---

## 兼容性矩阵

OpenPen 的 monorepo 以**同步锁步**方式发布所有软件包——宿主应用、
SDK、构建 CLI 和安装 CLI 在每次稳定版本发布时共享同一版本号。
Plugin 作者只需跟踪**一个**版本号。

| OpenPen 宿主 | `@openpen/module-api` | `@openpen/build` | `openpen-cli` |
|---|---|---|---|
| 1.x（当前） | 1.x | 1.x | 1.x |
| 1.0 以前（内部） | （无稳定契约） | — | — |

无论在何处看到"OpenPen 1.4.2"——发布说明、GitHub 标签、
`package.json`——monorepo 中的每个软件包在同一天都处于完全相同的版本。

---

## 破坏性变更策略

OpenPen 对 SDK 和 contribution slot API 的兼容性承诺：

- **补丁版本（x.x.N）** — 仅修复 bug。不更改
  `OpenPenModule` 接口、`ModuleSetupContext`、slot 结构，
  或 UIKit 组件的属性/事件/插槽。
- **次版本（x.N.0）** — 仅追加新内容。新增字段、
  新增 slot、新增 UIKit 组件。现有 plugin 无需修改即可继续运行。
- **主版本（N.0.0）** — 可能包含破坏性变更。Plugin
  可能需要更新；迁移路径将有文档说明。

### 弃用流程

当 API 接口形状发生变更（slot 字段被重命名、
`ModuleSetupContext` 方法被替换、UIKit 组件属性被移除）时：

1. 弃用内容以**次版本**落地，旧 API 上添加 `@deprecated`
   JSDoc 标签，并对每个使用该 API 的 module 打印一次运行时 `console.warn`。
2. 已弃用的 API 至少在**一个完整的次版本发布周期**内保持可用。
3. 移除将在下一个**主版本**进行，并在 `CHANGELOG.md` 的
   "Breaking" 章节中列出，同时附带迁移指南。

---

## Plugin 许可证自由

OpenPen 采用分层许可证模型：宿主采用 GPL-3.0-or-later 并附带 Plugin
Linking Exception，SDK 软件包（`@openpen/module-api`、
`@openpen/build`、`openpen-cli`）则采用 MIT 许可证。

这意味着：

- 你的 plugin 可使用**任何许可证**，包括专有和
  闭源商业许可证。
- 你可以按自己选择的条款出售 plugin。
- 只有在你修改 OpenPen 宿主本身时才需要遵守 GPL，
  编写 plugin 时无需遵守。

Plugin Linking Exception 的确切措辞请参阅根目录 [`LICENSE`](../../LICENSE) 文件，
分层许可证概述请参阅 [`README.md`](../../README.md#license)。

---

## Plugin 运行时限制

OpenPen 在发布时启用了 macOS `hardenedRuntime`（Apple 公证在
Gatekeeper 保护系统上所必需）。这影响 plugin 在运行时可以携带的内容：

- **Plugin 必须是纯 JavaScript / TypeScript。** 原生 Node.js
  插件（`.node` 文件）、共享库或任何在运行时加载的未签名二进制代码
  都将被 macOS Gatekeeper 拦截。`@openpen/build` 工具链（Vite + Vue）
  支持 `.ts`、`.vue` 和 `.css` — 它们会编译为纯 JS，可以正常发布。
- **允许外部 `fetch` / `XMLHttpRequest`**，但会记录在
  OpenPen 的审计日志中；请参阅 [信任模型](./trust-model.md)。
- **Plugin 代码不能派生子进程。** Plugin 无法通过 `child_process`
  启动独立的二进制文件（渲染进程未暴露此功能，preload 桥接也不代理它）。

如果你需要发布一个依赖原生代码的 plugin，请提交 issue——
这需要宿主层面的变更（例如单独的已签名辅助进程），
超出当前发布线的范围。

---

## Plugin 作者最佳实践

- **将 `minAppVersion` 设为实际最低值，而非最新版本。** 如果你的
  plugin 仅使用自 `1.0.0` 起就存在的 API，请填写 `minAppVersion: '1.0.0'`。
  设置为当前版本会无端地阻止旧版本用户使用。

- **对 `@openpen/module-api` 使用插入符范围**（`^1.0.0`）。插入符允许
  兼容的补丁和次版本更新，同时防止主版本的破坏性变更。
  精确固定版本（`1.0.0`）会阻止你自动获取 bug 修复。

- **永远不要打包 `@openpen/module-api` 或 `vue`。** 宿主通过 importmap
  提供两者。打包它们会产生第二个 Vue 实例，破坏响应式和 `inject()`。
  如果你使用 `@openpen/build`，此规则会自动执行。

- **针对你声明的最低 `minAppVersion` 进行测试。** 不要调用只在更新次版本中
  才存在的 API，然后声称与更旧的宿主兼容。

- **在 GitHub 上订阅 OpenPen 发布通知**，以便在弃用警告变为移除前及时获悉。

### Plugin id 命名

Plugin id 必须遵循 npm 域范围格式 `@scope/name`（例如 `@acme/sticky-notes`），
与磁盘上的布局 `~/.openpen/plugins/@scope/name/plugin.json` 一一对应。

当两个已安装的 plugin 声明了相同的 id 时，OpenPen 应用**先到先得**
规则：最先发现的 plugin（按字母顺序扫描）被加载，其余的
被跳过并显示警告 toast 和控制台日志。内置 module 的 id 为保留 id——
声明内置 id 的 plugin 始终是被跳过的那个，而不是内置 module。

为避免与他人的 plugin 发生静默冲突：

- **使用你控制的唯一域范围** — 你的 GitHub 组织、你的 npm 组织，
  或基于域名的前缀。通用域范围（`@plugins`、`@openpen`、`@util`）会与
  其他所有使用相同快捷名称的人冲突。
- **避免暗示官方身份的域范围名称**（`@openpen-official`、
  `@openpen-team` 等），除非你实际维护 OpenPen。
- **将 plugin id 视为永久性的。** 重命名 id 会破坏用户安装并
  丢失 `installedAt` 历史记录；请选择一个你能长期使用的名称。

---

## 当 OpenPen 意外破坏某些功能时

非预期的宿主端破坏属于 bug。请在
`https://github.com/openpen-platform/openpen/issues` 提交 issue，并附上：

- 你的 plugin 的 `id`、`version` 和 `minAppVersion`
- OpenPen 宿主版本（`设置 → 关于` 或 `openpen --version`）
- 最小复现步骤（plugin id + 复现步骤）

非预期的破坏将被视为发布阻断补丁处理。

---

## 另请参阅

- [Module 架构](./module-architecture.md) — 宿主 / module / plugin
  分层、加载 lifecycle 以及完整的 `OpenPenModule` 接口
- [信任模型](./trust-model.md) — plugin 可以访问的内容以及如何安全安装
- [发布](../guides/publishing.md) — 构建和分发你的 plugin
- [Plugin 快速入门](../guides/plugin-quickstart.md) — 从零开始运行 plugin
