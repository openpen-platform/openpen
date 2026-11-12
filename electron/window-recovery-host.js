/**
 * Electron wiring for the window recovery policy (see window-recovery.js):
 * the real escalation dialog, and "disable every installed plugin, then
 * relaunch".
 *
 * Disabling goes through the same `disabledModules` setting the Modules tab
 * edits, so plugin files and plugin settings stay untouched and each plugin can
 * be re-enabled one by one afterwards. Built-in modules are never disabled.
 */
import { app, dialog } from 'electron';
import log from 'electron-log/main.js';
import { t } from './i18n/index.js';
import { getSettings, updateSettings, flushWrites } from './settings-store.js';
import { getInstalledPluginIds } from './module-manifest-loader.js';
import { createWindowRecovery, mergeDisabledModules } from './window-recovery.js';

/** @type {ReturnType<typeof createWindowRecovery> | null} */
let recovery = null;

/**
 * Persist every installed plugin id into `disabledModules`.
 * @returns {Promise<string[]>} the plugin ids that were disabled
 */
export async function disableAllInstalledPlugins() {
  const pluginIds = getInstalledPluginIds();
  const current = getSettings().disabledModules ?? [];
  updateSettings({ disabledModules: mergeDisabledModules(current, pluginIds) });
  await flushWrites();
  return pluginIds;
}

/** @returns {Promise<'reload' | 'disable-plugins' | 'quit'>} */
async function askUser({ kind, detail }) {
  const message = kind === 'crash' ? t('recovery.crashMessage') : t('recovery.loadFailedMessage');
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: t('recovery.title'),
    message,
    detail: `${t('recovery.pluginsKeptNote')}\n\n${detail}`,
    buttons: [t('recovery.reload'), t('recovery.disablePlugins'), t('recovery.quit')],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return ['reload', 'disable-plugins', 'quit'][response] ?? 'reload';
}

async function disablePluginsAndRelaunch() {
  try {
    const ids = await disableAllInstalledPlugins();
    log.warn(`[WindowRecovery] disabled ${ids.length} installed plugin(s) before restart`, ids);
  } catch (err) {
    log.error('[WindowRecovery] could not disable plugins; restarting anyway:', err);
  }
  app.relaunch();
  app.exit(0);
}

/**
 * Put a window under the recovery policy.
 * @param {import('electron').BrowserWindow} win
 * @param {string} label
 * @param {{ onRecovered?: (win: import('electron').BrowserWindow) => void }} [hooks]
 */
export function attachWindowRecovery(win, label, hooks) {
  recovery ??= createWindowRecovery({
    log,
    askUser,
    disablePluginsAndRelaunch,
    quitApp: () => app.exit(0),
  });
  recovery.attach(win, label, hooks);
}
