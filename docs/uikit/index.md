---
title: UIKit
description: The component library for OpenPen plugin authors — three layers from high-level wrappers to custom components.
---

# OpenPen UIKit

OpenPen UIKit wrappers handle inject keys, mutual exclusion, animation guard, and
mouse-passthrough automatically. Plugin authors MUST start here; no knowledge of
the underlying headless library is required.

Import path:

```ts
import {
  AppButton, AppButtonDropdown,
  AppPopover, AppDialog,
  AppSlider, AppToggle, AppSegmented,
  AppSelect, AppTooltip, AppTabs,
  AppBanner,
  useDialog, useDialogPluginComponent,
} from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
```

> For widgets not listed below (tags input, number spinner, combobox), see
> [custom-components.md](./custom-components.md).

---

## Three layers — pick the right level for the job

UIKit exposes three escalating levels of API access. Choosing the right one up
front saves you from rewrites later.

| Layer | Import path | DX cost | Visual consistency | Bundle impact | Freedom |
|---|---|---|---|---|---|
| **Wrapper** | `@openpen/module-api/uikit` | Low | Automatic — tokens applied for you | Smallest | Low |
| **Primitive re-export** | `@openpen/module-api/uikit` (named exports) | Medium | Token-driven — you write the CSS | Medium | High |
| **Custom component** | `@openpen/module-api/uikit` primitives + your own components | High | Token-driven — you write markup and CSS | Medium | Highest |

### Decision rule

**Wrapper** — use this for the vast majority of components. You get popovers,
dialogs, sliders, toggles, and more with zero boilerplate: inject keys, mutual
exclusion, ControlBar animation guard, and mouse-passthrough are all handled
internally.

**Primitive re-export** — use this when you need full control over markup and
styling but want to keep the accessibility and keyboard-navigation behaviour that
comes with the headless primitives (focus trapping, ARIA attributes, keyboard
close, etc.). You write your own CSS; you manage mutual exclusion and
passthrough yourself (see `docs/uikit/primitives.md`).

**Custom component** — use this for UI patterns that no wrapper covers (for
example, a tags input, a number spinner, or a graph editor). Compose the
primitive re-exports with your own markup, and style it with the `--openpen-*`
design tokens so it follows the host theme. You own visual consistency and
long-term maintenance of that surface. See
[custom-components.md](./custom-components.md) for the full guide.

Plugins MUST NOT install `reka-ui` in their own `package.json` or import it
directly — every layer reaches headless primitives through
`@openpen/module-api/uikit`. This is what keeps your plugin working if the host
swaps its underlying headless library (see "If we ever swap the underlying
headless library" below).

> If you are unsure which layer to use, start with the Wrapper. You can always
> drop to a lower layer later; going the other way is harder.

---

## Components

| Component | Layer | Use case |
|---|---|---|
| [`AppPopover`](./app-popover) | Wrapper | Floating panels anchored to a trigger |
| [`AppDialog`](./app-dialog) | Wrapper | Modal dialogs with backdrop and focus trap |
| [`useDialog`](./use-dialog) | Wrapper | Imperative Promise-based dialog API |
| [`AppSlider`](./app-slider) | Wrapper | Numeric range input |
| [`AppToggle`](./app-toggle) | Wrapper | Boolean on/off switch |
| [`AppSegmented`](./app-segmented) | Wrapper | Mutually-exclusive segmented control |
| [`AppSelect`](./app-select) | Wrapper | Single-select dropdown picker |
| [`AppTooltip`](./app-tooltip) | Wrapper | Hover hint label |
| [`AppTabs`](./app-tabs) | Wrapper | Controlled tabbed-content container |
| [`AppBanner`](./app-banner) | Wrapper | Inline status and feedback messages |
| [`AppButton`](./app-button) | Wrapper | Standard control-bar action button |
| [`AppButtonDropdown`](./app-button-dropdown) | Wrapper | Split-mode button: main action + caret-triggered popover |
| [`primitives`](./primitives) | Primitive re-export | Raw Reka UI re-exports for custom markup |

See [`custom-components`](./custom-components) for the custom component layer (building your own on top of the primitives and design tokens).

---

## If we ever swap the underlying headless library

The OpenPen UIKit currently wraps **Reka UI** as its headless behaviour layer.
This is an internal implementation detail. Plugin authors who import only from
`@openpen/module-api/uikit` should never see it.

If Reka UI is ever deprecated, abandoned, or significantly diverges from the
project's needs, the host has a documented fallback order:

1. **Headless UI Vue** (Tailwind Labs' official Vue port) — mature, widely used,
   smaller component set.
2. **Ark UI** (built on Zag.js, cross-framework with Vue support) — broader
   component coverage, state-machine–driven.
3. **Self-written headless primitives** — a last resort if neither option above
   is viable.

### What this means for each layer

| Layer | Effect of a library swap |
|---|---|
| **Wrapper** (`@openpen/module-api/uikit`) | No change to your code. The wrapper API — props, events, slots — is a stable contract managed by the host. |
| **Primitive re-export** (`@openpen/module-api/uikit` named primitives) | A major-version bump will land. You will need a small, targeted port to update primitive component names or props that changed. |
| **Custom component** (your own components on the primitive re-exports) | Same as the primitive layer for the primitives you compose; your own markup and CSS are unaffected. |

This is documented up front so you can make an informed choice about which layer
to invest in. The wrapper layer is a long-term contract the host team commits to
maintaining across library swaps. If long-term stability matters more than
maximum UI freedom, the wrapper is the right choice.
