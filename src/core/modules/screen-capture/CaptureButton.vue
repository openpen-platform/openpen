<script setup lang="ts">
/*
 * CaptureButton — control-bar entry for screen capture.
 *
 * Split button: the main click saves a PNG, the caret opens a small menu with
 * the two choices (save to file, copy to clipboard).
 *
 * Icons: camera, download and copy are Lucide (https://lucide.dev, ISC
 * license, see THIRD_PARTY_NOTICES.md), path data identical to lucide 0.104.0.
 */
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { MODAL_MANAGER_KEY, useModuleContext } from '@openpen/module-api'
import { AppButtonDropdown, useDialog } from '@openpen/module-api/uikit'
import { runCapture, type CaptureTarget } from './capture-flow'

const MODULE_ID = '@openpen/screen-capture'
const POPOVER_ID = 'screen-capture-menu'
const isOverlayWindow = new URLSearchParams(window.location.search).get('window') === 'overlay'

const { t } = useI18n()
const ctx = useModuleContext(MODULE_ID)
const dialog = useDialog()
const modalManager = inject(MODAL_MANAGER_KEY)

function capture(target: CaptureTarget) {
  modalManager?.close(POPOVER_ID)
  // The control-bar window has no toast layer, so the host relays the outcome
  // to the overlays. On Wayland the bar lives inside an overlay window, which
  // shows its own toast.
  void runCapture(target, {
    api: window.openPenApi,
    notify: ctx.notify,
    t: ctx.t,
    confirm: (opts) => dialog.confirm(opts),
  }, { toast: isOverlayWindow })
}
</script>

<template>
  <AppButtonDropdown
    :popover-id="POPOVER_ID"
    popover-placement="auto"
    :main-tooltip="t('openpen.screen-capture.tool')"
    :main-aria-label="t('openpen.screen-capture.toolAria')"
    :caret-aria-label="t('openpen.screen-capture.menu')"
    main-testid="controlbar-capture-btn"
    caret-testid="controlbar-capture-caret"
    @main-click="capture('save')"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
        <circle cx="12" cy="13" r="3"/>
      </svg>
    </template>
    <template #popover-content>
      <div class="capture-menu-panel">
        <button class="cb-menu-item" data-testid="capture-menu-save" @click="capture('save')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <div class="cb-menu-item-content">
            <span>{{ t('openpen.screen-capture.menuSave') }}</span>
            <span class="cb-menu-item-sub">{{ t('openpen.screen-capture.menuSaveSub') }}</span>
          </div>
        </button>
        <button class="cb-menu-item" data-testid="capture-menu-copy" @click="capture('copy')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <div class="cb-menu-item-content">
            <span>{{ t('openpen.screen-capture.menuCopy') }}</span>
            <span class="cb-menu-item-sub">{{ t('openpen.screen-capture.menuCopySub') }}</span>
          </div>
        </button>
      </div>
    </template>
  </AppButtonDropdown>
</template>
