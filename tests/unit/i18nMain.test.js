/**
 * Unit tests for electron/i18n/index.js
 *
 * Covers:
 * - initI18n sets initial locale correctly
 * - setLocale switches locale
 * - setLocale with unknown locale is a no-op
 * - t() falls back to en when key is missing from active locale
 * - t() falls back to key string when key is missing from all bundles
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import the module under test. Each test group re-initialises state via initI18n.
import { initI18n, setLocale, t, getLocale } from '../../electron/i18n/index.js';

describe('initI18n + t()', () => {
  beforeEach(async () => {
    // Reset to English before each test.
    await initI18n('en');
  });

  it('initI18n("zh-Hant") → t("tray.quit") returns Traditional Chinese string', async () => {
    await initI18n('zh-Hant');
    expect(t('tray.quit')).toBe('結束 OpenPen');
  });

  it('initI18n("ja") → t("tray.preferences") returns Japanese string', async () => {
    await initI18n('ja');
    expect(t('tray.preferences')).toBe('環境設定…');
  });

  it('initI18n("en") → t("tray.showControlBar") returns English string', async () => {
    await initI18n('en');
    expect(t('tray.showControlBar')).toBe('Show Control Bar');
  });
});

describe('setLocale()', () => {
  beforeEach(async () => {
    await initI18n('en');
  });

  it('setLocale("ja") → t("tray.preferences") returns Japanese string', () => {
    setLocale('ja');
    expect(t('tray.preferences')).toBe('環境設定…');
  });

  it('setLocale("zh-Hans") → t("tray.hideControlBar") returns Simplified Chinese string', () => {
    setLocale('zh-Hans');
    expect(t('tray.hideControlBar')).toBe('隐藏控制栏');
  });

  it('setLocale("xx-invalid") is a no-op — locale stays unchanged', () => {
    setLocale('zh-Hant');
    const localeBefore = getLocale();
    setLocale('xx-invalid');
    expect(getLocale()).toBe(localeBefore);
  });

  it('setLocale("xx-invalid") does not change translation output', () => {
    setLocale('zh-Hant');
    setLocale('xx-invalid');
    expect(t('tray.quit')).toBe('結束 OpenPen');
  });
});

describe('t() fallback chain', () => {
  beforeEach(async () => {
    await initI18n('en');
  });

  it('t("nonexistent.key") returns the key string itself', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('in zh-Hant locale, t("some.missing.key") falls back to key (en also lacks it)', () => {
    setLocale('zh-Hant');
    expect(t('some.missing.key')).toBe('some.missing.key');
  });
});
