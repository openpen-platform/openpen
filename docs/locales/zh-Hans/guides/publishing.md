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

在 plugin 目录中执行 `npm run build` 之后运行。它会将 `plugin.json`、`dist/` 和 `locales/`
复制到 `~/.openpen/plugins/@scope/name/`：

```bash
npx openpen-cli plugin add .
# Then restart OpenPen
```

`plugin add` 在安装前会要求你确认；在非交互式 shell 中请传入 `--yes`（或 `-y`）。

Plugin 加载需要打包后的（生产）OpenPen 构建。宿主的开发服务器不会加载 plugin，因此请重启打包版 OpenPen 来查看你的 plugin。

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

1. 构建你的 plugin，运行 `npx openpen-cli pack` 生成包含 `dist/`、`plugin.json` 和 `locales/` 的 zip，并将其附加到标记为 `v<version>` 的 GitHub Release。
2. 用户可以直接从该 Release 安装：`npx openpen-cli plugin add <github-url>`。

### Plugin 目录

OpenPen 维护一个中央目录，即 [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) 仓库。列入其中的 plugin 可以通过 `npx openpen-cli plugin install @scope/name` 按 id 安装，并会显示在应用的 Marketplace 标签页中。

要将你的 plugin 列入目录，请在把 zip 附加到 GitHub Release 之后运行 `npx openpen-cli publish`。它会检查该 Release，确认你的 GitHub 登录名与 plugin id 的 scope 一致，并向目录提交一个 pull request：首次提交为注册 PR（Registration PR），新版本为更新 PR（Update PR）。首次提交在合并前会由维护者审核。完整流程见[构建你的第一个 plugin](../tutorials/build-your-first-plugin.md) 的第 7 节，各步骤的具体作用见 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。

---

## 信任模型与责任

你的 plugin 在 OpenPen 的主渲染进程中运行，拥有以下完整访问权限：

- 共享 Vue 实例（你可以修改任何响应式状态）
- `window.openPenApi`（应用暴露的所有宿主 IPC）
- DOM（应用中的任何 UI，不仅限于你自己的部分）
- localStorage / sessionStorage（无 per-plugin 隔离）

OpenPen 采用**用户安装信任模型**。没有权限沙箱和代码签名，目录审核也不是对你代码的安全审计。安装你 plugin 的用户是在将这份信任延伸到你的代码。

作为 plugin 作者，你 **SHOULD**：

- 在你 plugin 自己的 README 中说明它读取、写入和通过网络发送的内容。
- 避免触碰其他 plugin / 宿主 module 所有的状态，除非你的 plugin 明确需要这样做。
- 如果你发起出站网络请求，请加以说明——每个请求都会记录到用户的调试控制台以供审计。


---

## 另见

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — 先在本地开发
- [uikit/](../uikit/index.md) — UIKit 组件 API
- [slots/](../slots/index.md) — 所有 contribution slot
