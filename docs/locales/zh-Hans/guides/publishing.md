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
npm run build    # outputs dist/renderer.js via @openpen/build (Vite)
```

`@openpen/build` 预配置了 Vite，将 `vue` 和
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

1. 构建你的 plugin，运行 `npx openpen-cli pack` 生成包含 `dist/`、`plugin.json`（以及存在时的 `locales/`）的 zip，并将其附加到标记为 `v<version>` 的 GitHub Release。
2. 用户可以直接从该 Release 安装：`npx openpen-cli plugin add <github-url>`。

### 两种上架方式

OpenPen 有两份独立的清单，按需求择一，两者不是同一流程的前后步骤。

| | 社区清单 | 官方目录 |
| --- | --- | --- |
| 如何进入 | 发布 release，并给仓库加上 `openpen-plugin` topic | 运行 `npx openpen-cli publish`，提交 pull request |
| 审核 | 无人工审核，由扫描器自动检查包 | 首次提交由维护者审核；更新由目录机器人检查 |
| 出现时间 | 下一次扫描（每 30 分钟） | pull request 合并后 |
| 记录位置 | 目录仓库的 `community/plugins.json` | 目录仓库的 `plugins.json` |

两份清单都在 [OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) 仓库。社区条目不会并入官方 `plugins.json`，列入任何一份清单都不代表对你的代码做过安全审计。

### 社区清单

扫描器会读取带有 `openpen-plugin` topic 的公开 GitHub 仓库。要被列入：

1. 创建 plugin。运行 `npx openpen-cli create @scope/name` 生成项目，再运行 `npm install` 和 `npm run build` 生成 `dist/renderer.js`。项目内附示例翻译（`src/locales/`：`en`、`ja`、`zh-Hans`、`zh-Hant`），它们会被打包进 `renderer.js`，可以保留、修改或删除。开发流程见[快速入门](./plugin-quickstart.md)。
2. 确认 `plugin.json` 有 `id`、`name`、`version`、`description`、`minAppVersion`。请把项目模板默认的 `description`（“A short description of what your plugin does.”）改成真实的描述，它就是清单中显示在你 plugin 上的文字。`version` 须为 semver，`id` 的 scope 须等于拥有该仓库的 GitHub 账号或组织名（小写），例如 `github.com/alice/todo-app` 对应 `@alice/todo-app`。扫描器只比对 scope 与仓库所有者，不会检查你当前登录的是哪个账号；组织只要仓库在该组织名下即可。`create` 会拿 scope 与你个人的登录名比对，组织 scope 可能出现警告，这不会影响社区清单。`@openpen` scope 和官方目录已有的 id 会被拒绝。
3. 把项目放进公开的 GitHub 仓库。运行 `git init`，然后在 plugin id 的 scope 所指的账号或组织名下创建仓库（`@alice/todo-app` 就建在 `alice` 名下）并 push，例如 `gh repo create alice/todo-app --public --source . --push`。仓库名不必与 plugin 名相同，只有所有者会拿来与 scope 比对。私有、fork 和已归档的仓库会被跳过。第一次 commit 之前，确认项目有 `.gitignore`，并列出 `node_modules/`、`dist/` 和 `*.zip`，让构建产物和打包的 zip 不进入仓库。旧版 CLI 生成的项目不带这个文件；如果没有，请自行创建并写入这三行。如果生成的 README 含有以 `../../docs` 开头的链接，请改成文档站的完整网址 `https://openpen.pages.dev/docs/`（例如 `https://openpen.pages.dev/docs/guides/publishing`），因为相对链接只在 OpenPen 仓库内有效。项目 `package.json` 中的 `"private": true` 只会阻止 `npm publish`，不影响 release 和扫描。
4. 在由 `create` 生成的项目中运行 `npm run pack`（它会运行 `npx openpen-cli pack`），再创建 `v<version>` 的 GitHub Release 并附上 zip，例如 `gh release create v<version> ./<scope>-<name>-<version>.zip`。zip 内有 `plugin.json`、`dist/`，以及（若文件夹存在）`locales/`。`pack` 结尾会打印让你运行 `publish` 的提示，那一步属于官方目录，走社区清单可以跳过。部分旧版 CLI 打印的提示用了缩短的命令名：命令名一律是 `npx openpen-cli`，因为 npm 上裸名的 `openpen` 包是无关的工具。release 必须已发布，不能是草稿或预发布。扫描器取最新 release 的第一个 `.zip` 附件，zip 根目录须有 `plugin.json`。
5. 给仓库加上 `openpen-plugin` topic：仓库页面 About 旁的齿轮，Topics；或使用 GitHub CLI：`gh repo edit --add-topic openpen-plugin`。
6. 等待下一次扫描。扫描器自行下载 zip、读取 `plugin.json` 并计算 sha256，你不需要提交哈希或 pull request。扫描每 30 分钟一次，你无法自行触发，请预留最多约 30 分钟。要确认是否已列入，请打开目录仓库的 [`community/plugins.json`](https://raw.githubusercontent.com/openpen-platform/OpenPen-plugins/main/community/plugins.json)，找你的 plugin id；`latestVersion` 字段显示已收录的版本。

发布更新时，提高 `version` 后重复步骤 4。`plugin.json` 版本不高于已列出版本的 release 会被忽略。移除 topic、把仓库设为私有或归档，之后的扫描会把该 plugin 移出清单。

plugin 没有出现时，扫描器会在目录仓库的 `Update community index` workflow 中记录每个仓库被跳过的原因（例如缺少 `.zip` 附件、scope 与所有者不符、草稿 release）。维护者可通过 `community/blocklist.json` 排除特定 plugin、仓库或所有者。

### 官方目录

官方目录中的 plugin 可以通过 `npx openpen-cli plugin install @scope/name` 按 id 安装，并会显示在应用的 Marketplace 标签页中。

要列入官方目录，请在把 zip 附加到 GitHub Release 之后运行 `npx openpen-cli publish`。它会检查该 Release，确认你的 GitHub 登录名与 plugin id 的 scope 一致，并向目录提交一个 pull request：首次提交为注册 PR（Registration PR），新版本为更新 PR（Update PR）。 组织 scope 不支持通过 `publish` 提交；官方 `@openpen` scope 由组织成员直接提交到目录仓库。首次提交在合并前会由维护者审核。完整流程见[构建你的第一个 plugin](../tutorials/build-your-first-plugin.md) 的第 7 节，各步骤的具体作用见 [`reference/openpen-cli.md`](../reference/openpen-cli.md)。 plugin 的仓库也必须位于你的个人账号下，并以 plugin 名称命名（`publish` 会记录为 `https://github.com/<your-login>/<plugin-name>`）；目录机器人会将仓库所有者与注册账号比对，位于组织或其他账号下的仓库会被拒绝。

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
