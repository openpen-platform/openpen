import { describe, it, expect, vi } from 'vitest';
import { logRendererRecord } from '../../electron/renderer-log.js';

describe('logRendererRecord', () => {
  it('writes each record at the level the renderer sent, and unlevelled records as errors', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const info = { level: 'info', message: '[mcp] plugin @a/b: hi' };
    const warn = { level: 'warn', message: 'careful' };
    const crash = { message: 'boom' };
    logRendererRecord(logger, info);
    logRendererRecord(logger, warn);
    logRendererRecord(logger, crash);
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('renderer:', info);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('renderer:', warn);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('renderer:', crash);
  });

  it('writes a plugin tool record as one line that starts with its prefix, whatever its level', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const prefix = '[mcp] plugin @a/b: ';
    logRendererRecord(logger, { level: 'info', message: `${prefix}hi`, source: 'mcp-plugin-tool' });
    logRendererRecord(logger, { level: 'warn', message: `${prefix}${'x'.repeat(60000)}`, source: 'mcp-plugin-tool' });
    logRendererRecord(logger, { level: 'error', message: `${prefix}a\nb`, source: 'mcp-plugin-tool' });
    expect(logger.info).toHaveBeenCalledExactlyOnceWith(`${prefix}hi`);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(`${prefix}${'x'.repeat(60000)}`);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(`${prefix}a\\nb`);
  });
});
