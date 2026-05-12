# OpenPen Design Tokens

OpenPen exposes a set of CSS custom properties (design tokens) under the
`--openpen-*` prefix. These tokens represent the visual language of the
host application: colours, spacing, radii, animation timing, and effects.

Plugin authors SHOULD reference these tokens in their component styles instead
of hardcoding raw values. Tokens are the only reliable way to ensure visual
consistency and automatic dark/light theme compliance across OpenPen releases.

---

## How plugins receive tokens automatically

OpenPen's design tokens are loaded once by the host application at startup
(via `@openpen/module-api/uikit/tokens.css` imported into the host's CSS
cascade). Because plugins run inside the **same document** as the host — the
`openpen-plugin://` scheme and importmap wire every plugin into a shared Vue
instance and shared browsing context — the CSS cascade is inherited
automatically.

Concretely: any scoped style in a plugin SFC that writes `var(--openpen-*)` will
resolve to the current theme's token value with zero additional setup.

```css
/* Works out of the box in any plugin SFC */
.my-panel {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  color: var(--openpen-color-text-primary);
}
```

**Do not** add `import '@openpen/module-api/uikit/tokens.css'` to your plugin
entry. The host already injects these declarations into `:root`; importing them
again in a plugin bundle creates a redundant (and potentially conflicting)
second injection.

---

## Optional explicit import

If you are ever building a component that renders outside the host's document
scope — for example, a plugin that opens its own `BrowserWindow` — you would
need to import the token stylesheet directly into that window's document. This
scenario is not currently supported by the plugin system, but the export path
is reserved for forward compatibility:

```ts
// Only needed if your component renders in a completely separate window.
// In normal plugins this import is unnecessary.
import '@openpen/module-api/uikit/tokens.css'
```

---

## Token reference

All tokens are defined in `:root` (dark theme defaults) with a
`[data-theme='light']` override block for the light theme. See the
[dark/light theme section](#darklight-theme-compliance) below.

### Color — Accent

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-accent` | `#818cf8` | Primary brand / interactive highlight |
| `--openpen-color-accent-hover` | `#6366f1` | Deeper accent for `:hover` state |
| `--openpen-color-accent-bg` | `rgba(129,140,248,0.18)` | Tinted background for active items |
| `--openpen-color-accent-glow` | `rgba(129,140,248,0.35)` | Box-shadow rings on active elements |

### Color — Surface

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-surface` | `rgba(18,26,48,0.88)` | Main background for floating panels / bars |
| `--openpen-color-surface-hi` | `rgba(30,41,70,0.92)` | Elevated surface for nested panels / hover |
| `--openpen-color-surface-popup` | `rgba(20,28,50,0.90)` | Popover / dropdown panel background |

### Color — Border

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-border` | `rgba(255,255,255,0.10)` | Default subtle border |
| `--openpen-color-border-hi` | `rgba(255,255,255,0.20)` | Higher-contrast border for focus rings / popup frames |
| `--openpen-color-popover-frame` | `var(--openpen-color-border-hi)` | Shared border + arrow fill for popovers (ensures one continuous edge) |

### Color — Text

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-text-primary` | `#f1f5f9` | Main content text |
| `--openpen-color-text-dim` | `#94a3b8` | Secondary / label text |
| `--openpen-color-text-muted` | `#64748b` | Placeholder / disabled text |

### Color — Tooltip

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-tooltip-bg` | `rgba(15,23,42,0.96)` | Tooltip background (always dark, theme-invariant) |
| `--openpen-color-tooltip-text` | `#f1f5f9` | Tooltip text (always light, theme-invariant) |
| `--openpen-color-tooltip-border` | `rgba(255,255,255,0.15)` | Tooltip border (always light-on-dark, theme-invariant) |

### Color — Control bar chrome

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-control-hover` | `rgba(255,255,255,0.08)` | Control bar button hover background |
| `--openpen-color-control-group` | `rgba(255,255,255,0.04)` | Control bar group container background |

### Color — State (info / warning / success / error)

Each semantic state has four tokens: `bg`, `border`, `text`, and `icon`.

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-state-info-bg` | `rgba(59,130,246,0.10)` | Info state background |
| `--openpen-color-state-info-border` | `rgba(59,130,246,0.26)` | Info state border |
| `--openpen-color-state-info-text` | `#93c5fd` | Info state text |
| `--openpen-color-state-info-icon` | `#60a5fa` | Info state icon fill |
| `--openpen-color-state-warning-bg` | `rgba(251,191,36,0.10)` | Warning state background |
| `--openpen-color-state-warning-border` | `rgba(251,191,36,0.28)` | Warning state border |
| `--openpen-color-state-warning-text` | `#fde68a` | Warning state text |
| `--openpen-color-state-warning-icon` | `#fbbf24` | Warning state icon fill |
| `--openpen-color-state-success-bg` | `rgba(52,211,153,0.10)` | Success state background |
| `--openpen-color-state-success-border` | `rgba(52,211,153,0.26)` | Success state border |
| `--openpen-color-state-success-text` | `#6ee7b7` | Success state text |
| `--openpen-color-state-success-icon` | `#34d399` | Success state icon fill |
| `--openpen-color-state-error-bg` | `rgba(248,113,113,0.10)` | Error state background |
| `--openpen-color-state-error-border` | `rgba(248,113,113,0.26)` | Error state border |
| `--openpen-color-state-error-text` | `#fca5a5` | Error state text |
| `--openpen-color-state-error-icon` | `#f87171` | Error state icon fill |

### Color — Form controls

| Token | Default (dark) | Description |
|---|---|---|
| `--openpen-color-toggle-off` | `rgba(255,255,255,0.12)` | Toggle switch inactive-state track |
| `--openpen-color-input-bg` | `rgba(255,255,255,0.07)` | Text input background |

### Layout — Radius

| Token | Value | Description |
|---|---|---|
| `--openpen-radius-sm` | `6px` | Small elements: tooltips, badges |
| `--openpen-radius-md` | `10px` | Standard elements: buttons, inputs |
| `--openpen-radius-lg` | `14px` | Large panels: popovers, dropdowns |

### Layout — Spacing

| Token | Value | Description |
|---|---|---|
| `--openpen-space-xs` | `4px` | Tight gaps |
| `--openpen-space-sm` | `8px` | Standard inner padding |
| `--openpen-space-md` | `12px` | Section gap |
| `--openpen-space-lg` | `16px` | Outer margin / section spacing |

### Animation — Duration

| Token | Value | Description |
|---|---|---|
| `--openpen-duration-fast` | `150ms` | Micro-interactions (button hover) |
| `--openpen-duration-base` | `250ms` | Standard transitions (collapse) |
| `--openpen-duration-bounce` | `400ms` | Animated entries (expand with overshoot) |

### Animation — Easing

| Token | Value | Description |
|---|---|---|
| `--openpen-easing-bounce` | `cubic-bezier(0.34,1.56,0.64,1)` | Spring-like entrance with overshoot |
| `--openpen-easing-standard` | `cubic-bezier(0.4,0,0.2,1)` | Material-style standard ease |

### Effects — Shadow

| Token | Value | Description |
|---|---|---|
| `--openpen-shadow` | `0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset` | Full floating panel shadow |
| `--openpen-shadow-sm` | `0 4px 16px rgba(0,0,0,0.40)` | Lighter shadow for smaller elements |

### Effects — Blur

| Token | Value | Description |
|---|---|---|
| `--openpen-blur` | `blur(18px) saturate(160%)` | Backdrop blur for frosted-glass panels |

---

## Dark/light theme compliance

The host manages theme state via a `data-theme` attribute on the document root
(`<html data-theme="light">`). Tokens automatically switch values — your plugin
components follow the theme for free as long as they use `var(--openpen-*)`.

Token groups that change between themes:

- Surface, border, text, control chrome, toggle, input — all override in light mode
- State colour variants (info / warning / success / error) — all override in light mode
- Shadow — override in light mode (lighter, softer values)
- **Accent, radius, spacing, duration, easing** — unchanged between themes

Tokens that are **intentionally theme-invariant**:

- `--openpen-color-tooltip-bg`, `--openpen-color-tooltip-text`, and
  `--openpen-color-tooltip-border` — always dark background with light text and
  border regardless of theme, ensuring readability.

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

## Anti-patterns

### Hardcoded colour values

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

### Importing tokens.css in your plugin

```ts
// ❌ Redundant — host already injects tokens into :root
import '@openpen/module-api/uikit/tokens.css'

// ✅ Nothing to import — use var(--openpen-*) directly
```

### Custom --my-plugin-* tokens that duplicate host semantics

```css
/* ❌ Reinventing what the host already provides */
:root {
  --my-plugin-bg: #818cf8; /* same as --openpen-color-accent */
}

/* ✅ Reference the host token directly */
.item { background: var(--openpen-color-accent-bg); }
```

---

## See also

- [UIKit component wrappers](./uikit.md) — pre-built components that apply tokens automatically
- [Primitives, escape hatch & peer dependency rules](./primitives.md) — Layer 2/3 access and importmap contract
- [Custom UIKit components guide](../guides/custom-uikit-components.md) — building your own components with tokens
