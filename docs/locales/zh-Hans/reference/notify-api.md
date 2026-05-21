---
title: ctx.notify() — 消息通知 API
description: ModuleSetupContext 上的 ctx.notify() 方法，用于在覆盖窗口中显示短暂的消息通知。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# ctx.notify() — 消息通知 API

`ctx.notify()` 是 `ModuleSetupContext` 上的一个方法，允许 module 在覆盖窗口中显示短暂的消息通知——例如，在进入绘图模式或触发快捷键时提供即时反馈。

---

## 签名

```typescript
import type { NotifyPayload, NotifyHandle } from '@openpen/module-api'

ctx.notify(payload: NotifyPayload): NotifyHandle
```

---

## `NotifyPayload`

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-------|------|----------|---------|-------------|
| `message` | `string` | ✓ | — | 主要消息，已解析的纯字符串；使用 `ctx.t(key)` 进行国际化 |
| `description` | `string` | — | `undefined` | 副标题文本，例如"再按一次以退出" |
| `icon` | `string` | — | `undefined` | 内联 SVG 字符串，与 `ToolContribution.icon` 使用相同约定 |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | — | `'default'` | 语义颜色变体 |
| `duration` | `number` | — | `1800` | 自动关闭延迟时间，单位为毫秒 |

---

## `NotifyHandle`

`ctx.notify()` 返回一个 `NotifyHandle`，可在 `duration` 到期前关闭通知。

| 方法 | 描述 |
|--------|-------------|
| `dismiss()` | 立即关闭此通知 |

---

## 基本示例

```typescript
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  name: { en: 'My Plugin' },
  contributes: {
    shortcuts: [
      {
        id: 'my-action',
        keys: 'CommandOrControl+Shift+M',
        scope: 'global',
        handler() {
          // Show a toast when the shortcut fires.
        },
      },
    ],
    locales: {
      en: { notif: { ready: 'My Plugin ready' } },
      'zh-Hant': { notif: { ready: '外掛已就緒' } },
      'zh-Hans': { notif: { ready: '插件已就绪' } },
      ja: { notif: { ready: 'プラグインの準備完了' } },
    },
  },

  setup(ctx) {
    // Show a brief initialisation toast when the module loads.
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
  },
})
```

---

## 消息通知何时出现？

> **仅限覆盖窗口。** 消息通知通过 `NotificationLayer` 渲染，该层仅挂载在覆盖窗口中。如果在覆盖窗口未打开时调用 `ctx.notify()`（例如用户只看到悬浮球/控制栏，或应用已折叠到托盘），该调用会**静默无操作**——不报错，也不排队显示。

实际影响：

- **`setup()` 启动通知**：调用会进入队列，但仅在覆盖窗口处于前台时才会显示。若要保证首次运行的提示，请通过你自己 contribution 的 UI 展示（例如首次悬停时的控制栏提示），而非使用 `ctx.notify()`。
- **快捷键处理程序**：切换绘图模式的 shortcut 往往会使覆盖窗口进入前台，因此切换后触发的通知是可靠的。
- **设置窗口通知**：从设置面板调用 `ctx.notify()` 同样会无操作——原因相同。

请将 `ctx.notify()` 视为针对已在绘图中的用户的反馈层，而非通用的公告渠道。

---

## 国际化最佳实践

### 分层：manifest LocaleMap 与运行时 ctx.t()

OpenPen 国际化分为两层，遵循将每语言字符串文件与类型化运行时映射分离的业界惯例：

| 层级 | 用途 | 机制 |
|-------|---------|-----------|
| **Manifest 元数据** | `name`、`description`、contribution `label` 以及其他静态字段 | `LocaleMap`（`Record<string, string>`） |
| **运行时消息** | `ctx.notify()`、状态文本及其他动态字符串 | `ctx.t(key)` → 纯 `string` |

Module manifest 字段（`name` / `description` / `label`）继续使用 `LocaleMap`；运行时消息必须通过 `ctx.t()` 解析后再作为纯字符串传入。

### `.`（点号）是 vue-i18n 的嵌套路径分隔符

**vue-i18n 将 `.` 解释为嵌套对象路径。** 这是一个常见的混淆来源：

```typescript
// Correct: flat key → flat dict
ctx.t('greeting')  // locale dict: { greeting: 'Hello' }

// Correct: dotted key → nested dict
ctx.t('notif.ready')  // locale dict: { notif: { ready: 'Plugin ready' } }

// Wrong: dotted key but dict is a flat string key — never resolves
//    locale dict: { 'notif.ready': 'Plugin ready' }  ← incorrect
```

**规则：**
- 单层键（无点号）→ 平坦字典 `{ greeting: 'Hello' }`
- 层级键（含点号）→ 嵌套对象字典 `{ notif: { ready: '...' } }` — **不是** `{ 'notif.ready': '...' }`

推荐约定：plugin 语言字典使用嵌套字典（与 i18next / formatjs 一致），第一层按 plugin 功能域分组。

### contributes.locales 字典格式

```typescript
contributes: {
  locales: {
    en: {
      notif: {
        ready: 'Plugin ready',
        captured: 'Screenshot copied',
      },
    },
    'zh-Hant': {
      notif: {
        ready: '外掛已就緒',
        captured: '已複製截圖',
      },
    },
    'zh-Hans': {
      notif: {
        ready: '插件已就绪',
        captured: '已复制截图',
      },
    },
    ja: {
      notif: {
        ready: 'プラグインの準備完了',
        captured: 'スクリーンショットをコピーしました',
      },
    },
  },
},
```

---

## 高级示例：提前关闭

```typescript
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  name: { en: 'My Plugin' },
  contributes: {
    locales: {
      en: { notif: { connecting: 'Connecting…', ready: 'Ready' } },
      'zh-Hant': { notif: { connecting: '連線中…', ready: '就緒' } },
    },
  },

  setup(ctx) {
    // Show a notification and dismiss it early when an external event fires.
    const handle = ctx.notify({
      message: ctx.t('notif.connecting'),
      duration: 5000,
    })

    // If the work finishes before the 5-second timeout, dismiss proactively.
    ctx.callMain('initialize').then(() => {
      handle.dismiss()
      ctx.notify({
        message: ctx.t('notif.ready'),
        variant: 'success',
      })
    })
  },
})
```

---

## 用户设置

宿主程序在**设置 → 行为**下提供两个选项：

| 设置 | 描述 |
|---------|-------------|
| `notifyOnDrawingMode` | 是否在切换绘图模式时显示内置 HUD 通知（默认：开启）。仅影响宿主程序发出的绘图模式通知；不影响 plugin 调用 `ctx.notify()` 的结果 |
| `notificationPosition` | 消息通知在覆盖窗口中的显示位置，使用 9 个位置标记之一（见下文） |

### 位置标记（`notificationPosition`）

```
top-left      top-center      top-right
middle-left      center      middle-right
bottom-left   bottom-center   bottom-right
```

默认值：`top-center`。

---

## 限制

- `ctx.notify()` **仅在覆盖窗口中生效**。`NotificationLayer` 仅挂载于此；在 `main` 或 `settings` 窗口中运行的逻辑调用 `notify()` 将被静默忽略。
- 目前对同时显示的消息通知数量没有上限；频繁调用会导致通知在屏幕上堆叠。调用方应按需进行节流处理。

---

## 相关文档

- [`ModuleSetupContext` 完整接口](../../packages/module-api/src/types/module.ts)
- [plugin-quickstart.md](../guides/plugin-quickstart.md) — 五分钟 plugin 开发指南
- [slots.md](../slots/) — 完整 contribution slot 目录
