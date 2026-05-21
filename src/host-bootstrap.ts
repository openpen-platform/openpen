/**
 * Host bootstrap: register the renderer-side ModuleHost implementation
 * against @openpen/module-api/host so the package's proxy exports resolve.
 *
 * MUST be called exactly once per V8 context (renderer process), before any
 * module / plugin code or Vue component first imports from
 * `@openpen/module-api/host`. Called from `src/main.ts` in production and
 * `tests/setup.js` in unit tests.
 *
 * Adding a new host service:
 *   1. Add its method signature to `ModuleHost` in packages/module-api/src/host/types.ts
 *   2. Add a proxy file in packages/module-api/src/host/<name>.ts
 *   3. Re-export from packages/module-api/src/host/index.ts
 *   4. Import the real implementation here and pass it into registerHost()
 */
import { registerHost } from '@openpen/module-api/host/registry'

import { emit, on } from './core/runtime/event-bus'
import { getAllStrokes, removeStrokeById, pushCommand } from './services/stroke-store'
import { hostCommands } from './services/host-commands'
import {
  resolveColorStyle,
  hexToRgb,
  rgbToHex,
  hsvToRgb,
  rgbToHsv,
  hexToHsv,
  hsvToHex,
  isValidHex,
} from './services/color-utils'
import { useStrokeStyle } from './composables/useStrokeStyle'
import { usePopupAnchor, calculatePopupAnchor } from './composables/usePopupAnchor'
import { usePassthroughGuard } from './composables/usePassthroughGuard'
import { getSlotEntries } from './core/runtime/contribution-store'

export function bootstrapHost(): void {
  registerHost({
    emit,
    on,
    getAllStrokes,
    removeStrokeById,
    pushCommand,
    hostCommands,
    colorUtils: {
      resolveColorStyle,
      hexToRgb,
      rgbToHex,
      hsvToRgb,
      rgbToHsv,
      hexToHsv,
      hsvToHex,
      isValidHex,
    },
    useStrokeStyle,
    usePopupAnchor,
    calculatePopupAnchor,
    usePassthroughGuard,
    getSlotEntries,
  })
}
