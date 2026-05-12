/**
 * Unit tests for i18n:
 * 1. Language-bundle completeness (all keys present)
 * 2. setLanguage switches the active locale
 * 3. Translation output matches expected strings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setLanguage, i18n } from '../../src/i18n/index';
import zhHant from '../../src/i18n/zh-Hant';
import en from '../../src/i18n/en';
import zhHans from '../../src/i18n/zh-Hans';
import ja from '../../src/i18n/ja';

// Keys every host bundle must define (module-specific strings are in module locales/).
const REQUIRED_KEYS = [
  'preferences', 'close', 'cancel', 'save',
  'tabAppearance', 'tabAbout',
  'sectionAppearance', 'colorMode', 'themeLight', 'themeDark', 'themeSystem',
  'accentColor', 'ballOpacity', 'autoCollapseDelay',
  'sectionInteraction', 'sectionNotifications',
  'reducedMotion',
  'sectionLanguage', 'displayLanguage', 'displayLanguageSub',
  'sectionAbout', 'version', 'license', 'author',
];

describe('language bundle completeness', () => {
  const bundles = { zhHant, en, zhHans, ja };

  for (const [name, bundle] of Object.entries(bundles)) {
    it(`${name} contains all required keys`, () => {
      for (const key of REQUIRED_KEYS) {
        expect(bundle[key], `${name} is missing key: ${key}`).toBeTruthy();
      }
    });
  }
});

describe('setLanguage', () => {
  beforeEach(() => {
    setLanguage('zh-Hant');
  });

  it('switches to en', () => {
    setLanguage('en');
    expect(i18n.global.locale.value).toBe('en');
  });

  it('switches to zh-Hans', () => {
    setLanguage('zh-Hans');
    expect(i18n.global.locale.value).toBe('zh-Hans');
  });

  it('switches to ja', () => {
    setLanguage('ja');
    expect(i18n.global.locale.value).toBe('ja');
  });

  it('unsupported language codes do not change locale', () => {
    setLanguage('zh-Hant');
    setLanguage('de'); // unsupported
    expect(i18n.global.locale.value).toBe('zh-Hant');
  });
});

describe('translation output', () => {
  it('zh-Hant: cancel = 取消', () => {
    setLanguage('zh-Hant');
    expect(i18n.global.t('cancel')).toBe('取消');
  });

  it('en: cancel = Cancel', () => {
    setLanguage('en');
    expect(i18n.global.t('cancel')).toBe('Cancel');
  });

  it('zh-Hans: save = 保存', () => {
    setLanguage('zh-Hans');
    expect(i18n.global.t('save')).toBe('保存');
  });

  it('ja: preferences = 環境設定', () => {
    setLanguage('ja');
    expect(i18n.global.t('preferences')).toBe('環境設定');
  });
});
