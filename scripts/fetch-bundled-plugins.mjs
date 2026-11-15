/**
 * Fetch the plugins listed in bundled-plugins.json from the catalog into
 * build/bundled-plugins/, the folder electron-builder ships as an extra
 * resource and the dev app seeds from on first launch.
 *
 * Each plugin goes through the same download, sha256 check and layout
 * validation as a marketplace install. The catalog serves the latest release
 * only, so the pinned version must equal the catalog's version; a mismatch
 * fails the build instead of silently shipping another release.
 *
 * Env: OPENPEN_CATALOG_URL overrides the catalog (local testing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFromCatalog } from '@openpen/plugin-manager';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'bundled-plugins.json'), 'utf-8'));
const outDir = path.join(root, 'build', 'bundled-plugins');

if (!Array.isArray(config.plugins) || config.plugins.length === 0) {
  console.error('[bundled-plugins] bundled-plugins.json lists no plugins');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const shipped = [];
for (const { id, version } of config.plugins) {
  const entry = await installFromCatalog(id, {
    pluginsDir: outDir,
    catalogUrl: process.env.OPENPEN_CATALOG_URL,
  });
  if (entry.version !== version) {
    console.error(`[bundled-plugins] ${id}: pinned ${version} but the catalog serves ${entry.version}`);
    process.exit(1);
  }
  console.log(`[bundled-plugins] ${id}@${entry.version}`);
  shipped.push({ id, version: entry.version });
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ plugins: shipped }, null, 2));
