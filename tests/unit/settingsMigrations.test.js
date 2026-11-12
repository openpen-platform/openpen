/**
 * Unit tests for settings-migrations.js, run against frozen config.json
 * snapshots in fixtures/config-snapshots/. Each snapshot is the on-disk shape
 * a published release wrote; they must never be edited, only added to.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_CONFIG_VERSION, migrateConfig } from '../../electron/settings-migrations.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-snapshots');
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));

const PUBLISHED_SHAPES = [
  'config-v1.0.0-to-v1.2.0.json',
  'config-v1.3.0-to-v1.4.3.json',
  'config-v1.5.0.json',
];

describe('migrateConfig on frozen snapshots', () => {
  it.each(PUBLISHED_SHAPES)('%s loads as-is with every user value kept', (name) => {
    const original = load(name);
    const result = migrateConfig(original);
    expect(result.fromVersion).toBe(0);
    expect(result.changed).toBe(false);
    expect(result.config).toEqual(original);
  });

  it('legacy values are lifted to the current form and the rest is kept', () => {
    const original = load('config-legacy-values.json');
    const { config, changed } = migrateConfig(original);
    expect(changed).toBe(true);
    expect(config.language).toBe('zh-Hant');
    expect(config.barLayout).toBe('horizontal');
    expect(config.reducedMotion).toBe(true);
    expect(config).not.toHaveProperty('animations');
    const { language, barLayout, animations, ...untouchedBefore } = original;
    const { reducedMotion, ...untouchedAfter } = config;
    expect(untouchedAfter).toEqual({ ...untouchedBefore, language: 'zh-Hant', barLayout: 'horizontal' });
  });
});

describe('migrateConfig edge cases', () => {
  it('an explicit reducedMotion wins over the legacy animations key', () => {
    const { config } = migrateConfig({ animations: false, reducedMotion: false });
    expect(config.reducedMotion).toBe(false);
  });

  it('an unusable configVersion is treated as 0, a current one runs no step, input is not mutated', () => {
    const legacy = { language: 'zh-CN' };
    expect(migrateConfig({ ...legacy, configVersion: 'two' }).config.language).toBe('zh-Hans');
    expect(migrateConfig({ ...legacy, configVersion: -1 }).fromVersion).toBe(0);
    const current = migrateConfig({ ...legacy, configVersion: CURRENT_CONFIG_VERSION });
    expect(current.changed).toBe(false);
    expect(current.config.language).toBe('zh-CN');
    expect(legacy).toEqual({ language: 'zh-CN' });
  });
});
