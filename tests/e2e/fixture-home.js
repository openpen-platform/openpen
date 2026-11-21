/**
 * A HOME of its own for a spec that installs fixture plugins.
 *
 * The run-wide sandbox HOME from globalSetup is shared by every worker. A spec
 * that writes a plugin under `~/.openpen/plugins` and removes it afterwards
 * would delete files another spec, or another parallel instance of the same
 * spec (`--repeat-each`), is still using. Each spec instance instead creates
 * its own HOME, writes its plugins there, launches the app with that HOME, and
 * removes only that directory.
 *
 * The directory is created under os.tmpdir(), which globalSetup points at the
 * run-scoped temp root, so it never lands in the developer's real home and is
 * removed with the root even if a spec dies before its afterAll.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @returns {string} the new HOME directory */
export function createFixtureHome() {
  if (!process.env.OPENPEN_E2E_HOME) {
    throw new Error('OPENPEN_E2E_HOME is not set; refusing to create a fixture HOME outside the e2e run sandbox');
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-fixture-home-'));
}

/** Launch env that makes the app read plugins from `home`. */
export function fixtureHomeEnv(home) {
  return { HOME: home, USERPROFILE: home };
}

/** Plugin directory for `id` (`@scope/name`) under `home`. */
export function fixturePluginDir(home, id) {
  const [scope, name] = id.split('/');
  return path.join(home, '.openpen', 'plugins', scope, name);
}
