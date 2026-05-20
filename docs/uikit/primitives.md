# Primitives, Escape Hatch, Design Tokens & Upstream Notice

---

## §1 Primitives (Layer 2)

For full markup / styling control while retaining a11y and keyboard navigation:

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

For these three primitive groups there is no corresponding Layer 1 wrapper.
For guided usage and complete styled examples see
[custom-components.md](./custom-components.md).

**Upstream docs:**
- NumberField → [reka-ui.com/components/number-field](https://reka-ui.com/docs/components/number-field)
- TagsInput → [reka-ui.com/components/tags-input](https://reka-ui.com/docs/components/tags-input)
- Combobox → [reka-ui.com/components/combobox](https://reka-ui.com/docs/components/combobox)

When walking this layer, the plugin author MUST self-manage:
- Modal manager mutual exclusion (`MODAL_MANAGER_KEY`)
- ControlBar animation guard (`CONTROL_BAR_ANIMATING_KEY`)
- Mouse-passthrough registration (`usePassthroughGuard` from `@openpen/module-api/host`)
- Teleport target (`WRAPPER_EL_KEY`)

---

## §2 Escape Hatch (Layer 3)

A plugin MAY install any headless or component library directly in its own
`package.json`. The UIKit MUST NOT block this. Visually matching OpenPen's style
and handling all Electron-specific edge cases is the plugin author's responsibility.

---

## §3 Design Tokens

All wrappers consume `--openpen-*` CSS variables. Plugins MAY reference these tokens
to match the host theme:

```css
color: var(--openpen-color-text-primary);
background: var(--openpen-color-surface-popup);
border-color: var(--openpen-color-border-hi);
border-radius: var(--openpen-radius-md);
```

Full token list: `packages/module-api/src/uikit/tokens.css`.

---

## §4 Peer dependencies & the importmap contract

`vue` and `@openpen/module-api` are **peer dependencies** of every plugin. They
are supplied at runtime by the host — plugins MUST NOT bundle them.

### Why externals are required

The build CLI (`@openpen/build`) pre-configures Rollup to externalize these
packages:

```
rollupOptions.external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit']
```

At runtime the host resolves those bare specifiers through an
[importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
in `dist/index.html`:

```json
{
  "imports": {
    "vue": "./openpen-runtime/vue.js",
    "@openpen/module-api": "./openpen-runtime/module-api.js",
    "@openpen/module-api/uikit": "./openpen-runtime/module-api-uikit.js"
  }
}
```

The `openpen-runtime/*.js` files are self-contained ESM bundles emitted during
`npm run build` (via `scripts/build-runtime.mjs`). Because both the host app and
every plugin resolve these specifiers to the same files, they share a single Vue
instance — which means cross-boundary reactivity and `provide`/`inject` work
correctly.

### Plugin author rules

- **MUST** keep `vue` and `@openpen/module-api` as externals. Bundling them
  creates a second Vue instance, breaks reactivity, and breaks `inject`.
- **MUST** keep `@openpen/module-api/uikit` as an external. Bundling it produces
  a second copy of the headless library and breaks Symbol-based inject keys
  (`MODAL_MANAGER_KEY`, `WRAPPER_EL_KEY`, etc.) that are compared by identity
  across the host–plugin boundary.
- **MUST NOT** add `vue`, `@openpen/module-api`, or `@openpen/module-api/uikit`
  to `dependencies` or `bundledDependencies`. They belong in `devDependencies`
  (or `peerDependencies` for publishable plugin packages).
- If you use `@openpen/build` (the default), all three packages are
  externalized automatically. Only override `rollupOptions.external` if you have
  a specific reason.

### Testing plugins locally

Plugin loading requires the prod build (importmap is only in `dist/index.html`).
Run:

```bash
npm run build                  # Build host + runtime shims
cd packages/my-plugin && npm run build  # Build plugin
# Then install to ~/.openpen/plugins/ and launch with NODE_ENV=production
```

Vite dev server (`npm run dev`) does NOT load plugins — the dev middleware
serves the runtime shim URLs but plugins installed in `~/.openpen/plugins/` are
not scanned in dev mode.

---

## §5 Upstream dependency notice

OpenPen UIKit wraps a headless library internally. That library is **not** part of
the public API surface. If the underlying library is ever replaced, the wrapper
`props` / `events` / `slots` documented here will not change.

---

*Last updated: 2026-04-24*
