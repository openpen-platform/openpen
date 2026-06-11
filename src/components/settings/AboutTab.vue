<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const appVersion = __APP_VERSION__;
</script>

<template>
  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionAbout') }}</div>

    <div class="cw-row">
      <div class="cw-row-label">{{ t('version') }}</div>
      <span class="about-val" data-testid="about-version">{{ appVersion }}</span>
    </div>

    <div class="cw-row">
      <div class="cw-row-label">{{ t('license') }}</div>
      <span class="about-val" data-testid="about-license">{{ t('licenseValue') }}</span>
    </div>

    <div class="cw-row">
      <div class="cw-row-label">{{ t('author') }}</div>
      <span class="about-val" data-testid="about-author">openpen/navishachiku</span>
    </div>

    <div class="desc-row">
      <p class="about-desc">{{ t('description') }}</p>
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
.cw-row-label { font-size: 13.5px; font-weight: 500; }
.about-val { font-size: 13px; color: var(--text-muted); }

.desc-row {
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
}
.about-desc {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
  margin: 0;
}
</style>
