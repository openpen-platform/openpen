<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AppSlider, AppSegmented, AppSwatchPicker } from '@openpen/module-api/uikit';
import { ACCENT_PRESETS } from '../../core/modules/color/accent-presets';
import type { AppSettings } from '../../types/settings';

const { t } = useI18n();

const props = defineProps<{
  /** Settings draft owned by the parent; this tab mutates it directly. */
  draft: AppSettings
}>();

const LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'ja',    label: '日本語' },
];

// Accent colour presets: the same five colours the colour module offers.
const ACCENT_SWATCHES = ACCENT_PRESETS.map((p) => ({ value: p.value, label: p.label, testid: `settings-color-chip-${p.id}` }));
const accentBackground = (c: { value: string }) =>
  ACCENT_PRESETS.find((p) => p.value === c.value)?.gradient ?? c.value;


/** Convert opacity between 0.0–1.0 (stored) and 0–100 (slider). */
const opacityPercent = computed({
  get: () => Math.round(props.draft.ballOpacity * 100),
  set: (v) => { props.draft.ballOpacity = v / 100; },
});

const themeOptions = computed(() => [
  {
    value: 'light',
    label: t('themeLight'),
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    testid: 'theme-light',
  },
  {
    value: 'dark',
    label: t('themeDark'),
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    testid: 'theme-dark',
  },
  {
    value: 'system',
    label: t('themeSystem'),
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    testid: 'theme-system',
  },
]);

function setAccent(color: string) {
  props.draft.defaultColor = color;
}

function setLanguage(lang: string) {
  props.draft.language = lang as AppSettings['language'];
}

function setTheme(theme: string) {
  props.draft.theme = theme as AppSettings['theme'];
}
</script>

<template>
  <!-- Language section -->
  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionLanguage') }}</div>

    <!-- Display language -->
    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('displayLanguage') }}</div>
        <div class="cw-row-sub">{{ t('displayLanguageSub') }}</div>
      </div>
      <select
        class="cw-select"
        data-testid="settings-language-select"
        :value="draft.language"
        :aria-label="t('displayLanguage')"
        @change="setLanguage(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">
          {{ lang.label }}
        </option>
      </select>
    </div>
  </div>

  <!-- Appearance section -->
  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionAppearance') }}</div>

    <!-- Color mode -->
    <div class="cw-row cw-row-col">
      <div>
        <div class="cw-row-label">{{ t('colorMode') }}</div>
        <div class="cw-row-sub">{{ t('colorModeSub') }}</div>
      </div>
      <AppSegmented
        class="theme-seg"
        :model-value="draft.theme"
        :options="themeOptions"
        @update:model-value="setTheme($event)"
      />
    </div>

    <!-- App accent color -->
    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('accentColor') }}</div>
        <div class="cw-row-sub">{{ t('accentColorSub') }}</div>
      </div>
      <AppSwatchPicker
        :model-value="draft.defaultColor || ''" :colors="ACCENT_SWATCHES" shape="rounded" size="large"
        :background="accentBackground" :ariaLabel="t('accentColor')"
        testid="settings-color-chips" @update:model-value="setAccent" />
    </div>

    <!-- Floating ball opacity -->
    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('ballOpacity') }}</div>
        <div class="cw-row-sub">{{ t('ballOpacitySub') }}</div>
      </div>
      <div class="opacity-row" data-testid="settings-opacity-row">
        <AppSlider
          v-model="opacityPercent"
          :min="20"
          :max="100"
          :step="1"
          width="80px"
          track-height="8px"
          track-radius="4px"
          thumb-width="24px"
          thumb-height="16px"
          thumb-radius="8px"
        />
        <span class="opacity-val">{{ opacityPercent }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cw-section { margin-bottom: 24px; }
.cw-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.cw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  margin-bottom: 6px;
  gap: 12px;
}
.cw-row-col {
  align-items: flex-start;
  flex-direction: column;
}
.cw-row-label { font-size: 13.5px; font-weight: 500; }
.cw-row-sub   { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

.theme-seg {
  width: 100%;
}

.theme-seg :deep(.app-seg-btn) {
  padding: 6px 8px;
}

/* Opacity slider */
.opacity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.opacity-val {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 32px;
  text-align: right;
}

/* Select */
.cw-select {
  background: var(--input-bg);
  border: 1px solid var(--border-hi);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  padding: 5px 28px 5px 10px;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  flex-shrink: 0;
}
.cw-select:hover { border-color: var(--accent); }
.cw-select:focus-visible {
  outline: 2px solid var(--accent, #818CF8);
  outline-offset: 2px;
}
.cw-select option { background: var(--select-option-bg); }
</style>
