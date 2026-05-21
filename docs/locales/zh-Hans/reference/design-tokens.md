---
title: OpenPen 设计令牌
description: CSS 自定义属性，使用 --openpen-* 前缀，将宿主应用的视觉语言暴露给 plugin 组件。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# OpenPen 设计令牌

OpenPen 通过 `--openpen-*` 前缀暴露了一组 CSS 自定义属性（设计令牌）。这些令牌代表宿主应用的视觉语言：颜色、间距、圆角、动画时长以及视觉效果。

Plugin 作者 SHOULD 在组件样式中引用这些令牌，而非硬编码原始数值。令牌是确保视觉一致性以及在 OpenPen 各版本间自动适配深色/浅色主题的唯一可靠方式。

---

## Plugin 如何自动接收令牌

OpenPen 的设计令牌在宿主应用启动时一次性加载（通过将 `@openpen/module-api/uikit/tokens.css` 导入宿主的 CSS 层叠中）。由于 plugin 运行在与宿主**相同的文档**中——`openpen-plugin://` 协议和 importmap 将每个 plugin 接入共享的 Vue 实例和共享的浏览上下文——CSS 层叠会被自动继承。

具体而言：任何在 plugin SFC 中编写了 `var(--openpen-*)` 的作用域样式，都会在无需任何额外配置的情况下解析为当前主题的令牌值。

```css
/* Works out of the box in any plugin SFC */
.my-panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  color: var(--openpen-color-text-primary);
}
```

**不要**在你的 plugin 入口中添加 `import '@openpen/module-api/uikit/tokens.css'`。宿主已经将这些声明注入到 `:root` 中；在 plugin 包中再次导入会产生多余的（且可能冲突的）二次注入。

---

## 可选的显式导入

如果你需要构建一个在宿主文档作用域之外渲染的组件——例如，一个打开自己的 `BrowserWindow` 的 plugin——你需要将令牌样式表直接导入该窗口的文档。目前 plugin 系统尚不支持此场景，但该导出路径已预留以保证前向兼容性：

```ts
// Only needed if your component renders in a completely separate window.
// In normal plugins this import is unnecessary.
import '@openpen/module-api/uikit/tokens.css'
```

---

## 令牌参考

所有令牌均定义在 `:root`（深色主题默认值）中，并通过 `[data-theme='light']` 覆盖块提供浅色主题值。请参阅下方的[深色/浅色主题适配](#深色浅色主题适配)章节。

### 颜色 — 强调色

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-accent` | `#818cf8` | 主品牌色 / 交互高亮色 |
| `--openpen-color-accent-hover` | `#6366f1` | `:hover` 状态下更深的强调色 |
| `--openpen-color-accent-bg` | `rgba(129,140,248,0.18)` | 活跃项目的着色背景 |
| `--openpen-color-accent-glow` | `rgba(129,140,248,0.35)` | 活跃元素上的 box-shadow 光晕 |

### 颜色 — 表面色

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-surface` | `rgba(18,26,48,0.88)` | 浮动面板/工具栏的主背景色 |
| `--openpen-color-surface-hi` | `rgba(30,41,70,0.92)` | 嵌套面板/悬停时的抬高表面色 |
| `--openpen-color-surface-popup` | `rgba(20,28,50,0.90)` | 弹出层/下拉面板背景色 |

### 颜色 — 边框色

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-border` | `rgba(255,255,255,0.10)` | 默认的细微边框色 |
| `--openpen-color-border-hi` | `rgba(255,255,255,0.20)` | 焦点环/弹出框边框的高对比度边框色 |
| `--openpen-color-popover-frame` | `var(--openpen-color-border-hi)` | 弹出层共享的边框与箭头填充色（确保边缘视觉连续） |

### 颜色 — 文字色

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-text-primary` | `#f1f5f9` | 主要内容文字色 |
| `--openpen-color-text-dim` | `#94a3b8` | 次要/标签文字色 |
| `--openpen-color-text-muted` | `#64748b` | 占位符/禁用状态文字色 |

### 颜色 — 提示框

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-tooltip-bg` | `rgba(15,23,42,0.96)` | 提示框背景色（始终为深色，不随主题变化） |
| `--openpen-color-tooltip-text` | `#f1f5f9` | 提示框文字色（始终为浅色，不随主题变化） |
| `--openpen-color-tooltip-border` | `rgba(255,255,255,0.15)` | 提示框边框色（始终为深底浅框，不随主题变化） |

### 颜色 — 控制栏外壳

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-control-hover` | `rgba(255,255,255,0.08)` | 控制栏按钮悬停背景色 |
| `--openpen-color-control-group` | `rgba(255,255,255,0.04)` | 控制栏分组容器背景色 |

### 颜色 — 状态色（信息/警告/成功/错误）

每种语义状态包含四个令牌：`bg`、`border`、`text` 和 `icon`。

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-state-info-bg` | `rgba(59,130,246,0.10)` | 信息状态背景色 |
| `--openpen-color-state-info-border` | `rgba(59,130,246,0.26)` | 信息状态边框色 |
| `--openpen-color-state-info-text` | `#93c5fd` | 信息状态文字色 |
| `--openpen-color-state-info-icon` | `#60a5fa` | 信息状态图标填充色 |
| `--openpen-color-state-warning-bg` | `rgba(251,191,36,0.10)` | 警告状态背景色 |
| `--openpen-color-state-warning-border` | `rgba(251,191,36,0.28)` | 警告状态边框色 |
| `--openpen-color-state-warning-text` | `#fde68a` | 警告状态文字色 |
| `--openpen-color-state-warning-icon` | `#fbbf24` | 警告状态图标填充色 |
| `--openpen-color-state-success-bg` | `rgba(52,211,153,0.10)` | 成功状态背景色 |
| `--openpen-color-state-success-border` | `rgba(52,211,153,0.26)` | 成功状态边框色 |
| `--openpen-color-state-success-text` | `#6ee7b7` | 成功状态文字色 |
| `--openpen-color-state-success-icon` | `#34d399` | 成功状态图标填充色 |
| `--openpen-color-state-error-bg` | `rgba(248,113,113,0.10)` | 错误状态背景色 |
| `--openpen-color-state-error-border` | `rgba(248,113,113,0.26)` | 错误状态边框色 |
| `--openpen-color-state-error-text` | `#fca5a5` | 错误状态文字色 |
| `--openpen-color-state-error-icon` | `#f87171` | 错误状态图标填充色 |

### 颜色 — 表单控件

| 令牌 | 默认值（深色） | 说明 |
|---|---|---|
| `--openpen-color-toggle-off` | `rgba(255,255,255,0.12)` | 开关控件非激活状态的滑轨色 |
| `--openpen-color-input-bg` | `rgba(255,255,255,0.07)` | 文本输入框背景色 |

### 布局 — 圆角

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-radius-sm` | `6px` | 小型元素：提示框、徽章 |
| `--openpen-radius-md` | `10px` | 标准元素：按钮、输入框 |
| `--openpen-radius-lg` | `14px` | 大型面板：弹出层、下拉菜单 |

### 布局 — 间距

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-space-xs` | `4px` | 紧凑间隙 |
| `--openpen-space-sm` | `8px` | 标准内边距 |
| `--openpen-space-md` | `12px` | 区块间距 |
| `--openpen-space-lg` | `16px` | 外边距/区块间距 |

### 动画 — 时长

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-duration-fast` | `150ms` | 微交互（按钮悬停） |
| `--openpen-duration-base` | `250ms` | 标准过渡（折叠） |
| `--openpen-duration-bounce` | `400ms` | 带动画的入场（带过冲的展开） |

### 动画 — 缓动函数

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-easing-bounce` | `cubic-bezier(0.34,1.56,0.64,1)` | 带过冲的弹簧式入场 |
| `--openpen-easing-standard` | `cubic-bezier(0.4,0,0.2,1)` | Material 风格标准缓动 |

### 效果 — 阴影

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-shadow` | `0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset` | 浮动面板完整阴影 |
| `--openpen-shadow-sm` | `0 4px 16px rgba(0,0,0,0.40)` | 小型元素的轻量阴影 |

### 效果 — 模糊

| 令牌 | 值 | 说明 |
|---|---|---|
| `--openpen-blur` | `blur(18px) saturate(160%)` | 磨砂玻璃面板的背景模糊 |

---

## 深色/浅色主题适配

宿主通过文档根元素上的 `data-theme` 属性管理主题状态（`<html data-theme="light">`）。令牌会自动切换对应值——只要你的 plugin 组件使用了 `var(--openpen-*)`，就能免费跟随主题变化。

在主题切换时会变化的令牌组：

- 表面色、边框色、文字色、控制栏外壳、开关控件、输入框——均在浅色模式下覆盖
- 状态色变体（信息/警告/成功/错误）——均在浅色模式下覆盖
- 阴影——在浅色模式下覆盖（更轻、更柔和的值）
- **强调色、圆角、间距、时长、缓动函数**——在主题切换时保持不变

**有意设计为不随主题变化**的令牌：

- `--openpen-color-tooltip-bg`、`--openpen-color-tooltip-text` 和
  `--openpen-color-tooltip-border`——始终为深色背景配浅色文字和边框，
  无论主题如何，确保可读性。

```vue
<style scoped>
/* This panel is theme-aware with no extra JS */
.status-card {
  background: var(--openpen-color-surface-hi);
  border: 1px solid var(--openpen-color-border);
  color: var(--openpen-color-text-primary);
  padding: var(--openpen-space-md);
  border-radius: var(--openpen-radius-md);
}
</style>
```

---

## 反模式

### 硬编码颜色值

```css
/* ❌ Hardcoded — breaks in light theme, breaks if host palette changes */
.my-button {
  background: #818cf8;
  border-color: rgba(255, 255, 255, 0.20);
  color: #f1f5f9;
}

/* ✅ Token-driven — follows theme automatically */
.my-button {
  background: var(--openpen-color-accent);
  border-color: var(--openpen-color-border-hi);
  color: var(--openpen-color-text-primary);
}
```

### 在 plugin 中导入 tokens.css

```ts
// ❌ Redundant — host already injects tokens into :root
import '@openpen/module-api/uikit/tokens.css'

// ✅ Nothing to import — use var(--openpen-*) directly
```

### 自定义 --my-plugin-* 令牌重复了宿主已有语义

```css
/* ❌ Reinventing what the host already provides */
:root {
  --my-plugin-bg: #818cf8; /* same as --openpen-color-accent */
}

/* ✅ Reference the host token directly */
.item { background: var(--openpen-color-accent-bg); }
```

---

## 另请参阅

- [UIKit 组件封装](../uikit/index.md) — 自动应用令牌的预制组件
- [基础元素、逃生舱口与对等依赖规则](../uikit/primitives.md) — Layer 2/3 访问与 importmap 约定
- [自定义 UIKit 组件指南](../uikit/custom-components.md) — 使用令牌构建你自己的组件
