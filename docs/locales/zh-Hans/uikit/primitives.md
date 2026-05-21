---
title: 原语、逃生舱与设计令牌
description: 当你需要超越 AppPopover / AppDialog / AppSlider 封装组件所提供的标记或样式控制能力时，可直接使用 Reka UI 原语。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 原语、逃生舱、设计令牌与上游声明

---

## §1 原语（第 2 层）

如需完整的标记 / 样式控制，同时保留无障碍访问与键盘导航：

```ts
import {
  // Popover
  PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow,
  // Dialog
  DialogRoot, DialogTrigger, DialogPortal, DialogContent, DialogOverlay,
  // Slider
  SliderRoot, SliderTrack, SliderRange, SliderThumb,
  // Switch (toggle)
  SwitchRoot, SwitchThumb,
  // RadioGroup (segmented control)
  RadioGroupRoot, RadioGroupItem,
  // Select (dropdown)
  SelectRoot, SelectTrigger, SelectPortal, SelectContent, SelectItem,
  // Tooltip
  TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent,
  // Tabs
  TabsRoot, TabsList, TabsTrigger, TabsContent,
  // NumberField — numeric spinner with +/– buttons (no wrapper equivalent)
  NumberFieldRoot, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement,
  // TagsInput — chip / token input (no wrapper equivalent)
  TagsInputRoot, TagsInputInput, TagsInputItem,
  TagsInputItemText, TagsInputItemDelete, TagsInputClear,
  // Combobox — searchable dropdown with free-text (no wrapper equivalent)
  ComboboxRoot, ComboboxAnchor, ComboboxInput, ComboboxTrigger,
  ComboboxPortal, ComboboxContent, ComboboxViewport, ComboboxItem,
  ComboboxItemIndicator, ComboboxGroup, ComboboxLabel,
  ComboboxSeparator, ComboboxEmpty, ComboboxArrow, ComboboxCancel,
} from '@openpen/module-api/uikit'
```

以下三个原语组没有对应的第 1 层封装组件。
关于使用指引与完整样式示例，请参阅
[custom-components.md](./custom-components.md)。

**上游文档：**
- NumberField → [reka-ui.com/components/number-field](https://reka-ui.com/docs/components/number-field)
- TagsInput → [reka-ui.com/components/tags-input](https://reka-ui.com/docs/components/tags-input)
- Combobox → [reka-ui.com/components/combobox](https://reka-ui.com/docs/components/combobox)

使用此层时，plugin 作者 MUST 自行管理：
- 弹窗管理器互斥（`MODAL_MANAGER_KEY`）
- ControlBar 动画守卫（`CONTROL_BAR_ANIMATING_KEY`）
- 鼠标穿透注册（`usePassthroughGuard`，来自 `@openpen/module-api/host`）
- Teleport 目标（`WRAPPER_EL_KEY`）

---

## §2 逃生舱（第 3 层）

plugin MAY 直接在其自身的 `package.json` 中安装任意无头库或组件库。UIKit MUST NOT 阻止此行为。与 OpenPen 样式保持视觉一致、处理所有 Electron 特有的边界情况均由 plugin 作者自行负责。

---

## §3 设计令牌

所有封装组件均使用 `--openpen-*` CSS 变量。plugin MAY 引用这些令牌以匹配宿主主题：

```css
color: var(--openpen-color-text-primary);
background: var(--openpen-color-surface-popup);
border-color: var(--openpen-color-border-hi);
border-radius: var(--openpen-radius-md);
```

完整令牌列表：`packages/module-api/src/uikit/tokens.css`。

---

## §4 对等依赖与 importmap 契约

`vue` 和 `@openpen/module-api` 是每个 plugin 的**对等依赖**。它们在运行时由宿主提供——plugin MUST NOT 将其打包。

### 为何必须外部化

构建 CLI（`@openpen/build`）预先将 Rollup 配置为对以下包进行外部化：

```
rollupOptions.external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit']
```

运行时，宿主通过 `dist/index.html` 中的
[importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
解析这些裸说明符：

```json
{
  "imports": {
    "vue": "./openpen-runtime/vue.js",
    "@openpen/module-api": "./openpen-runtime/module-api.js",
    "@openpen/module-api/uikit": "./openpen-runtime/module-api-uikit.js"
  }
}
```

`openpen-runtime/*.js` 文件是在 `npm run build` 期间（通过 `scripts/build-runtime.mjs`）生成的自包含 ESM 包。由于宿主应用和每个 plugin 都将这些说明符解析到相同的文件，它们共享同一个 Vue 实例——这意味着跨边界响应性及 `provide`/`inject` 均能正常工作。

### plugin 作者须知

- **MUST** 将 `vue` 和 `@openpen/module-api` 保留为外部依赖。打包它们会产生第二个 Vue 实例，破坏响应性，并导致 `inject` 失效。
- **MUST** 将 `@openpen/module-api/uikit` 保留为外部依赖。打包它会产生无头库的第二份副本，并破坏基于 Symbol 的 inject 键（`MODAL_MANAGER_KEY`、`WRAPPER_EL_KEY` 等），这些键在宿主与 plugin 的边界处通过引用相等性进行比较。
- **MUST NOT** 将 `vue`、`@openpen/module-api` 或 `@openpen/module-api/uikit` 添加到 `dependencies` 或 `bundledDependencies`。它们应归入 `devDependencies`（对于可发布的 plugin 包则归入 `peerDependencies`）。
- 如果你使用 `@openpen/build`（默认方式），上述三个包会自动外部化。仅在有特定原因时才覆盖 `rollupOptions.external`。

### 本地测试 plugin

加载 plugin 需要生产构建（importmap 仅存在于 `dist/index.html` 中）。
运行：

```bash
npm run build                  # Build host + runtime shims
cd packages/my-plugin && npm run build  # Build plugin
# Then install to ~/.openpen/plugins/ and launch with NODE_ENV=production
```

Vite 开发服务器（`npm run dev`）不加载 plugin——开发中间件会提供运行时 shim 的 URL，但 `~/.openpen/plugins/` 中安装的 plugin 在开发模式下不会被扫描。

---

## §5 上游依赖声明

OpenPen UIKit 内部封装了一个无头库。该库**不属于**公开 API 接口的一部分。即使底层库日后被替换，此处记录的封装组件属性/事件/插槽也不会发生变化。

---

*最后更新：2026-04-24*
