---
title: 控制栏布局
description: OpenPen 设置文件中用于控制控制栏项目顺序、分组和分隔符的 JSON 布局模式。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 控制栏布局

控制栏布局以 JSON 结构存储在你的 OpenPen 设置文件中。
编辑该文件可让你重新排列项目顺序、进行视觉分组并控制
分隔符——无需修改任何 plugin 代码。

---

## 设置文件位置

OpenPen 从 Electron userData 目录下的 `config.json` 读写布局状态：

| OS | 路径 |
|---|---|
| macOS | `~/Library/Application Support/OpenPen/config.json` |
| Windows | `%APPDATA%\OpenPen\config.json` |
| Linux | `~/.config/OpenPen/config.json` |

布局存储在 `controlBarLayout` 键下，与其他用户设置并列。

> **编辑前请注意**：请先退出 OpenPen。应用程序会将文件保存在内存中，并在退出时写回磁盘，因此在应用程序运行时所做的更改将会丢失。

---

## 模式

```json
{
  "controlBarLayout": {
    "version": 1,
    "groups": [
      {
        "id": "tools",
        "items": ["freehand", "line", "shape"],
        "separator": "always",
        "inset": { "enabled": true }
      },
      {
        "id": "default",
        "items": ["color-picker", "stroke-width"],
        "separator": "auto"
      }
    ]
  }
}
```

### `version`

始终为 `1`，保留供将来迁移使用。

### `groups`

由 `LayoutGroup` 对象组成的有序数组。控制栏按此处的顺序从左到右渲染各分组。

**约束条件**（任何违反都将在下次启动时把布局重置为内置默认值）：
- 必须恰好包含一个 `id: "default"` 的分组。
- 分组 `id` 值必须唯一。
- 一个项目 id 不能出现在多个分组中。

---

## `LayoutGroup` 字段

| 字段 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `id` | `string`（kebab-case） | **是** | 唯一分组标识符。`"default"` 保留用于未分组项目。 |
| `items` | `string[]` | **是** | 该分组中各项目的 contribution id 有序列表。 |
| `separator` | `'auto' \| 'always' \| 'never'` | 否 | 此分组前的视觉分隔符（默认：`'auto'`）。 |
| `inset` | `GroupInset` | 否 | 当存在且 `enabled: true` 时，以可见背景 + 边框容器渲染该分组。 |

### `separator` 值

| 值 | 行为 |
|---|---|
| `'auto'` | 在此分组前渲染分隔符（默认）。未来版本将在相邻分组来自同一 module 时省略分隔符。 |
| `'always'` | 始终在此分组前绘制分隔符。 |
| `'never'` | 此分组前不显示分隔符。 |

### `GroupInset` 字段

| 字段 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `enabled` | `boolean` | **是** | 设为 `true` 以启用视觉容器。 |
| `color` | `string` | 否 | CSS 颜色覆盖值，用于内嵌背景。默认为 `--openpen-color-control-group`。 |

当 `inset.enabled` 为 `true` 时，分组将以圆角容器渲染，将其中的项目视觉上绑定在一起（即"分组工具"外观）。容器高度与未折叠的 36 px 按钮一致——启用 inset 不会改变控制栏高度。

---

## 项目如何获得其 id

每个项目的 id 来自 module 的 `ControlBarContribution` 中的 `id` 字段：

```ts
// packages/module-api/src/types/control-bar-layout.ts
interface ControlBarContribution {
  id: string       // globally unique across all modules — use "pluginId-itemName"
  component: Component
  defaultGroup?: string
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    label?: string | LocaleMap
  }
}
```

Plugin 作者通过声明 `defaultGroup` 和 `groupHint` 作为首次安装时的提示。
**一旦用户的布局已保存，其始终优先**——提示仅在项目尚无已保存位置时生效。

---

## 协调机制（安装新 plugin 时会发生什么）

当 OpenPen 加载时发现某个 plugin 项目不在任何已保存的布局分组中：

1. 该项目被分配到其 `defaultGroup`（来自 `ControlBarContribution.defaultGroup`）。
2. 如果该分组在已保存的布局中尚不存在，宿主会自动创建它——使用该项目的 `groupHint` 设置其分隔符和标签。
3. 如果未声明 `defaultGroup`，该项目将追加到 `"default"` 分组。

已存在于已保存布局中的项目不会被移动。这意味着安装新 plugin 永远不会打乱现有项目的排列。

---

## 验证与损坏恢复

OpenPen 在启动时应用三层验证：

| 层级 | 检查内容 | 失败时的处理 |
|---|---|---|
| **L1** — JSON 解析 | 文件是否为有效 JSON | 将所有用户设置重置为默认值 |
| **L2** — 模式 | `controlBarLayout` 是否符合预期结构 | 仅将布局重置为内置默认值；其他设置保留 |
| **L3a** — 修复 | 缺少 `'default'` 分组；`separator` 值无效 | 就地修复，不丢失数据；记录一条 `console.info` 消息 |

L2 重置仅影响布局——你的主题、语言和快捷键不受影响。

---

## 另请参阅

- [Contribution Slot 目录](../slots/ui#ui-control-bar) — `ui.control-bar` slot 与 `ControlBarContribution` 类型
- [Module 架构](../concepts/module-architecture.md) — 内置与 plugin module 如何声明 contribution
