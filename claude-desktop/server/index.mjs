#!/usr/bin/env node
/**
 * Entry point Claude Desktop runs from the OpenPen .mcpb (see ../manifest.json).
 * The API key arrives as OPENPEN_API_KEY from the extension's user_config.
 * Logs go to stderr, which Claude Desktop keeps in its MCP log for this extension.
 */

import fs from 'node:fs';
import { createBridge, attachStdio } from './bridge.mjs';

let version = '0.0.0';
try {
  version = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')).version ?? version;
} catch {
  // A missing manifest only affects the reported version.
}

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const bridge = createBridge({
  apiKey: (process.env.OPENPEN_API_KEY ?? '').trim(),
  version,
  logger: { error: (...args) => console.error(...args) },
  notify: write,
});
// Claude Desktop closes stdin to stop the server; finish in-flight replies first.
attachStdio(bridge, process.stdin, process.stdout, { onDone: () => process.exit(0) });
