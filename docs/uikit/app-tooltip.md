---
title: AppTooltip
description: Hover-triggered tooltip with configurable placement side and open delay.
---

# `AppTooltip`

Hover-triggered tooltip with configurable side and delay.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `content` | `string` | — (**required**) | Tooltip text |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | Preferred placement |
| `delay` | `number` | `200` | Hover-open delay in ms |

## Slots

| Slot | Description |
|---|---|
| `default` | The trigger element (any element receiving hover) |

## Minimal example

```vue
<script setup lang="ts">
import { AppTooltip } from '@openpen/module-api/uikit'
</script>

<template>
  <AppTooltip content="Undo last stroke" side="bottom">
    <button class="cb-btn" aria-label="Undo">↶</button>
  </AppTooltip>
</template>
```

## Combining `AppTooltip` with `AppPopover`

`AppTooltip` (hover) and `AppPopover` (click) MUST be composed with
`AppTooltip` **inside** the `#trigger` slot of `AppPopover`. This is the
only safe nesting order.

### Why this is safe

- `AppPopover` opens on **click**; `AppTooltip` opens on **hover**. The two
  triggers are mutually exclusive — they cannot fire simultaneously.
- Both components are self-contained portals that teleport their floating panels
  to `<body>`. `AppPopover` uses `MODAL_MANAGER_KEY` for mutual exclusion;
  `AppTooltip` wraps `TooltipProvider` directly and uses no shared inject key.
  Nesting one inside the other causes no key collision.
- `z-index` layering is controlled per-portal by the wrapper component; the two
  portals do not interfere.

### Working example

```vue
<script setup lang="ts">
import { AppPopover, AppTooltip } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const opacity = ref(80)
</script>

<template>
  <AppPopover popover-id="opacity-slider" placement="auto">
    <template #trigger="{ active }">
      <!-- AppTooltip wraps the button INSIDE the trigger slot so the
           slot-scope `active` prop remains accessible. -->
      <AppTooltip content="Adjust opacity" side="bottom">
        <button class="cb-btn" :class="{ active }" aria-label="Opacity">
          ◑
        </button>
      </AppTooltip>
    </template>
    <template #content>
      <label>
        Opacity
        <input v-model.number="opacity" type="range" min="0" max="100" />
      </label>
    </template>
  </AppPopover>
</template>
```

> **Note**: the tooltip disappears automatically when the user clicks (the
> browser fires `mouseleave` on click-away), so there is no visual conflict
> between the open popover panel and the tooltip.

### What NOT to do

```vue
<!-- ❌ AppTooltip outside #trigger — loses access to `active` slot scope -->
<AppTooltip content="Adjust opacity" side="bottom">
  <AppPopover popover-id="opacity-slider">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">◑</button>
    </template>
  </AppPopover>
</AppTooltip>
```
