---
title: UI 插槽
description: 9 个 contribution 插槽，涵盖控制栏项目、设置面板、光标、状态徽章、模态框以及系统托盘/上下文菜单。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# UI 插槽

UI 插槽涵盖宿主 chrome 中渲染的所有内容：控制栏项目、设置面板与标签页、各工具专属光标、状态徽章、托管模态框、系统托盘菜单条目、上下文菜单以及主题 token 覆盖。

## `ui.control-bar` — ✅ 可用 {#ui-control-bar}

- **Contribution 键名**：`controlBar`
- **类型**：`ControlBarContribution[]`
- **用途**：控制栏中的按钮 / 滑块 / 弹出触发器。分组及项目排序可由用户通过 `config.json` 中的 `controlBarLayout` 键进行配置。完整 schema 参见 [控制栏布局](../reference/control-bar-layout.md)。
- **排序**：不由 module 声明。项目默认放入 `'default'` 分组，直到用户配置为止；可通过 `defaultGroup` + `groupHint` 建议新分组（详见下文）。

### `ControlBarContribution` 类型

```ts
interface ControlBarContribution {
  id: string            // MUST be globally unique across all modules.
  component: Component  // Vue component rendered as the bar item.
  defaultGroup?: string // Preferred group on first install. Omit → 'default'.
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    // 'auto'   — host decides based on neighbouring groups (default).
    // 'always' — force a visual divider before this item's group.
    // 'never'  — suppress any auto-divider (use for tightly coupled items).
    label?: string | LocaleMap  // Display name for the auto-created group.
  }
}
```

`defaultGroup` 和 `groupHint` 仅为**建议**——用户已保存的布局在首次安装后始终优先于这些设置。

## `ui.settings.panels` — ✅ 可用 {#ui-settings-panels}

- **Contribution 键名**：`settingsPanels`
- **类型**：`SettingsPanelContribution[]`
- **用途**：设置窗口 **功能** 标签页中的各区块，按 module 分组。这是 module 偏好设置的推荐起点——面板会随着 module 的启用或禁用自动显示和隐藏。

### `SettingsPanelContribution` 类型

```ts
interface SettingsPanelContribution {
  id: string                      // unique within this module
  label: string | LocaleMap       // section heading shown above the component
  component: Component            // Vue component rendered as the section body
}
```

> **如何在 `settingsPanels` 与 `settingsTabs` 之间选择**：一两行偏好设置用 `settingsPanels`；仅当 module 需要丰富的多区块布局时才使用专用标签页。完整决策表参见 [guides/module-settings.md](../guides/module-settings.md)。

## `ui.settings.tabs` — ✅ 可用 {#ui-settings-tabs}

- **Contribution 键名**：`settingsTabs`
- **类型**：`SettingsTabContribution[]`
- **用途**：设置窗口中的专属顶级标签页。每个 contribution 是一个全宽 Vue 组件加上 i18n 标签。除非 module 需要丰富的布局控制（多个子区块、预览区域等），否则请优先选用 `settingsPanels`。

## `ui.cursors` — ✅ 可用 {#ui-cursors}

- **Contribution 键名**：`cursors`
- **类型**：`CursorContribution[]`
- **用途**：绘制模式激活时，为各工具渲染的 DOM 光标。宿主隐藏 OS 光标（`cursor: none`），并将匹配的光标 SVG / PNG 作为随鼠标移动的 DOM 元素挂载——完全绕过 OS 合成器，确保光标在 macOS 透明覆层上也能可靠渲染。

### Contribution 结构

```ts
interface CursorContribution {
  /** MUST match the `id` of the `ToolContribution` this cursor activates for. */
  id: string
  cursor: CursorSpec
}

type CursorSpec = string | SvgCursorSpec | PngCursorSpec

interface SvgCursorSpec {
  svg: string                  // inline `<svg>...</svg>` OR plugin-relative path
  hotspot?: { x: number; y: number }   // default `{x:0, y:0}`
  fallback?: string            // CSS keyword fallback, default `'crosshair'`
}

interface PngCursorSpec {
  png: string                  // plugin-relative path; no inline form
  hotspot?: { x: number; y: number }
  fallback?: string
}
```

**关联规则（承重约束）。** `CursorContribution` 上的 `id` 字段必须等于你希望激活该光标的 `ToolContribution`（位于 `canvas.tools` 中）的 `id`。宿主在每次工具切换时通过精确 id 匹配来解析光标 → 工具的对应关系。若 `id` 与任何已注册工具不匹配，则无害但无效（宿主会回退到该工具的默认光标）。

### DX 模式

1. **CSS 关键字（旧版）** — `{ id, cursor: 'crosshair' }`。仅接受 32 个 W3C 光标关键字；宿主在此情况下渲染默认 DOM 光标（关键字本身不会路由到 CSS）。
2. **内联 SVG** — `{ id, cursor: { svg: '<svg>…</svg>', hotspot: { x, y } } }`。宿主在 `compileCursor()` 内通过 DOMPurify 对标记进行净化，然后通过 `v-html` 挂载。
3. **Vite `?raw` 导入** — `import laserSvg from './laser.svg?raw'`，然后 `{ svg: laserSvg, hotspot: … }`。与内联方式相同；构建时将文件内容内联。
4. **相对路径** — `{ svg: 'assets/laser.svg' }` 或 `{ png: 'assets/stamp.png' }`。宿主解析为 `openpen-plugin://<hostname>/<path>`，并在 `compileCursor()` 挂载时进行获取。SVG 路径经过 DOMPurify 处理；PNG 路径被包装在 `<img>` 中（光栅图像在 DOM 上下文中是惰性的）。

URL 形式（`http://`、`https://`、`data:`、`file://`、`openpen-plugin://`）、绝对路径和 `..` 路径遍历在注册时将被拒绝。

### 使用当前描边颜色进行主题适配

宿主将当前激活的描边颜色作为 CSS 自定义属性暴露在 `document.documentElement` 上：

```
--openpen-cursor-accent
```

光标 SVG 可在填充 / 描边属性中引用该属性，以跟随用户的颜色选择：

```html
<circle fill="var(--openpen-cursor-accent, #818cf8)" ... />
<line stroke="var(--openpen-cursor-accent, #818cf8)" ... />
```

当用户选择渐变时，该变量解析为渐变的 `from` 端点颜色（光标只有一个强调色槽）。回退值（`var()` 的第二个参数）用于覆盖首次描边样式事件触发前的短暂窗口期——请选择一个与你的设计相匹配的合理默认值。

此功能为可选接入：硬编码填充颜色的光标不受用户颜色选择影响。内置的 `freehand`、`line` 和 `shape` 光标遵循此约定；`eraser`（橡皮擦尘效果为中性灰）和 `stroke-eraser`（红色 + 靛蓝组合表示"删除整个描边"）则有意不使用此功能。

### 安全契约（plugin 作者须知）

- 嵌入的 `<script>`、`onload=`、`onclick=`、`<foreignObject>` 以及外部 `<image href>` / `<use href>` 会在标记到达 `v-html` 之前由 DOMPurify 清除。净化在 `compileCursor()` 内执行，时机是光标被挂载时（即当激活工具改变时）——而非注册时。针对公开 API 编写的 plugin 无需自行调用 DOMPurify。
- 注册时，宿主将每个 cursor contribution 规范化为严格的允许列表（仅 `id`、`cursor.svg | cursor.png`、`cursor.hotspot`、`cursor.fallback` 通过），并在其侧存储一份**不可变的冻结快照**。从 `setup()` 修改 `myModule.contributes.cursors[0].cursor` 仅作用于 plugin 自身的副本，对宿主渲染内容无影响——宿主从其自身快照中读取。更改已渲染光标的唯一方式是发布新的 module 版本。
- 旧版 `cursor: string` 形式会拒绝包含 `url(`、`image-set(`、`-webkit-image-set(`、`javascript:` 或 `expression(` 的任何值。

## `ui.status` — ✅ 可用 {#ui-status}

- **Contribution 键名**：`status`
- **类型**：`StatusContribution[]`
- **用途**：控制栏上的临时状态徽章（录制指示器、同步状态）。

## `ui.modals` — ✅ 可用 {#ui-modals}

- **Contribution 键名**：`modals`
- **类型**：`ModalContribution[]`
- **用途**：由全局模态框栈托管的已注册模态框。提供焦点捕获、按 ESC 关闭以及层叠防止功能，plugin 无需自行重复实现这些基础能力。

## `ui.tray.menu` — ⏳ 保留 {#ui-tray-menu}

- **Contribution 键名**：`trayMenu`
- **类型**：`TrayMenuContribution[]`
- **用途**：系统托盘菜单项（与内置的显示 / 隐藏 / 退出并列）。
- **保留原因**：托盘管理器尚未接入 plugin contribution。

## `ui.context.menu` — ⏳ 保留 {#ui-context-menu}

- **Contribution 键名**：`contextMenu`
- **类型**：`ContextMenuContribution[]`
- **用途**：画布、工具栏或托盘上的右键上下文菜单项。
- **保留原因**：上下文菜单的 UI 设计尚未定稿；将在后续版本中推出。

## `ui.theme.tokens` — ⏳ 保留 {#ui-theme-tokens}

- **Contribution 键名**：`themeTokens`
- **类型**：`ThemeTokenContribution`
- **用途**：module 提供的 CSS 自定义属性（色板、间距 token、渐变预设）。
- **保留原因**：预期首个使用方为颜色调色板 plugin；待该 plugin 出现时再构建此 slot。
