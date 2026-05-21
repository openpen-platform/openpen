---
title: 发布 Plugin
description: 构建、安装并分发 OpenPen plugin，从你的机器到终端用户。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 发布 Plugin

如何构建、安装并分发 OpenPen plugin。

---

## 构建

```bash
npm run build    # outputs dist/renderer.js via @openpen/build (Rollup)
```

`@openpen/build` 预配置了 Rollup，将 `vue` 和
`@openpen/module-api` 设为外部依赖——这些由宿主在运行时提供。不要将它们打包进去。

### 对等依赖规则

- **MUST** 将 `vue` 和 `@openpen/module-api` 保持为外部依赖。
  打包它们会创建第二个 Vue 实例，破坏响应式，并导致 `inject` 失效。
- **MUST NOT** 将 `vue` 或 `@openpen/module-api` 添加到 `dependencies` 或
  `bundledDependencies` 中。它们应放在 `devDependencies`（或对于可发布的 plugin 包放在 `peerDependencies`）中。
- 如果你使用 `@openpen/build`（默认），这一点会自动强制执行。
  只有在有特定原因时才覆盖 `rollupOptions.external`。

---

## 本地安装（用于测试）

```bash
mkdir -p ~/.openpen/plugins/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/my-plugin/
# Then restart OpenPen
```

Plugin 加载需要生产构建（importmap 仅在 `dist/index.html` 中）。
如果尚未构建宿主，请先构建：

```bash
npm run build                              # host + runtime shims
cd packages/my-plugin && npm run build    # plugin
```

---

## 使用 openpen-cli 管理 plugin

```bash
npx openpen-cli plugin list                  # List installed plugins
npx openpen-cli plugin add <source>          # Install from a local path or GitHub release
npx openpen-cli plugin remove <id>           # Remove by plugin id
```

`<source>` 接受以下格式：
- 本地目录路径：`./my-plugin` 或 `/abs/path/to/plugin`
- GitHub Release zip URL：`https://github.com/user/repo/releases/download/v1.0.0/plugin.zip`
- GitHub 仓库 URL：`https://github.com/user/repo` 或 `github:user/repo`（解析最新 Release）

OpenPen plugin **不通过** npm 注册表分发——请使用上述 GitHub 形式之一。完整命令参考见 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。

---

## 分发

1. 构建你的 plugin，并将打包好的 `dist/`、`plugin.json` 和 `locales/` 作为 zip 文件发布到 GitHub Release（`openpen pack` 命令会生成此 zip）。
2. 用户通过 `npx openpen-cli plugin add <github-url>` 直接安装，或在你的 plugin 列入目录后通过 `npx openpen-cli plugin install @scope/name` 安装。

目前没有中央 plugin 注册表。社区发现渠道是 GitHub 话题标签（`openpen-plugin`）和 OpenPen Discussions 讨论区。

---

## 信任模型与责任

你的 plugin 在 OpenPen 的主渲染进程中运行，拥有以下完整访问权限：

- 共享 Vue 实例（你可以修改任何响应式状态）
- `window.openPenApi`（应用暴露的所有宿主 IPC）
- DOM（应用中的任何 UI，不仅限于你自己的部分）
- localStorage / sessionStorage（无 per-plugin 隔离）

OpenPen 采用**用户安装信任模型**。没有权限沙箱、代码签名或应用市场审核。安装你 plugin 的用户是在将这份信任延伸到你的代码。

作为 plugin 作者，你 **SHOULD**：

- 在你 plugin 自己的 README 中说明它读取、写入和通过网络发送的内容。
- 避免触碰其他 plugin / 宿主 module 所有的状态，除非你的 plugin 明确需要这样做。
- 如果你发起出站网络请求，请加以说明——每个请求都会记录到用户的调试控制台以供审计。


---

## 另见

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — 先在本地开发
- [uikit/](../uikit/index.md) — UIKit 组件 API
- [slots/](../slots/index.md) — 所有 contribution slot
