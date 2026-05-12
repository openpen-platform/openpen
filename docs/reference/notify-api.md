# ctx.notify() — Toast Notification API

`ctx.notify()` is a method on `ModuleSetupContext` that lets a module display a short-lived toast notification in the overlay window — for example, to give immediate feedback when entering drawing mode or triggering a shortcut.

---

## Signature

```typescript
import type { NotifyPayload, NotifyHandle } from '@openpen/module-api'

ctx.notify(payload: NotifyPayload): NotifyHandle
```

---

## `NotifyPayload`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | `string` | ✓ | — | Main message, already-resolved plain string; use `ctx.t(key)` for i18n |
| `description` | `string` | — | `undefined` | Subtitle text, e.g. "Press again to exit" |
| `icon` | `string` | — | `undefined` | Inline SVG string, same convention as `ToolContribution.icon` |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | — | `'default'` | Semantic colour variant |
| `duration` | `number` | — | `1800` | Auto-dismiss delay in milliseconds |

---

## `NotifyHandle`

`ctx.notify()` returns a `NotifyHandle` that can dismiss the notification before `duration` expires.

| Method | Description |
|--------|-------------|
| `dismiss()` | Immediately closes this notification |

---

## Basic example

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

## When does the toast appear?

> **Overlay-window only.** Toasts render through `NotificationLayer`, which is mounted exclusively in the overlay window. If `ctx.notify()` is called while the overlay window is not open (e.g. the user has only the float ball / control bar visible, or the app is collapsed in the tray), the call **silently no-ops** — no error, no queued display.

Practical implications:

- **`setup()` startup toasts**: the call is queued but only displayed if/when the overlay window is the foreground context. For a guaranteed first-run greeting, surface it through your own contribution's UI (e.g. a control-bar tooltip on first hover), not `ctx.notify()`.
- **Shortcut handlers**: shortcuts that toggle drawing mode tend to make the overlay the foreground, so toasts triggered after that toggle are reliable.
- **Settings-window toasts**: `ctx.notify()` from a settings panel will also no-op — same reason.

Treat `ctx.notify()` as a feedback layer for users who are already drawing, not as a general-purpose announcement channel.

---

## i18n best practices

### Layering: manifest LocaleMap vs runtime ctx.t()

OpenPen i18n has two layers, following the industry convention of separating per-locale string files from typed runtime maps:

| Layer | Purpose | Mechanism |
|-------|---------|-----------|
| **Manifest metadata** | `name`, `description`, contribution `label`, and other static fields | `LocaleMap` (`Record<string, string>`) |
| **Runtime message** | `ctx.notify()`, status text, and other dynamic strings | `ctx.t(key)` → plain `string` |

Module manifest fields (`name` / `description` / `label`) continue to use `LocaleMap`; runtime messages must be resolved via `ctx.t()` before being passed as a plain string.

### `.` (dot) is vue-i18n's nested path separator

**vue-i18n interprets `.` as a nested object path.** This is a common source of confusion:

```typescript
// Correct: flat key → flat dict
ctx.t('greeting')  // locale dict: { greeting: 'Hello' }

// Correct: dotted key → nested dict
ctx.t('notif.ready')  // locale dict: { notif: { ready: 'Plugin ready' } }

// Wrong: dotted key but dict is a flat string key — never resolves
//    locale dict: { 'notif.ready': 'Plugin ready' }  ← incorrect
```

**Rules:**
- Single-level key (no dot) → flat dict `{ greeting: 'Hello' }`
- Hierarchical key (with dot) → nested object dict `{ notif: { ready: '...' } }` — **not** `{ 'notif.ready': '...' }`

Recommended convention: use nested dicts for plugin locale dictionaries (consistent with i18next / formatjs), grouped by plugin feature domain at the first level.

### contributes.locales dictionary format

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

## Advanced example: early dismiss

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

## User settings

The host exposes two options under **Settings → Behaviour**:

| Setting | Description |
|---------|-------------|
| `notifyOnDrawingMode` | Whether to show the built-in HUD notification when Drawing Mode is toggled (default: on). Only affects host-issued drawing-mode notifications; does not affect `ctx.notify()` calls from plugins |
| `notificationPosition` | Where the toast appears in the overlay window, using one of 9 position tokens (see below) |

### Position tokens (`notificationPosition`)

```
top-left      top-center      top-right
middle-left      center      middle-right
bottom-left   bottom-center   bottom-right
```

Default: `top-center`.

---

## Limitations

- `ctx.notify()` **only works in the overlay window**. `NotificationLayer` is only mounted there; calling `notify()` from logic running in the `main` or `settings` window will be silently ignored.
- There is currently no cap on simultaneous toasts; frequent calls will stack on screen. Callers should throttle as needed.

---

## Related

- [`ModuleSetupContext` full interface](../../packages/module-api/src/types/module.ts)
- [plugin-quickstart.md](../guides/plugin-quickstart.md) — five-minute plugin development guide
- [slots.md](./slots.md) — full contribution slot catalogue
