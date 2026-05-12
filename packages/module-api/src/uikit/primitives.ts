/**
 * Reka UI primitive re-exports.
 *
 * This module exposes the raw Reka UI headless components for plugin authors
 * who need full control over markup and styling but still want Reka UI's
 * a11y / focus / keyboard navigation behaviour.
 *
 * Usage (escape hatch from high-level wrappers):
 *   import { PopoverRoot, PopoverTrigger, ... } from '@openpen/module-api/uikit'
 *   // or directly:
 *   import { ... } from '@openpen/module-api/uikit/primitives'  (if re-exported)
 *
 * WARNING: Walking this layer means you must manually handle:
 *   - Modal manager mutual exclusion
 *   - ControlBar animation auto-close (inject CONTROL_BAR_ANIMATING_KEY)
 *   - Mouse passthrough guard (usePassthroughGuard)
 *   - Teleport target (inject WRAPPER_EL_KEY)
 *
 * See docs/reference/uikit.md for the full trade-off description.
 *
 * All v1.0 high-level wrappers are implemented — prefer them over
 * the corresponding primitive:
 *   Popover    → AppPopover
 *   Dialog     → AppDialog
 *   Slider     → AppSlider
 *   Switch     → AppToggle
 *   RadioGroup → AppSegmented
 *   Select     → AppSelect
 *   Tooltip    → AppTooltip
 *   Tabs       → AppTabs
 */

// ── Popover ──────────────────────────────────────────────────────────────────
export {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverArrow,
  PopoverClose,
  PopoverAnchor,
} from 'reka-ui'

// ── Dialog (Modal) ────────────────────────────────────────────────────────────
export {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogContent,
  DialogOverlay,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'

// ── Slider ────────────────────────────────────────────────────────────────────
export {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from 'reka-ui'

// ── Switch (Toggle) ───────────────────────────────────────────────────────────
export {
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui'

// ── RadioGroup (Segmented) ────────────────────────────────────────────────────
export {
  RadioGroupRoot,
  RadioGroupItem,
  RadioGroupIndicator,
} from 'reka-ui'

// ── Select ────────────────────────────────────────────────────────────────────
export {
  SelectRoot,
  SelectTrigger,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectArrow,
  SelectValue,
  SelectIcon,
} from 'reka-ui'

// ── Tooltip ───────────────────────────────────────────────────────────────────
export {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from 'reka-ui'

// ── Tabs ──────────────────────────────────────────────────────────────────────
export {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
} from 'reka-ui'

// ── NumberField (numeric spinner with +/- buttons) ────────────────────────────
export {
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
} from 'reka-ui'

// ── TagsInput (chip / token input) ────────────────────────────────────────────
export {
  TagsInputRoot,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemText,
  TagsInputItemDelete,
  TagsInputClear,
} from 'reka-ui'

// ── Combobox (searchable dropdown with free-text input) ───────────────────────
export {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxSeparator,
  ComboboxEmpty,
  ComboboxArrow,
  ComboboxCancel,
} from 'reka-ui'
