---
title: 插槽目录
description: OpenPen 开放的全部 25 个 contribution slot——17 个当前稳定，8 个保留至 v1.1+。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 插槽目录

OpenPen 按领域组织开放了 25 个 contribution slot。稳定插槽在运行时立即生效；保留插槽通过校验但尚无活跃适配器（向前兼容——module 现在即可针对它们发布）。

## 状态

- ✅ **available** — 已连接至运行时适配器
- ⏳ **reserved** — 暂无适配器，将在 v1.1+ 中发布

## contribution key 与 slot id

module 在 `contributes` 上使用便于阅读的驼峰命名键（`historyCommands`、`themeTokens`）；校验器将其映射为点分 slot id（`canvas.history.commands`、`ui.theme.tokens`）。映射关系存储在 `CONTRIBUTION_KEY_TO_SLOT_ID` 中。

## 全部插槽

| Slot id | 领域 | 状态 | 简介 |
|---|---|---|---|
| [`canvas.tools`](./canvas#canvas-tools) | Canvas | ✅ | 由指针事件驱动的绘图工具 |
| [`canvas.shapes`](./canvas#canvas-shapes) | Canvas | ✅ | 形状基元（圆形、矩形、多边形、自定义） |
| [`canvas.stroke.style`](./canvas#canvas-stroke-style) | Canvas | ✅ | 声明笔触样式键的所有权，用于冲突检测 |
| [`canvas.history.commands`](./canvas#canvas-history-commands) | Canvas | ⏳ | 超出内置类型的自定义撤销/重做命令类型 |
| [`canvas.layers.background`](./canvas#canvas-layers-background) | Canvas | ✅ | 渲染于笔触下方（网格、水印、背景图片） |
| [`canvas.layers.overlay`](./canvas#canvas-layers-overlay) | Canvas | ✅ | 渲染于笔触上方（标尺、吸附参考线、选择框） |
| [`canvas.html.overlay`](./canvas#canvas-html-overlay) | Canvas | ✅ | 在画布上方挂载 HTML / Vue 组件 |
| [`canvas.stroke.transformers`](./canvas#canvas-stroke-transformers) | Canvas | ⏳ | 笔触创建后进行后处理（平滑、发光效果） |
| [`ui.control-bar`](./ui#ui-control-bar) | UI | ✅ | 控制栏中的按钮、滑块、弹窗触发器 |
| [`ui.settings.panels`](./ui#ui-settings-panels) | UI | ✅ | 设置窗口「功能」标签页中的各个区块 |
| [`ui.settings.tabs`](./ui#ui-settings-tabs) | UI | ✅ | 设置窗口中的独立顶级标签页 |
| [`ui.cursors`](./ui#ui-cursors) | UI | ✅ | 绘图模式激活时按工具渲染的 DOM 光标 |
| [`ui.status`](./ui#ui-status) | UI | ✅ | 控制栏上的临时状态徽章 |
| [`ui.modals`](./ui#ui-modals) | UI | ✅ | 由全局弹窗栈管理的已注册弹窗 |
| [`ui.tray.menu`](./ui#ui-tray-menu) | UI | ⏳ | 系统托盘菜单项，与内置的显示/隐藏/退出并列 |
| [`ui.context.menu`](./ui#ui-context-menu) | UI | ⏳ | 画布、工具栏或托盘上的右键上下文菜单项 |
| [`ui.theme.tokens`](./ui#ui-theme-tokens) | UI | ⏳ | module 提供的 CSS 自定义属性（颜色色板、token） |
| [`system.shortcuts`](./system#system-shortcuts) | System | ✅ | 全局及绘图模式下的键盘快捷键 |
| [`system.window.behaviors`](./system#system-window-behaviors) | System | ⏳ | 主窗口行为修改器（固定、自动折叠） |
| [`system.locales`](./system#system-locales) | System | ✅ | 按 BCP-47 标签贡献的 i18n 词典 |
| [`system.main.handlers`](./system#system-main-handlers) | System | ✅ | 主进程能力的 Node 端 IPC 处理器 |
| [`system.events`](./system#system-events) | System | ✅ | 订阅领域事件（stroke-added、tool-changed……） |
| [`system.lifecycle`](./system#system-lifecycle) | System | ✅ | 应用 lifecycle 钩子（onReady、onSuspend、onQuit） |
| [`system.storage`](./system#system-storage) | System | ⏳ | 位于 `~/.openpen/plugins/<id>/data/` 的隔离数据文件夹 |
| [`system.file.drop`](./system#system-file-drop) | System | ⏳ | 拖放至画布的文件处理器 |

**合计**：17 个 available · 8 个 reserved · 共 25 个
（Canvas：6 个 available / 2 个 reserved · UI：6 个 available / 3 个 reserved · System：5 个 available / 3 个 reserved）
