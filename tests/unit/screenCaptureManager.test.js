import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/pictures') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  clipboard: { writeImage: vi.fn() },
  desktopCapturer: { getSources: vi.fn() },
  ipcMain: { handle: vi.fn() },
  screen: {},
  shell: { openExternal: vi.fn() },
  systemPreferences: { getMediaAccessStatus: vi.fn() },
}));
vi.mock('electron-log/main.js', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../electron/logger.js', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { createScreenCapture, formatCaptureFileName, pickSourceForDisplay, initScreenCaptureManager, relayResultToOverlays } = await import(
  '../../electron/screen-capture-manager.js'
);
const { ipcMain } = await import('electron');
const { CAPTURE } = await import('../../electron/ipc-channels.js');

const display1 = { id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 };
const display2 = { id: 2, size: { width: 1920, height: 1080 }, scaleFactor: 1 };

function fakeImage(empty = false) {
  return { isEmpty: () => empty, toPNG: () => Buffer.from('png-bytes') };
}

function fakeWindow() {
  const calls = [];
  return {
    calls,
    isDestroyed: () => false,
    webContents: {
      insertCSS: vi.fn(async (css) => { calls.push(['insert', css]); return `key-${calls.length}`; }),
      removeInsertedCSS: vi.fn(async (key) => { calls.push(['remove', key]); }),
      executeJavaScript: vi.fn(async () => undefined),
    },
  };
}

function setup({ cursorDisplay = display1, platform = 'win32', mediaStatus = 'granted', sources, supported = true } = {}) {
  const chrome = fakeWindow();
  const overlay = fakeWindow();
  const image = fakeImage();
  const deps = {
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => cursorDisplay,
      getAllDisplays: () => [display1, display2],
    },
    desktopCapturer: {
      getSources: vi.fn(async () => sources ?? [
        { display_id: '1', thumbnail: image },
        { display_id: '2', thumbnail: fakeImage() },
      ]),
    },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => mediaStatus) },
    clipboard: { writeImage: vi.fn() },
    fs: { mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
    platform,
    supported,
    getSaveDir: () => '/pictures/OpenPen',
    getWindows: () => ({ chrome: [chrome], overlays: [overlay] }),
    now: () => new Date(2026, 10, 11, 15, 30, 45),
    sleep: async () => undefined,
  };
  return { deps, chrome, overlay, image, service: createScreenCapture(deps) };
}

describe('screen capture', () => {
  it('saves the cursor display as a timestamped PNG', async () => {
    const { service, deps, image } = setup();
    const result = await service.capture('save');
    expect(result).toEqual({ ok: true, target: 'save', path: path.join('/pictures/OpenPen', 'OpenPen-2026-11-11-153045.png') });
    expect(deps.fs.mkdir).toHaveBeenCalledWith('/pictures/OpenPen', { recursive: true });
    expect(deps.fs.writeFile).toHaveBeenCalledWith(result.path, image.toPNG());
    // asks for physical pixels (size × scale factor)
    expect(deps.desktopCapturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 2880, height: 1800 },
    });
  });

  it('puts the same image on the clipboard for copy, without writing a file', async () => {
    const { service, deps, image } = setup();
    expect(await service.capture('copy')).toEqual({ ok: true, target: 'copy' });
    expect(deps.clipboard.writeImage).toHaveBeenCalledWith(image);
    expect(deps.fs.writeFile).not.toHaveBeenCalled();
  });

  it('captures the display under the cursor when several are attached', async () => {
    const second = fakeImage();
    const { service, deps } = setup({
      cursorDisplay: display2,
      sources: [{ display_id: '1', thumbnail: fakeImage() }, { display_id: '2', thumbnail: second }],
    });
    await service.capture('copy');
    expect(deps.clipboard.writeImage).toHaveBeenCalledWith(second);
    expect(deps.desktopCapturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
  });

  it('refuses without producing an image when macOS screen recording is not granted', async () => {
    const { service, deps } = setup({ platform: 'darwin', mediaStatus: 'denied' });
    expect(await service.capture('save')).toEqual({ ok: false, error: 'permission-denied' });
    expect(deps.fs.writeFile).not.toHaveBeenCalled();
    expect(deps.clipboard.writeImage).not.toHaveBeenCalled();
  });

  it('captures normally on macOS once screen recording is granted', async () => {
    const { service } = setup({ platform: 'darwin', mediaStatus: 'granted' });
    expect((await service.capture('copy')).ok).toBe(true);
  });

  it('reports unsupported where the platform forbids reading the screen', async () => {
    const { service, deps } = setup({ supported: false });
    expect(await service.capture('save')).toEqual({ ok: false, error: 'unsupported' });
    expect(deps.desktopCapturer.getSources).not.toHaveBeenCalled();
  });

  it('hides host chrome only while grabbing, keeps annotations, then restores', async () => {
    const { service, chrome, overlay, deps } = setup();
    deps.desktopCapturer.getSources.mockImplementationOnce(async () => {
      // mid-capture: chrome fully hidden, overlay only loses marked elements
      expect(chrome.calls).toEqual([['insert', expect.stringContaining('html')]]);
      expect(overlay.calls).toEqual([['insert', expect.stringContaining('[data-capture-exclude]')]]);
      return [{ display_id: '1', thumbnail: fakeImage() }];
    });
    await service.capture('copy');
    expect(chrome.calls.at(-1)[0]).toBe('remove');
    expect(overlay.calls.at(-1)[0]).toBe('remove');
  });

  it('restores the chrome even when the capture throws', async () => {
    const { service, chrome, deps } = setup();
    deps.desktopCapturer.getSources.mockRejectedValueOnce(new Error('boom'));
    expect(await service.capture('save')).toEqual({ ok: false, error: 'failed' });
    expect(chrome.calls.at(-1)[0]).toBe('remove');
  });

  it('writes nothing when the grabbed image is empty', async () => {
    const { service, deps } = setup({ sources: [{ display_id: '1', thumbnail: fakeImage(true) }] });
    expect(await service.capture('save')).toEqual({ ok: false, error: 'failed' });
    expect(deps.fs.writeFile).not.toHaveBeenCalled();
  });

  it('can return the bare screen with the overlay hidden too', async () => {
    const { service, overlay } = setup();
    const result = await service.captureDisplayImage({ includeAnnotations: false });
    expect(result.ok).toBe(true);
    expect(overlay.calls[0]).toEqual(['insert', expect.stringContaining('html')]);
  });

  it('treats the same request from several windows as one', async () => {
    const { service } = setup();
    expect((await service.capture('copy')).ok).toBe(true);
    expect(await service.capture('copy')).toEqual({ ok: false, error: 'busy' });
  });

  it('ignores a second request while one is running', async () => {
    const { service } = setup();
    const first = service.capture('copy');
    expect(await service.capture('copy')).toEqual({ ok: false, error: 'busy' });
    expect((await first).ok).toBe(true);
  });
});

describe('capture helpers', () => {
  it('formats a sortable local-time file name', () => {
    expect(formatCaptureFileName(new Date(2026, 0, 5, 9, 3, 7))).toBe('OpenPen-2026-01-05-090307.png');
  });

  it('falls back to display order when sources carry no display id', () => {
    const a = { display_id: '', thumbnail: {} };
    const b = { display_id: '', thumbnail: {} };
    expect(pickSourceForDisplay([a, b], display2, [display1, display2])).toBe(b);
    expect(pickSourceForDisplay([{ display_id: '9' }], display2, [display1, display2])).toBeNull();
  });
});

describe('capture IPC validation', () => {
  function registeredRequestHandler() {
    ipcMain.handle.mockClear();
    initScreenCaptureManager({ getAllOverlayWindows: () => [], supported: false });
    return ipcMain.handle.mock.calls.find(([channel]) => channel === CAPTURE.REQUEST)[1];
  }

  it('answers a failure, without capturing, when the target is not save or copy', async () => {
    const handler = registeredRequestHandler();
    for (const bad of ['delete', undefined, 7, { target: 'save' }]) {
      expect(await handler({}, bad)).toEqual({ ok: false, error: 'failed' });
    }
  });

  it('lets save and copy reach the capture service', async () => {
    const handler = registeredRequestHandler();
    // supported:false makes the service answer 'unsupported', which only a request that passed validation can produce.
    expect(await handler({}, 'save')).toEqual({ ok: false, error: 'unsupported' });
    expect(await handler({}, 'copy')).toEqual({ ok: false, error: 'unsupported' });
  });
});

describe('capture result relay', () => {
  const overlayWindow = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } });

  it('shows a control-bar capture outcome in the overlays, and never doubles up', () => {
    const [a, b] = [overlayWindow(), overlayWindow()];
    const ok = { ok: true, target: 'copy' };

    relayResultToOverlays({ id: 'control-bar' }, 'copy', ok, [a, b]);
    expect(a.webContents.send).toHaveBeenCalledWith(CAPTURE.RESULT, { target: 'copy', result: ok });
    expect(b.webContents.send).toHaveBeenCalledTimes(1);

    for (const result of [{ ok: false, error: 'unsupported' }, { ok: false, error: 'failed' }]) {
      relayResultToOverlays({ id: 'control-bar' }, 'save', result, [b]);
    }
    expect(b.webContents.send).toHaveBeenCalledTimes(3);

    const gone = { isDestroyed: () => true, webContents: { send: vi.fn() } };
    relayResultToOverlays({ id: 'control-bar' }, 'copy', ok, [gone]);
    expect(gone.webContents.send).not.toHaveBeenCalled();
    b.webContents.send.mockClear();

    // asked from an overlay (shortcut): that window shows its own toast
    relayResultToOverlays(a.webContents, 'copy', ok, [a, b]);
    // answered in the asking window instead
    relayResultToOverlays({ id: 'control-bar' }, 'save', { ok: false, error: 'permission-denied' }, [a, b]);
    relayResultToOverlays({ id: 'control-bar' }, 'save', { ok: false, error: 'busy' }, [a, b]);
    expect(a.webContents.send).toHaveBeenCalledTimes(1);
    expect(b.webContents.send).not.toHaveBeenCalled();
  });
});
