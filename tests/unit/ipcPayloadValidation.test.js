/**
 * Renderer → main IPC payload validation and channel-name parity.
 *
 * - every main-process handler that reads renderer data goes through the
 *   validated wrappers (static scan of electron/)
 * - invalid payloads are rejected, logged, and never reach the handler
 * - payloads the host renderer and plugin SDK send today still pass unchanged
 * - preload.js and ipc-channels.js declare the same set of channel names
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const warn = vi.fn();
vi.mock('electron-log/main.js', () => ({ default: { warn, info: vi.fn(), error: vi.fn() } }));

const { onValidated, handleValidated } = await import('../../electron/ipc-validation.js');
const schemas = await import('../../electron/ipc-payload-schemas.js');
const channels = await import('../../electron/ipc-channels.js');
const { DEFAULT_SETTINGS } = await import('../../shared/settings-defaults.js');

const ELECTRON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../electron');

function fakeIpc() {
  const listeners = new Map();
  return {
    on: (ch, fn) => listeners.set(ch, fn),
    handle: (ch, fn) => listeners.set(ch, fn),
    emit: (ch, payload) => listeners.get(ch)({ sender: {} }, payload),
  };
}

/** Payloads copied from the host renderer, the plugin SDK and official plugins. */
const VALID = [
  ['windowPositionSchema', { x: 120, y: -40.5 }],
  ['booleanSchema', true],
  ['booleanSchema', false],
  ['toolConfigSchema', { tool: 'arrow' }],
  ['toolConfigSchema', { tool: 'shape', shapeType: 'rect', filled: true }],
  ['strokeStyleSchema', { color: '#818cf8', lineWidth: 4 }],
  ['strokeStyleSchema', { color: { type: 'linear', from: '#ff0000', to: '#0000ff' }, lineWidth: 12 }],
  ['historyStateSchema', { canUndo: true, canRedo: false }],
  ['drawingSnapshotSchema', { strokes: [{ id: 's1', points: [] }], undoStack: [], redoStack: [] }],
  ['pluginConflictResolutionsSchema', { '@openpen/text': '/plugins/text' }],
  ['layoutSchema', { version: 1, groups: [] }],
  ['knownIdsSchema', ['core.freehand', '@openpen/arrow.tool']],
  ['moduleIdSchema', '@openpen/whiteboard'],
  ['moduleSettingsSetSchema', { moduleId: '@openpen/spotlight', settings: { radius: 120 }, schemaVersion: 2 }],
  ['moduleSettingsSetSchema', { moduleId: '@openpen/spotlight', settings: {} }],
  ['moduleCallSchema', { moduleId: '@openpen/cursor-highlight', action: 'ping', payload: { any: ['thing'] } }],
  ['moduleCallSchema', { moduleId: 'm', action: 'a', payload: undefined }],
  ['shortcutSetSchema', { id: 'toggleDrawingMode', accelerator: 'CommandOrControl+Shift+A' }],
  ['shortcutIdSchema', { id: '@openpen/step-marker:reset' }],
  ['moduleShortcutRegisterSchema', { id: '@openpen/step-marker:reset', keys: 'Alt+R' }],
  ['pluginIdPayloadSchema', { id: '@openpen/arrow' }],
  ['pluginSourcePathSchema', { sourcePath: '/Users/me/plugins/arrow.zip' }],
  ['pluginRepoUrlSchema', { repoUrl: 'https://github.com/owner/repo' }],
  ['pluginReportSchema', { id: '@openpen/arrow', version: '1.2.0' }],
  ['pluginReportSchema', { id: '@openpen/arrow', version: undefined }],
  ['policyLocaleSchema', { locale: 'zh-Hant' }],
  ['positioningIntentSchema', { type: 'drag-start' }],
  ['positioningIntentSchema', { type: 'drag-move', ballScreenPos: { x: 10, y: 20 } }],
  ['positioningIntentSchema', {
    type: 'drag-end', ballScreenPos: { x: 10.5, y: 20 }, hadMotion: true, enableDragAutoSnap: false,
    barBounds: { leftFromBall: 20, rightFromBall: 300, topFromBall: -4, bottomFromBall: 24 }, barLayoutClass: 'horizontal',
  }],
  ['positioningIntentSchema', { type: 'drag-end', ballScreenPos: { x: 1, y: 2 }, hadMotion: true, enableDragAutoSnap: true, barBounds: null, barLayoutClass: 'vbar-left' }],
  ['positioningIntentSchema', { type: 'bar-expand', barBounds: { leftFromBall: 1, rightFromBall: 2, topFromBall: 3, bottomFromBall: 4 }, barLayoutClass: 'vbar-free' }],
  ['positioningIntentSchema', { type: 'bar-collapse' }],
  ['positioningIntentSchema', { type: 'summon-to-cursor' }],
  ['captureTargetSchema', 'save'],
  ['captureTargetSchema', 'copy'],
  ['diagnosticsEventIdSchema', 'a1b2c3'],
  ['backupPathSchema', '/Users/me/Library/Application Support/openpen/config.json.bak'],
  ['auditQuerySchema', undefined],
  ['auditQuerySchema', { limit: 50, pluginId: null }],
  ['rendererErrorSchema', { level: 'error', message: 'boom', stack: undefined, source: 'app.js', line: 3, column: 9 }],
  ['rendererErrorSchema', { level: 'error', message: 'unhandledrejection: x', stack: undefined }],
];

/** Wrong types and out-of-range values that must never reach a handler. */
const INVALID = [
  ['windowPositionSchema', { x: 'left', y: 0 }],
  ['windowPositionSchema', { x: Number.NaN, y: 0 }],
  ['windowPositionSchema', { x: 1e9, y: 0 }],
  ['booleanSchema', 'true'],
  ['toolConfigSchema', { tool: '' }],
  ['strokeStyleSchema', { color: '#fff', lineWidth: -1 }],
  ['historyStateSchema', { canUndo: 'yes', canRedo: false }],
  ['drawingSnapshotSchema', 'not-an-object'],
  ['settingsPatchSchema', null],
  ['knownIdsSchema', 'core.freehand'],
  ['moduleIdSchema', 42],
  ['moduleSettingsSetSchema', { moduleId: 'm', settings: {}, schemaVersion: '2' }],
  ['moduleCallSchema', { moduleId: 5, action: 'a' }],
  ['shortcutSetSchema', { id: 'undo', accelerator: 7 }],
  ['moduleShortcutRegisterSchema', { id: 'x' }],
  ['pluginIdPayloadSchema', {}],
  ['pluginSourcePathSchema', { sourcePath: 'x'.repeat(5000) }],
  ['positioningIntentSchema', { type: 'teleport' }],
  ['positioningIntentSchema', { type: 'drag-move', ballScreenPos: { x: 'a', y: 0 } }],
  ['positioningIntentSchema', { type: 'drag-end', ballScreenPos: { x: 1, y: 2 }, hadMotion: true, enableDragAutoSnap: true, barLayoutClass: 'diagonal' }],
  ['diagnosticsEventIdSchema', { id: 'x' }],
  ['backupPathSchema', 12],
  ['auditQuerySchema', { limit: '50' }],
  ['rendererErrorSchema', { message: 42 }],
];

describe('IPC payload validation', () => {
  beforeEach(() => warn.mockClear());

  it('every main-process handler that reads renderer data is registered through a validated wrapper', () => {
    // A raw ipcMain.on / ipcMain.handle whose callback declares a second
    // parameter reads renderer data without a schema.
    const raw = /ipcMain\.(?:on|handle|once)\(\s*([\w.]+)\s*,\s*(?:async\s*)?\(([^)]*)\)/g;
    const offenders = [];
    for (const file of fs.readdirSync(ELECTRON_DIR).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(ELECTRON_DIR, file), 'utf8');
      for (const m of src.matchAll(raw)) {
        const params = m[2].split(',').map((p) => p.trim()).filter(Boolean);
        if (params.length > 1) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(INVALID)('%s rejects %j', (name, payload) => {
    expect(schemas[name].safeParse(payload).success).toBe(false);
  });

  it('an invalid payload never reaches the handler and leaves one log line', async () => {
    const ipc = fakeIpc();
    const onHandler = vi.fn();
    const invokeHandler = vi.fn();
    const fallbackHandler = vi.fn();
    onValidated(ipc, 'window:set-position', schemas.windowPositionSchema, onHandler);
    handleValidated(ipc, 'module:call-handler', schemas.moduleCallSchema, invokeHandler);
    handleValidated(ipc, 'shortcuts:set', schemas.shortcutSetSchema, fallbackHandler, {
      onInvalid: () => ({ ok: false, error: 'Invalid payload' }),
    });

    ipc.emit('window:set-position', { x: 'left', y: 0 });
    expect(() => ipc.emit('module:call-handler', { moduleId: 5, action: 'a' })).toThrow(/Invalid payload/);
    expect(ipc.emit('shortcuts:set', { id: 'undo' })).toEqual({ ok: false, error: 'Invalid payload' });

    expect(onHandler).not.toHaveBeenCalled();
    expect(invokeHandler).not.toHaveBeenCalled();
    expect(fallbackHandler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0][0]).toMatch(/rejected invalid payload on "window:set-position"/);
  });

  it.each(VALID)('%s accepts a payload the app sends today: %j', (name, payload) => {
    const result = schemas[name].safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
  });

  it('a full settings snapshot passes unchanged and keys outside the defaults are ignored, as before', () => {
    const snapshot = { ...DEFAULT_SETTINGS, disabledModules: ['@openpen/arrow'], pluginIdConflictResolutions: { a: '/x' } };
    const result = schemas.settingsPatchSchema.safeParse({ ...snapshot, effectiveTheme: 'dark', bogus: 1 });
    expect(result.data).toEqual({ patch: snapshot, droppedKeys: [] });
  });

  it('one out-of-range stored value does not discard the other valid settings edits', () => {
    // The settings panel echoes back every stored value; a bad one read from
    // config.json must be dropped on its own while the user's edit applies.
    const result = schemas.settingsPatchSchema.safeParse({ ...DEFAULT_SETTINGS, theme: 'dark', language: 'fr', ballOpacity: 1.2 });
    expect(result.data.droppedKeys).toEqual(['language', 'ballOpacity']);
    expect(result.data.patch.theme).toBe('dark');
    expect(result.data.patch).not.toHaveProperty('language');
    expect(result.data.patch).not.toHaveProperty('ballOpacity');
  });
});

describe('inputs the module API allows keep their pre-validation handling', () => {
  it('a module shortcut with no default key still registers and can be set', () => {
    // ShortcutContribution.keys is a plain string, so '' is a legal declaration.
    expect(schemas.moduleShortcutRegisterSchema.safeParse({ id: 'm/s', keys: '' }).success).toBe(true);
    expect(schemas.shortcutSetSchema.safeParse({ id: 'm/s', accelerator: '' }).success).toBe(true);
  });

  it('module settings with a non-object value or a non-integer version are stored as before', () => {
    // settingsSchema is any zod type and settingsVersion any number.
    for (const settings of ['text', [1, 2], null]) {
      const result = schemas.moduleSettingsSetSchema.safeParse({ moduleId: 'm', settings, schemaVersion: 1.5 });
      expect(result.data).toEqual({ moduleId: 'm', settings: {}, schemaVersion: 1.5 });
    }
  });

  it('audit log queries typed in DevTools pass any numeric limit or since, as before', () => {
    for (const opts of [{ limit: 20000 }, { limit: Infinity }, { limit: 2.5 }, { limit: -1 }, { since: -1 }]) {
      expect(schemas.auditQuerySchema.safeParse(opts).data).toEqual(opts);
    }
  });

  it('only channels that threw before validation may reject the renderer promise', () => {
    // Every other invoke channel answers an invalid payload with a value, so
    // no caller gains a new unhandled rejection.
    const MAY_THROW = ['MODULE.CALL_HANDLER'];
    const throwing = [];
    for (const file of fs.readdirSync(ELECTRON_DIR).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(ELECTRON_DIR, file), 'utf8');
      // Each registration runs until the next registration or end of file.
      const parts = src.split(/(?=handleValidated\(|onValidated\(|ipcMain\.(?:on|handle)\()/);
      for (const part of parts.filter((p) => p.startsWith('handleValidated(ipcMain'))) {
        const channel = /handleValidated\(\s*ipcMain\s*,\s*([\w.]+)/.exec(part)[1];
        if (!/onInvalid|INVALID_RESULT/.test(part) && !MAY_THROW.includes(channel)) throwing.push(`${file}: ${channel}`);
      }
    }
    expect(throwing).toEqual([]);
  });
});

describe('IPC channel names: preload and ipc-channels stay in sync', () => {
  it('preload.js uses exactly the channels declared in ipc-channels.js', () => {
    const declared = new Set(Object.values(channels).flatMap((group) => Object.values(group)));
    const preload = fs.readFileSync(path.join(ELECTRON_DIR, 'preload.js'), 'utf8');
    const used = new Set(
      [...preload.matchAll(/ipcRenderer\.(?:send|invoke|on|once|removeListener)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    );
    expect([...used].filter((c) => !declared.has(c)), 'in preload.js but not ipc-channels.js').toEqual([]);
    expect([...declared].filter((c) => !used.has(c)), 'in ipc-channels.js but not preload.js').toEqual([]);
  });
});
