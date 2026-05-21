---
title: openpen CLI
description: 用于 plugin 脚手架、安装、打包和目录发布的 openpen-cli 命令行工具。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# openpen CLI

`openpen` CLI（`openpen-cli` 软件包）用于管理 OpenPen 的 plugin 安装、打包和发布。安装方式如下：

```bash
npm install -g openpen-cli
# or use npx without installing:
npx openpen-cli <command>
```

> **⚠️ 请始终使用 `openpen-cli` 调用，而非 `openpen`。** npm 上裸名的 `openpen` 软件包已被一个无关项目占用——`npx openpen-cli ...` 会拉取错误的工具。
> 本文档中所有命令均以 `npx openpen-cli <verb>` 的形式运行。

---

## 命令

### `openpen create @scope/name`

基于官方起始模板脚手架一个新 plugin。

**行为：**
1. 验证输入是否符合 `@scope/name` 格式。
2. 在当前文件夹下创建以 `name` 段命名的子文件夹（例如 `todo-app/`）。
3. 复制 plugin 起始模板，并将你的 `@scope/name` 填入 `plugin.json`。
4. 打印后续步骤：`npm install` → 开发 → `npm run build` → `openpen pack`。

**身份验证：** 检查（但不阻塞）所提供的 scope 是否与你已验证的 GitHub 登录名匹配。真正的 scope 检查在 `openpen publish` 阶段进行。

---

### `openpen pack`

将你的 plugin 打包为可分发的 zip 文件。在包含 `plugin.json` 的文件夹中运行此命令。

**前置条件：** `dist/renderer.js` 必须已存在——请先运行你的构建工具（例如 `npx @openpen/build` 或你自己的打包器）。

**行为：**
1. 读取 `plugin.json`，解析 `id`（`@scope/name`）和 `version`。
2. 验证 `id` 格式，并确认 `dist/renderer.js` 存在。
3. 收集 `plugin.json` + `dist/` + `locales/`（如存在）。
4. 输出 `<scope>-<name>-<version>.zip`——例如 `@alice/todo-app` 在 `1.2.0` 版本下生成 `alice-todo-app-1.2.0.zip`。
5. 打印输出路径和 SHA-256 哈希值。

`openpen pack` **不会为你执行构建**——请先调用你的构建工具。

---

### `openpen publish`

向中央 [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) 目录提交注册 PR 或版本更新推送。

**前置条件：** `plugin.json` 必须存在，来自 `openpen pack` 的 zip 文件必须存在，且 `v<version>` 对应的 GitHub Release 必须已发布并附有该 zip。

**行为：**
1. 验证 `plugin.json` 和 zip 文件。
2. 确认 GitHub Release 及附件资产存在。
3. 确认你已验证的 GitHub 登录名与 plugin `id` 中的 `scope` 匹配。
4. 计算 zip 的 SHA-256 值。
5. 检测本次是首次注册还是版本更新：
   - **新 plugin** → 开启注册 PR（`register/<scope>-<name>`）。合并前需维护者审核。
   - **版本更新** → 开启更新推送 PR（`update/<scope>-<name>-<version>`）。所有检查通过后，目录机器人自动合并。
6. 打印 PR URL。

**身份验证：** 使用 GitHub OAuth token 或 `GITHUB_TOKEN` 环境变量。

---

### `openpen plugin install @scope/name`

从中央目录下载并安装一个 plugin。

**行为：**
1. 从目录获取 `plugins.json`。
2. 查找 `@scope/name` 对应的条目；若该 plugin 已被撤回或标记为墓碑则报告错误。
3. 下载 release zip。
4. 根据目录记录验证 SHA-256 摘要。不匹配时中止并删除已下载的文件。
5. 解压到 `~/.openpen/plugins/@scope/name/`。
   若该文件夹已存在，则先备份；成功后删除备份，失败时恢复备份。
6. 验证解压后的 `plugin.json`。
7. 提示你重启 OpenPen。

---

### `openpen plugin add <source>`

从本地文件夹或远程 release 产物安装一个 plugin。

**支持的来源形式：**

| 形式 | 示例 | 行为 |
|------|---------|-----------|
| 本地路径 | `./my-plugin/` | 将 `<path>/dist/`、`<path>/plugin.json` 和 `<path>/locales/`（如存在）复制到 `~/.openpen/plugins/@<scope>/<name>/`。若 `dist/` 缺失则报告明确错误。 |
| GitHub release zip URL | `https://github.com/owner/repo/releases/download/v1.0.0/plugin.zip` | 下载并解压该 zip。 |
| GitHub 仓库 URL | `https://github.com/owner/repo` | 解析最新 release 并从其 zip 资产安装。 |
| GitHub 简写 | `github:owner/repo` | 与上方仓库 URL 方式相同。 |

**不支持：** npm 软件包名称。OpenPen plugin 通过 GitHub Releases 分发，而非 npm 注册表。目录安装请使用 `openpen plugin install @scope/name`，直接安装请使用上方的 GitHub 形式之一。

---

### `openpen plugin list`

列出当前安装在 `~/.openpen/plugins/` 中的所有 plugin。输出使用 `@scope/name` 格式。

---

### `openpen plugin remove @scope/name`

通过删除 `~/.openpen/plugins/@scope/name/` 目录来卸载一个 plugin。

---

## Plugin id 格式

每个 OpenPen plugin 的 id 格式为 `@scope/name`：

- `scope` 和 `name` 均为小写 ASCII 字母、数字和连字符。
- 每段的首字符必须是字母或数字（不能是连字符）。
- 每段最多 39 个字符。
- 正则表达式：`/^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/`

示例：`@alice/todo-plugin`、`@openpen/freehand`。

`@openpen/*` 和 `@core/*` scope 为官方保留，不能由第三方注册。

---

## 另请参阅

- [构建你的第一个 plugin](../tutorials/build-your-first-plugin.md)
- [Plugin 发布指南](../guides/publishing.md)
- [Contribution Slot 目录](../slots/)
