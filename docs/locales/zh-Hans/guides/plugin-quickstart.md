---
title: Plugin 快速入门
description: 从零开始，五分钟内运行一个 OpenPen plugin。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T02:00:00Z
language: zh-Hans
---

# Plugin 快速入门

从零开始，五分钟内运行一个 OpenPen plugin。

## 前置条件

- Node.js 20+，npm 9+
- 已安装 OpenPen 1.0 或更高版本

---

## 第 1 步 — 从起始模板脚手架

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
```

将 `yourscope` 替换为你的 GitHub 用户名或组织名（小写）。
`openpen create` 会复制 plugin-starter 模板，替换 id，并打印后续步骤。

> **手动脚手架注意事项**：如果你跳过 `openpen-cli create` 而手动复制
> plugin-starter，你 MUST 保持以下三处同步——它们都声明了 plugin id，
> 不一致会导致 `useModuleContext()` 在运行时抛出异常：
> - `plugin.json` → `"id"`
> - `src/module-id.ts` → `MODULE_ID`
> - `src/index.ts` 中的 `defineModule({ id })`（通常从 `module-id.ts` 导入）

## 第 2 步 — 构建

```bash
npm run build    # outputs dist/renderer.js
npm run dev      # watch mode during development
```

## 第 3 步 — 在本地安装以供测试

使用 CLI 将构建好的 plugin 复制到宿主的 plugin 目录：

```bash
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` 会将 `plugin.json`、`dist/` 和 `locales/`
（如果存在）复制到 `~/.openpen/plugins/@yourscope/my-plugin/`。宿主在启动时扫描
该目录；更多内容参见教程的[实战示例](../tutorials/build-your-first-plugin.md#2-install-for-local-development)。

> 磁盘上的文件只是一半——`plugin-meta.json` 会在 OpenPen 下次启动时由宿主重新构建。
> 关于 `plugin add` 返回后发生的事情，参见
> [`plugin-meta.json` 所有权](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)。

### 手动安装（备选方案）

如果 CLI 不可用，等效的 shell 命令为：

```bash
mkdir -p ~/.openpen/plugins/@yourscope/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-plugin/
```

## 第 4 步 — 在应用中测试

重启 OpenPen，在控制栏中查找你的 contribution。

> [!IMPORTANT]
> Plugin 加载需要 OpenPen 的**正式构建版本**
> （`npm run build` 的输出 / 打包后的发行版）。Vite 开发服务器（在宿主 repo 中运行 `npm run dev`）
> **不会**加载 plugin——安装在
> `~/.openpen/plugins/` 中的 plugin 在开发模式下会被跳过。在排查「plugin 未加载」问题前，
> 请确认你运行的是已打包的 OpenPen。

---

## 项目结构

```
my-plugin/
├── plugin.json             ← Manifest the host scans (id, version, etc.)
├── package.json            ← devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json           ← Optional, used by `npm run check`
└── src/
    ├── module-id.ts        ← Single source of truth for the plugin's id
    ├── index.ts            ← Default-exports an OpenPenModule
    └── *.vue / *.ts        ← Your plugin's components & helpers
```

`src/module-id.ts` 导出一个 `MODULE_ID` 常量，供 `index.ts` 中的 `defineModule({ id })` 以及所有需要引用 plugin id 的代码路径导入。将 id 集中在一处是上方注意事项所警告的惯例——完整示例参见 [tutorials/build-your-first-plugin.md](../tutorials/build-your-first-plugin.md)。

---

## Module 入口点

每个 plugin MUST 从 `src/index.ts` 默认导出一个 `OpenPenModule` 对象。
标准做法是使用 `@openpen/module-api` 中的 `defineModule()`：

```ts
import { defineModule } from '@openpen/module-api'
```

导入路径为**包根路径**——不需要子路径导出。

### 最小化 `src/index.ts`

```ts
import { defineModule } from '@openpen/module-api'
import MyButton from './MyButton.vue'

export default defineModule({
  id: '@yourscope/my-plugin',            // @scope/name format, globally unique
  contributes: {
    controlBar: [{ id: 'my-btn', component: MyButton }],
  },
})
```

`defineModule()` 对 `contributes` 提供完整的 TypeScript 类型推断，
并在 module 自身的构建边界执行 id 格式与 slot 键的合理性检查（使错误
在你的 repo 中暴露，而非在宿主加载时深埋其中）。

完整的 `OpenPenModule` 接口及所有可用的 `contributes` 键，参见
[module-architecture.md](../concepts/module-architecture.md)。

---

## `contributes` 的作用

`contributes` 是一个以 slot 为键的类型化映射。按需组合；至少添加一项。

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  contributes: {
    tools: [{ id: 'my-tool', /* onPointerDown/Move/Up + renderStroke — see slots.md */ }],
    cursors: [{ id: 'my-tool', cursor: { svg: '<svg .../>', hotspot: { x: 4, y: 20 } } }],
    controlBar: [{ id: 'btn', component: MyBtn }],
    settingsPanels: [{ id: 'prefs', label: { en: 'My Plugin' }, component: MyPrefsPanel }],
    shortcuts: [{
      id: 'do-thing',
      keys: 'CommandOrControl+Alt+D',
      scope: 'global',
      label: { en: 'Do the thing' },
      userCustomizable: true,
      handler() {},
    }],
  },
})
```

- `tools` 注册一个绘图工具。完整的 `ToolContribution` 接口（id、label、icon、指针处理器、可选的 `renderStroke`）参见 [`canvas.tools`](../slots/canvas#canvas-tools)。
- `cursors` 将自定义 DOM 光标绑定到工具——`CursorContribution` 上的 `id` MUST 与对应 `ToolContribution` 的 `id` 匹配。光标形状选项（内联 SVG / 相对路径 / PNG）及 `--openpen-cursor-accent` 主题约定参见 [`ui.cursors`](../slots/ui#ui-cursors)。
- `settingsPanels` 在**设置 → 功能**中添加一个区块。仅当 module 需要专属完整标签页时才使用 `settingsTabs`。
- 带有 `label` 和 `userCustomizable: true` 的 shortcut 会出现在**设置 → 快捷键**的 module 分组下，供用户重新绑定。两者都省略则以声明的默认值静默运行。
- 选择不与常见 OS 绑定冲突的加速键默认值；若 `globalShortcut.register` 被拒绝，运行时会在控制台输出错误日志。

完整的设置 API（`getSettings`、`updateSettings`、`onSettingsChange`），参见 [guides/module-settings.md](./module-settings.md)。

完整的 slot 目录参见 [slots/index.md](../slots/index.md)。

---

## 边界规则

Plugin 代码只能从以下路径导入：

- plugin 内部的相对路径
- `@openpen/module-api`（SDK）
- `node:*`（仅限主进程处理器）
- 第三方 npm 包

导入宿主内部模块（如 `src/services/...`）会被宿主的边界测试拒绝。SDK 已暴露你所需的一切。

### 常见陷阱

**`zod` 必须来自 `@openpen/module-api`。** `zod` 由构建 CLI 外部化，
在运行时通过宿主的 importmap 解析。直接使用 `import { z } from 'zod'`
会在正式构建中产生未解析的 specifier 错误。请始终使用：

```ts
import { z } from '@openpen/module-api'
```

**`@openpen/module-api/uikit` 同样被外部化。** 构建 CLI 会自动处理。
如果你覆盖了 `rollupOptions.external`，需包含以下全部三项：
`'vue'`、`'@openpen/module-api'` 和 `'@openpen/module-api/uikit'`。

---

## 使用 UIKit 组件

OpenPen 提供 UIKit 包装组件，让你的 plugin 无需额外工作即可匹配宿主的
视觉风格。完整组件参考参见 [uikit/index.md](../uikit/index.md)。

快速示例——一个打开滑块弹出框的按钮：

```vue
<script setup lang="ts">
import { AppPopover, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <AppSlider v-model="value" :min="0" :max="100" width="120px" />
    </template>
  </AppPopover>
</template>
```

对于反馈和状态消息，使用 `AppBanner`：

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const saveError = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="saveError" variant="error" inline>{{ saveError }}</AppBanner>
</template>
```

可用变体：`info`、`warning`、`success`、`error`。`inline` 属性
切换为紧凑的单行布局，适用于对话框和表单区域。

---

## 后续步骤

- **发布** → [guides/publishing.md](./publishing.md) — 构建用于分发的版本
- **Module 设置** → [guides/module-settings.md](./module-settings.md) — settingsSchema、useModuleContext、面板与标签页
- **完整 UIKit API** → [uikit/index.md](../uikit/index.md)
- **自定义 UIKit 组件** → [uikit/custom-components.md](../uikit/custom-components.md) — 构建超出内置包装器的小部件（标签输入、数字微调器、组合框）
- **设计令牌** → [reference/design-tokens.md](../reference/design-tokens.md) — 你的样式继承的宿主调色板
- **所有 contribution slot** → [slots/index.md](../slots/index.md)
- **逃生舱原语** → [uikit/primitives.md](../uikit/primitives.md)
- **架构深度解析** → [module-architecture.md](../concepts/module-architecture.md)
