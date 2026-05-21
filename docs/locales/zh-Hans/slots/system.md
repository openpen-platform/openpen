---
title: 系统插槽
description: 8 个用于键盘快捷键、窗口行为、i18n、IPC 处理程序、事件、生命周期钩子、存储和文件拖放的 contribution slot。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-21T17:37:32Z
language: zh-Hans
---

# 系统插槽

系统插槽涵盖横切基础设施：键盘快捷键、窗口行为修饰符、i18n 字典、主进程 IPC 处理程序、领域事件订阅、应用 lifecycle 钩子、独立存储以及文件拖放处理程序。

## `system.shortcuts` — ✅ 可用 {#system-shortcuts}

- **Contribution key**：`shortcuts`
- **类型**：`ShortcutContribution[]`
- **用途**：全局（`scope: 'global'`）与绘图模式（`scope: 'drawing'`）键盘快捷键。对 `'global'` 封装 Electron `globalShortcut`，对 `'drawing'` 封装渲染进程按键处理程序。

### `ShortcutContribution` 类型

```ts
interface ShortcutContribution {
  id: string                       // unique within this module
  keys: string                     // Electron accelerator string, e.g. 'CommandOrControl+Shift+D'
  scope: 'global' | 'drawing'
  handler(): void
  label?: string | LocaleMap       // human-readable name shown in Settings → Shortcuts
  userCustomizable?: boolean       // default false; set true to let users rebind the key
}
```

- `userCustomizable: true` 且带有 `label` 的 shortcut 会显示在**设置 → 快捷键**中该 module 的分组下，用户可在此重新绑定按键。用户自定义的按键存储在 `config.json → customShortcuts[moduleId/shortcutId]` 中。
- 无论 `userCustomizable` 取何值，`label` 均会显示；省略则该 shortcut 完全不在快捷键标签页中出现。

## `system.window.behaviors` — ⏳ 预留 {#system-window-behaviors}

- **Contribution key**：`windowBehaviors`
- **类型**：`WindowBehaviorContribution[]`
- **用途**：主窗口行为修饰符（固定、自动折叠、唤出到光标位置传送）。
- **预留原因**：渲染进程和主进程均未实现运行时适配器。

## `system.locales` — ✅ 可用 {#system-locales}

- **Contribution key**：`locales`
- **类型**：`LocaleContribution`
- **用途**：按 BCP-47 标签贡献 i18n 字典。解析层级依次为：默认 → 精确匹配 → 语言前缀 → en → 首个声明。

## `system.main.handlers` — ✅ 可用 {#system-main-handlers}

- **Contribution key**：`mainHandlers`
- **类型**：`MainHandlerContribution`
- **用途**：主进程能力（文件 IO、原生 API）的 Node 端 IPC 处理程序。通过 ctx.callMain(action, payload)（内部调用 window.openPenApi.moduleCall(moduleId, action, payload)）从渲染进程路由。主进程处理程序来自 plugin.json 的 main 字段所引用的文件。

## `system.events` — ✅ 可用 {#system-events}

- **Contribution key**：`events`
- **类型**：`EventSubscriptionContribution[]`
- **用途**：订阅领域事件（`stroke-added`、`tool-changed`、`theme-changed` 等）。与响应式笔触样式 store 配合使用：store 用于状态快照，事件用于操作。

## `system.lifecycle` — ✅ 可用 {#system-lifecycle}

- **Contribution key**：`lifecycle`
- **类型**：`LifecycleContribution`
- **用途**：应用 lifecycle 钩子（`onReady`、`onSuspend`、`onQuit`）。自动保存 / 云同步类 plugin 需要此项。

## `system.storage` — ⏳ 预留 {#system-storage}

- **Contribution key**：`storage`
- **类型**：`StorageContribution`
- **用途**：标记该 module 需要在 `~/.openpen/plugins/<id>/data/` 下建立独立数据文件夹。容量 / 配额策略由宿主运行时定义。
- **预留原因**：适配器尚未激活；第一个实际使用者将驱动存储后端设计（延迟至某个内置或 plugin module 需要 blob 存储时再实现）。

## `system.file.drop` — ⏳ 预留 {#system-file-drop}

- **Contribution key**：`fileDrop`
- **类型**：`FileDropContribution[]`
- **用途**：处理拖放到画布上的文件（图片印章、SVG 导入）。
- **预留原因**：第一个实际使用者是图片印章 plugin；延迟至届时再实现。
