---
title: 构建你的第一个 OpenPen Plugin
description: 使用 openpen-cli 工具链，从零开始搭建、构建、安装并发布一个 plugin，使其在 OpenPen 中运行。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 构建你的第一个 OpenPen Plugin

在本教程中，你将搭建一个 plugin、构建它、将其安装到 OpenPen 中，
并发布到社区目录——全程使用 `openpen` CLI。

## 前提条件

- Node.js 20+，npm 9+
- 已安装并运行 OpenPen 1.0 或更高版本
- 支持 TypeScript 的代码编辑器
- 已安装并完成身份验证的 `gh` CLI（`gh auth login`）——`openpen publish` 所需

---

## 1. 搭建项目

```bash
npx openpen-cli create @yourscope/my-highlighter
cd my-highlighter
npm install
```

将 `yourscope` 替换为你的 GitHub 用户名或组织名（小写）。
`openpen create` 会复制 plugin-starter 模板，替换 id 占位符，并打印后续步骤。

你将得到如下文件夹结构：

```
my-highlighter/
├── plugin.json         # manifest the host scans at load time
├── package.json        # devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json
└── src/
    └── index.ts        # default-exports a defineModule({...}) call
```

> **`plugin.json` 与 `package.json` 的区别**：`plugin.json` 是 OpenPen 在加载时读取的文件。`package.json` 仅供 Node.js 构建工具链使用。

---

## 2. 安装以进行本地开发

构建 plugin 并直接从本地源目录安装：

```bash
npm run build
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` 会将 `plugin.json`、`dist/` 和 `locales/`
（如存在）复制到 `~/.openpen/plugins/@yourscope/my-highlighter/`。安装时不会在你的机器上执行构建步骤——你构建好的 `dist/` 会被直接使用。

CLI 只写入文件；`plugin-meta.json` 由宿主负责管理，并在下次启动时重建。完整的 lifecycle 及验证安装是否生效的方法，请参见
[`plugin-meta.json` 所有权](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)。

重启 OpenPen。你的 plugin 会自动加载，其 contribution 会显示在控制栏中。

> [!IMPORTANT]
> Plugin 加载需要 OpenPen 的**生产构建**版本
> （`npm run build` 输出 / 打包发布版本）。Vite 开发服务器（在宿主仓库中运行 `npm run dev`）
> **不**加载 plugin。在调试"plugin 未加载"问题之前，请确认你运行的是打包好的 OpenPen。

### 手动安装（替代方案）

如果你希望跳过 CLI：

```bash
npm run build
mkdir -p ~/.openpen/plugins/@yourscope/my-highlighter
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-highlighter/
```

---

## 3. `src/index.ts` 的结构解析

每个 plugin 必须默认导出一个 `OpenPenModule` 对象。使用 `@openpen/module-api` 中的 `defineModule()`：

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [
      {
        id: 'highlighter',
        component: HighlighterButton,
      },
    ],
    locales: { en, 'zh-Hant': zhHant },
  },
})
```

在「设置 → 模块」中显示的名称和描述来自 `locales/en.json` 中的两个**保留键**：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen."
}
```

### 关键字段

| 字段 | 类型 | 说明 |
|-------|------|-------|
| `id` | `string` | `@scope/name` 格式，小写。在目录中必须全局唯一。 |
| `version` | `string` | SemVer。第三方 plugin 必填。 |
| `minAppVersion` | `string` | 可选。如果运行中的宿主版本较旧，OpenPen 会拒绝该 plugin。 |
| `contributes` | `ModuleContributions` | 至少需要一个 slot 条目。 |
| `setup` | `(ctx) => void` | 可选的一次性初始化钩子——在 manifest 验证后运行一次。 |

### `contributes` — 选择 slot

`contributes` 是一个以 slot 名称为键的类型化映射。按需混合搭配：

```ts
contributes: {
  controlBar: [...],        // buttons in the floating control bar
  tools: [...],             // drawing tool implementations
  settingsTabs: [...],      // a tab in Settings > (Your Plugin)
  shortcuts: [...],         // global keyboard shortcuts
  cursors: [...],           // custom cursor per tool
  // ...and more — see slots/index.md
}
```

`defineModule()` 对每个 slot 提供完整的 TypeScript 类型推断，并在构建时进行 id 格式检查，因此错误会在宿主看到 plugin 之前就在你的仓库中暴露出来。

### 实战示例——绘图工具与自定义光标

起始脚手架提供了一个控制栏按钮。要使其成为一个真正能在画布上绘图的绘图工具，需要添加 `tools` + `cursors`。Tool 合约的关键细节：**所有三个指针处理器都将实时 `canvasCtx` 作为第一个参数**；工具在 `onPointerMove` 期间进行增量绘制；只有 `onPointerUp` 返回 `Stroke`（其他处理器返回 `void`）；返回的 `Stroke` 必须携带 `id`（唯一）和 `tool`（与 `ToolContribution.id` 匹配）。

```ts
// src/highlighter-tool.ts
import { resolveStrokeColor } from '@openpen/module-api'
import type { Tool, Stroke, Point, StrokeStyle } from '@openpen/module-api'

const HIGHLIGHTER_ALPHA = 0.35
const HIGHLIGHTER_WIDTH_MUL = 3

export function createHighlighterTool(toolId: string): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  function applyStyle(ctx: CanvasRenderingContext2D, s: StrokeStyle): void {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.strokeStyle = resolveStrokeColor(s.color)
    ctx.lineWidth = s.lineWidth * HIGHLIGHTER_WIDTH_MUL
    ctx.lineCap = 'square'
    ctx.lineJoin = 'miter'
  }

  return {
    needsPreviewRedraw: false,

    onPointerDown(_canvasCtx, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },

    onPointerMove(canvasCtx, point) {
      if (!style || !prev) return
      points.push(point)
      canvasCtx.save()
      applyStyle(canvasCtx, style)
      canvasCtx.beginPath()
      canvasCtx.moveTo(prev.x, prev.y)
      canvasCtx.lineTo(point.x, point.y)
      canvasCtx.stroke()
      canvasCtx.restore()
      prev = point
    },

    onPointerUp(_canvasCtx, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: toolId,
        points: [...points],
        style: { ...style },
        // tool-specific extras: survive into renderStroke for history replay
        alpha: HIGHLIGHTER_ALPHA,
        widthMul: HIGHLIGHTER_WIDTH_MUL,
      }
      points = []
      style = null
      prev = null
      return stroke
    },
  }
}

export function renderHighlighter(
  canvasCtx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  if (stroke.points.length < 2) return
  const alpha = (stroke.alpha as number) ?? HIGHLIGHTER_ALPHA
  const widthMul = (stroke.widthMul as number) ?? HIGHLIGHTER_WIDTH_MUL
  canvasCtx.save()
  canvasCtx.globalAlpha = alpha
  canvasCtx.strokeStyle = resolveStrokeColor(stroke.style.color)
  canvasCtx.lineWidth = stroke.style.lineWidth * widthMul
  canvasCtx.lineCap = 'square'
  canvasCtx.lineJoin = 'miter'
  canvasCtx.beginPath()
  canvasCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    canvasCtx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  canvasCtx.stroke()
  canvasCtx.restore()
}
```

```ts
// src/module-id.ts — single source of truth for the plugin's id
export const MODULE_ID = '@scope/highlighter'
```

```ts
// src/index.ts
import { defineModule } from '@openpen/module-api'
import { MODULE_ID } from './module-id'
import { createHighlighterTool, renderHighlighter } from './highlighter-tool'

const TOOL_ID = 'highlighter'

const highlighterCursor = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
      // chunky marker body — fill follows the user's stroke color via the
      // --openpen-cursor-accent convention.
      '<rect x="6" y="3" width="9" height="14" rx="1.5" ' +
        'fill="var(--openpen-cursor-accent, #ffeb3b)" stroke="#111" stroke-width="1.2"/>' +
      '<polygon points="6,17 15,17 12,22 9,22" fill="#111"/>' +
    '</svg>',
  hotspot: { x: 10, y: 22 },     // bottom tip
  fallback: 'crosshair' as const,
}

export default defineModule({
  id: MODULE_ID,
  version: '0.1.0',
  metadata: { name: { en: 'Highlighter' } },
  contributes: {
    tools: [{
      id: TOOL_ID,
      label: { en: 'Highlighter' },
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="9" height="14" rx="1"/><polygon points="6,17 15,17 12,22 9,22"/></svg>',
      ...createHighlighterTool(TOOL_ID),
      renderStroke: renderHighlighter,
    }],
    cursors: [{
      id: TOOL_ID,                      // MUST match the tool's id
      cursor: highlighterCursor,
    }],
  },
})
```

需要注意的几点：

1. **Tool 合约** — `onPointerDown(canvasCtx, point, style)` 初始化状态但返回 `void`。`onPointerMove(canvasCtx, point)` 在实时 `canvasCtx` 上进行增量绘制。`onPointerUp(canvasCtx, point)` 是唯一返回 `Stroke` 的处理器；该返回对象是宿主为撤销/重做所存储的内容。
2. **Stroke 是值对象** — 它携带 `id`（唯一，`crypto.randomUUID()` 是惯例来源）+ `tool`（与 `ToolContribution.id` 匹配）+ 点集 + 样式 + 你希望为历史回放保留的任何工具特定附加数据。
3. **`renderStroke` 是历史回放钩子** — 当用户撤销/重做/调整大小时，画布引擎会为每个 stroke 调用 `renderStroke(canvasCtx, stroke)` 来回放所有 stroke。使用超出默认折线效果（透明度、自定义宽度、渐变处理）进行绘制的工具**必须**提供它；绘制普通折线的工具可以省略。
4. **`StrokeColor` 是联合类型** — `string | { type: 'linear'; from: string; to: string }`。自定义渲染器必须处理两种情况；上面的代码片段使用 `@openpen/module-api` 中的 `resolveStrokeColor(color)` 为 `ctx.strokeStyle` 选取一个代表性的 CSS 颜色（线性渐变取 `color.from`）。
5. **光标与工具的关联** — `CursorContribution.id === ToolContribution.id`。精确匹配 id，否则宿主会回退到默认光标。

构建并安装后，宿主加载时新工具会出现在控制栏中。完整的 `ToolContribution` + `Tool` + `Stroke` + `StrokeStyle` 接口请参见 [`canvas.tools`](../slots/canvas#canvas-tools)，`CursorContribution` 的形状和 `--openpen-cursor-accent` 主题约定请参见 [`ui.cursors`](../slots/ui#ui-cursors)。

---

## 4. 添加带有 `ctx.t()` 和 `ctx.notify()` 的 `setup` 钩子

`locales/en.json` 存放所有可翻译字符串。`name` 和 `description` 键为模块管理器 UI 保留；在它们旁边添加你自己的运行时字符串：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "notif": { "ready": "Highlighter loaded" }
}
```

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [{ id: 'highlighter', component: HighlighterButton }],
    locales: { en, 'zh-Hant': zhHant },
  },

  setup(ctx) {
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
    ctx.onDispose(() => {
      // cancel timers, remove listeners, etc.
    })
  },
})
```

### `ctx` 提供的内容

| 方法 | 说明 |
|--------|-------------|
| `ctx.t(key, params?)` | 解析此 module 的 locale 命名空间中的 i18n 键。 |
| `ctx.notify(payload)` | 在覆盖层窗口中显示一个 toast。返回 `NotifyHandle`。 |
| `ctx.getSettings<T>()` | 返回此 module 的设置。 |
| `ctx.callMain(action, payload?)` | 调用此 module 的某个主进程处理器。 |
| `ctx.onDispose(fn)` | 注册清理回调——在 module 卸载时调用。 |
| `ctx.moduleId` | 此 module 的 id 字符串。 |
| `ctx.locale` | 当前活跃的 locale，例如 `'en'`。只读。 |

---

## 4a. Vue 组件中的 i18n

`ctx.t()` 也可以在 Vue 组件模板中使用——使用 `useModuleContext()` 获取上下文，并像在 `setup()` 中一样调用 `ctx.t()`。

> **重要提示：** 传递给 `useModuleContext()` 的参数必须与 `plugin.json`（以及 `defineModule({ id })`）中的 `id` 字段完全一致。不匹配会在运行时抛出 `Error`，并在错误信息中指明未注册的 id。推荐的做法是在某处（例如 `src/module-id.ts`）定义一个 `MODULE_ID` 常量，并在所有地方导入它，而不是重复写字符串。

```vue
<!-- HighlighterButton.vue -->
<script setup lang="ts">
import { useModuleContext } from '@openpen/module-api'

// Keys are automatically namespaced — no full path required.
const ctx = useModuleContext('@yourscope/my-highlighter')
</script>

<template>
  <button
    :aria-label="ctx.t('button.label')"
    :data-tip="ctx.t('button.label')"
    @click="activate"
  >
    <!-- icon SVG -->
  </button>
</template>
```

使用 `locales/en.json`：

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "button": { "label": "Highlight" }
}
```

`ctx.t('button.label')` 会在全局 i18n 存储中解析 `yourscope.my-highlighter.button.label`。locale 变化会响应式地重新渲染组件。

> **不要**直接从 `vue-i18n` 调用 `useI18n()` 并传递像 `t('button.label')` 这样的部分路径——这会在宿主 locale 存储（而非你的 plugin 命名空间）中解析，并会静默返回键字符串而非翻译内容。在 Vue 组件中始终通过 `useModuleContext().t()` 调用。

---

## 5. 开发工作流

```bash
npm run dev      # watch mode — rebuilds dist/renderer.js on every save
```

要在 OpenPen 中测试变更，复制并重启：

```bash
npx openpen-cli plugin add .
# then restart OpenPen
```

没有热重载桥接。循环流程是：编辑 → 构建 → 安装 → 重启。

---

## 6. 打包以供分发

当你的 plugin 准备好分享时，创建可分发的 zip 文件：

```bash
npm run build          # clean production build
npx openpen-cli pack       # creates: yourscope-my-highlighter-0.1.0.zip
                       # prints: sha256: <hex>
```

该 zip 文件仅包含 `plugin.json`、`dist/` 和 `locales/`——不含 `src/`、`node_modules/` 和 lifecycle 脚本。

---

## 7. 发布到目录

### 步骤 1 — 创建 GitHub Release

```bash
gh release create v0.1.0 ./yourscope-my-highlighter-0.1.0.zip
```

### 步骤 2 — 提交目录 PR

```bash
npx openpen-cli publish
```

`openpen publish` 会读取 `plugin.json`，验证 GitHub Release 是否存在，
检查你的已验证 GitHub 登录名是否与 plugin scope 匹配，计算 sha256，并在 `OpenPen-plugins` 目录仓库中提交一个 **Registration PR**。

**后续流程：**

- 目录机器人会自动验证你的 PR（scope、id 格式、sha256、release URL）。
- 维护者审查 Registration PR——首次提交需要人工批准。
- 合并后，CI 会重新生成 `plugins.json`，使你的 plugin 在 OpenPen 市场中可被发现。

### 更新你的 plugin

后续发布的流程相同，但步骤 2 会提交 **Update PR** 而非 Registration PR。Update PR 在验证通过后由机器人自动合并——无需人工审查。

```bash
# bump version in plugin.json, then:
npm run build
npx openpen-cli pack
gh release create v0.2.0 ./yourscope-my-highlighter-0.2.0.zip
npx openpen-cli publish
```

---

## 下一步

- [模块架构](../concepts/module-architecture.md) — 四层设计及 plugin 的适配方式
- [信任模型](../concepts/trust-model.md) — plugin 能做和不能做的事
- [Slot 参考](../slots/index.md) — 所有 contribution slot
- [UIKit 参考](../uikit/index.md) — 预置 UI 组件
- [Notify API](../reference/notify-api.md) — toast 通知与 i18n
