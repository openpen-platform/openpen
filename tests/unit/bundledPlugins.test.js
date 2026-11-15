/**
 * Unit tests for electron/bundled-plugins.js (first-launch seeding).
 * Runs against real temp folders; no Electron needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { seedBundledPlugins } from '../../electron/bundled-plugins.js';

let root, bundledDir, pluginsDir, statePath;

function writeBundled(id, version, extra = {}) {
  const dir = path.join(bundledDir, id);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, name: id, version, ...extra }));
  fs.writeFileSync(path.join(dir, 'dist', 'renderer.js'), '// bundled');
}

function writeList(plugins) {
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(bundledDir, 'manifest.json'), JSON.stringify({ plugins }));
}

function seed() {
  return seedBundledPlugins({ bundledDir, pluginsDir, statePath });
}

const installedVersion = (id) =>
  JSON.parse(fs.readFileSync(path.join(pluginsDir, id, 'plugin.json'), 'utf-8')).version;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-bundled-'));
  bundledDir = path.join(root, 'bundled');
  pluginsDir = path.join(root, 'home', 'plugins');
  statePath = path.join(root, 'userData', 'bundled-plugins-state.json');
  writeBundled('@openpen/text', '1.0.0');
  writeBundled('@openpen/arrow', '1.0.0');
  writeList([
    { id: '@openpen/text', version: '1.0.0' },
    { id: '@openpen/arrow', version: '1.0.0' },
  ]);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('seedBundledPlugins', () => {
  it('installs every bundled plugin on first launch', () => {
    const result = seed();
    expect(result.installed.sort()).toEqual(['@openpen/arrow', '@openpen/text']);
    expect(installedVersion('@openpen/text')).toBe('1.0.0');
    expect(fs.existsSync(path.join(pluginsDir, '@openpen/arrow', 'dist', 'renderer.js'))).toBe(true);
  });

  it('does not reinstall a plugin the user removed', () => {
    seed();
    fs.rmSync(path.join(pluginsDir, '@openpen/text'), { recursive: true });
    const result = seed();
    expect(result.installed).toEqual([]);
    expect(fs.existsSync(path.join(pluginsDir, '@openpen/text'))).toBe(false);
  });

  it('keeps a self-installed version and its files untouched', () => {
    const dir = path.join(pluginsDir, '@openpen/text');
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: '@openpen/text', name: 't', version: '0.9.0' }));
    fs.writeFileSync(path.join(dir, 'settings.json'), '{"fontSize":40}');
    const result = seed();
    expect(result.adopted).toEqual(['@openpen/text']);
    expect(result.installed).toEqual(['@openpen/arrow']);
    expect(installedVersion('@openpen/text')).toBe('0.9.0');
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8')).toBe('{"fontSize":40}');
  });

  it('does not bring back an adopted plugin after the user removes it', () => {
    const dir = path.join(pluginsDir, '@openpen/text');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: '@openpen/text', name: 't', version: '0.9.0' }));
    seed();
    fs.rmSync(dir, { recursive: true });
    seed();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('does not overwrite a newer marketplace update on a later launch', () => {
    seed();
    const file = path.join(pluginsDir, '@openpen/text', 'plugin.json');
    fs.writeFileSync(file, JSON.stringify({ id: '@openpen/text', name: 't', version: '1.1.0' }));
    writeBundled('@openpen/text', '1.0.1');
    seed();
    expect(installedVersion('@openpen/text')).toBe('1.1.0');
  });

  it('is a no-op when the bundled folder is missing', () => {
    fs.rmSync(bundledDir, { recursive: true });
    expect(seed()).toEqual({ installed: [], adopted: [], skipped: [] });
    expect(fs.existsSync(pluginsDir)).toBe(false);
  });

  it('retries a plugin whose files were missing and ignores invalid ids', () => {
    fs.rmSync(path.join(bundledDir, '@openpen/arrow'), { recursive: true });
    writeList([
      { id: '@openpen/text', version: '1.0.0' },
      { id: '@openpen/arrow', version: '1.0.0' },
      { id: '../evil', version: '1.0.0' },
    ]);
    expect(seed().installed).toEqual(['@openpen/text']);
    writeBundled('@openpen/arrow', '1.0.0');
    expect(seed().installed).toEqual(['@openpen/arrow']);
    expect(fs.existsSync(path.join(root, 'evil'))).toBe(false);
  });
});
