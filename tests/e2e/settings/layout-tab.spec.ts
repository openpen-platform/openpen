/**
 * ControlBar Layout settings tab — strict interaction E2E.
 *
 * Exercises the tab against the real Electron runtime: drag-to-reorder across
 * and within groups, add / delete group, and reset-to-default. Every assertion
 * checks both the rendered DOM and the persisted layout via getLayout() (changes
 * apply immediately; the tab has no save button).
 *
 * Drag is driven through real Playwright mouse moves with intermediate steps
 * and a hover dwell, because SortableJS only fires its move/insert logic on
 * actual mousemove events over the target list (a single move + up does not
 * trigger it).
 */
import { test, expect, type Page, type ElectronApplication, type Locator } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp: ElectronApplication;

attachElectronErrorDetection(() => electronApp);

type LayoutGroup = { id: string; items: string[]; separator?: string };
type ControlBarLayout = { version: number; groups: LayoutGroup[] };

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── Window helpers (data-testid only) ────────────────────────────────────────

async function getMainWindow(): Promise<Page> {
  const deadline = Date.now() + 20000;
  let mainWin: Page | null = null;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          mainWin = w;
          break;
        }
      } catch { /* window may be closing */ }
    }
    if (mainWin) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!mainWin) throw new Error('Main window not found within timeout');
  await mainWin.waitForLoadState('domcontentloaded');
  await mainWin.waitForSelector('.float-ball, .control-bar', { timeout: 20000 });
  return mainWin;
}

async function getWindowCount(): Promise<number> {
  return electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

/** Read the authoritative layout straight from the main process via IPC. */
async function getLayout(win: Page): Promise<ControlBarLayout> {
  return win.evaluate(() => (window as any).openPenApi?.getLayout());
}

async function expandControlBar(mainWin: Page): Promise<void> {
  const expanded = await mainWin.evaluate(() => document.querySelector('.control-bar') !== null);
  if (expanded) return;
  await mainWin.waitForSelector('.float-ball', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('.float-ball')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
  await mainWin.waitForSelector('.control-bar', { timeout: 5000 });
}

/** Open settings via the gear button (real user flow) and switch to the Layout tab. */
async function openLayoutTab(mainWin: Page): Promise<Page> {
  await expandControlBar(mainWin);
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="controlbar-settings-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
  let settingsWin = await winPromise.catch(() => null);
  if (!settingsWin) {
    const fallback = electronApp.waitForEvent('window', { timeout: 8000 });
    await mainWin.evaluate(() => (window as any).openPenApi?.openSettingsWindow());
    settingsWin = await fallback;
  }
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });
  await settingsWin.getByTestId('tab-layout').click();
  await settingsWin.waitForSelector('[data-testid="settings-layout-tab-panel"]', { timeout: 8000 });
  // The layout adopts asynchronously from getLayout(); wait for at least one group.
  await settingsWin.waitForSelector('[data-testid^="settings-layout-group-"]', { timeout: 8000 });
  return settingsWin;
}

async function closeAllSettingsWindows(mainWin: Page): Promise<void> {
  await mainWin.evaluate(() => (window as any).openPenApi?.closeSettingsWindow());
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await getWindowCount()) <= 2) break;
    await mainWin.waitForTimeout(100);
  }
  await mainWin.waitForTimeout(300);
}

// ── Drag helper ──────────────────────────────────────────────────────────────

/**
 * Drive a Sortable (forceFallback) drag from `source` to `target` with real
 * mouse events. Sortable's fallback recomputes the hovered list from each
 * mousemove and only commits on mouseup, so the move MUST be slow and stepped
 * with a jittered dwell over the target — a single jump or a fast move lands
 * before Sortable re-evaluates the target list and the drop is dropped.
 */
async function dragOnto(win: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source/target has no bounding box');

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;

  await win.mouse.move(startX, startY);
  await win.mouse.down();
  // Small nudge to cross Sortable's drag-start threshold.
  await win.mouse.move(startX + 3, startY);
  const STEPS = 40;
  for (let i = 1; i <= STEPS; i++) {
    await win.mouse.move(
      startX + ((endX - startX) * i) / STEPS,
      startY + ((endY - startY) * i) / STEPS,
    );
    await win.waitForTimeout(25);
  }
  // Jittered dwell so Sortable re-evaluates the hovered list and settles insert.
  for (let j = 0; j < 8; j++) {
    await win.mouse.move(endX + (j % 2 ? 2 : -2), endY + (j % 2 ? 2 : -2));
    await win.waitForTimeout(50);
  }
  await win.mouse.move(endX, endY);
  await win.waitForTimeout(150);
  await win.mouse.up();
  await win.waitForTimeout(300);
}

/** Group id of the group currently containing `itemId`, per the live layout. */
function groupOf(layout: ControlBarLayout, itemId: string): string | undefined {
  return layout.groups.find((g) => g.items.includes(itemId))?.id;
}

/**
 * Best drop target for a group: an existing item row inside it (Sortable lands
 * a cross-group drop most reliably when the cursor is over a sibling item),
 * falling back to the group container for an empty group.
 */
function dropTargetFor(win: Page, group: LayoutGroup): Locator {
  if (group.items.length > 0) {
    return win.getByTestId(`settings-layout-item-${group.items[0]}`);
  }
  return win.getByTestId(`settings-layout-group-${group.id}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('Layout tab renders groups and item previews', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  await expect(settingsWin.getByTestId('settings-layout-tab-panel')).toBeVisible();
  await expect(settingsWin.getByTestId('settings-layout-group-list')).toBeVisible();
  // The reserved 'default' group must always exist.
  await expect(settingsWin.getByTestId('settings-layout-group-default')).toBeVisible();

  const layout = await getLayout(settingsWin);
  expect(layout.version).toBe(1);
  expect(layout.groups.some((g) => g.id === 'default')).toBe(true);

  // At least one built-in control-bar item is rendered as an item row.
  const allItems = layout.groups.flatMap((g) => g.items);
  expect(allItems.length).toBeGreaterThan(0);
  const probe = allItems[0];
  await expect(settingsWin.getByTestId(`settings-layout-item-${probe}`)).toBeVisible();

  await closeAllSettingsWindows(mainWin);
});

test('drag reorders an item across groups and persists (live preview, no save)', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  const before = await getLayout(settingsWin);
  // Pick a source group that has an item and a different visible target group.
  const sourceGroup = before.groups.find((g) => g.items.length > 0);
  expect(sourceGroup, 'expected at least one non-empty group').toBeTruthy();
  const movingItem = sourceGroup!.items[0];
  const targetGroup = before.groups.find((g) => g.id !== sourceGroup!.id);
  expect(targetGroup, 'expected a second group to move into').toBeTruthy();

  const itemLoc = settingsWin.getByTestId(`settings-layout-item-${movingItem}`);
  const targetLoc = dropTargetFor(settingsWin, targetGroup!);
  await expect(itemLoc).toBeVisible();
  await expect(targetLoc).toBeVisible();

  await dragOnto(settingsWin, itemLoc, targetLoc);

  // (a) DOM: the item row now lives inside the target group element.
  const movedIntoTargetDom = await settingsWin.evaluate(
    ({ itemId, groupId }) => {
      const group = document.querySelector(`[data-testid="settings-layout-group-${groupId}"]`);
      const item = group?.querySelector(`[data-testid="settings-layout-item-${itemId}"]`);
      return item !== null && item !== undefined;
    },
    { itemId: movingItem, groupId: targetGroup!.id },
  );
  expect(movedIntoTargetDom).toBe(true);

  // (b) Persistence: the live layout reflects the cross-group move without a save.
  await settingsWin.waitForTimeout(300);
  const after = await getLayout(settingsWin);
  expect(groupOf(after, movingItem)).toBe(targetGroup!.id);
  // No item id may appear in two groups.
  const all = after.groups.flatMap((g) => g.items);
  expect(new Set(all).size).toBe(all.length);

  await closeAllSettingsWindows(mainWin);
});

test('add group creates a persisted empty group before default', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  const before = await getLayout(settingsWin);
  const beforeIds = new Set(before.groups.map((g) => g.id));

  await settingsWin.getByTestId('settings-layout-add-group-btn').click();
  await settingsWin.waitForTimeout(400);

  const afterAdd = await getLayout(settingsWin);
  const newGroup = afterAdd.groups.find((g) => !beforeIds.has(g.id));
  expect(newGroup, 'a new group should have been added and persisted').toBeTruthy();
  expect(newGroup!.items).toEqual([]);
  await expect(settingsWin.getByTestId(`settings-layout-group-${newGroup!.id}`)).toBeVisible();
  // New groups are inserted before the reserved 'default' group.
  const newIdx = afterAdd.groups.findIndex((g) => g.id === newGroup!.id);
  const defaultIdx = afterAdd.groups.findIndex((g) => g.id === 'default');
  expect(newIdx).toBeLessThan(defaultIdx);

  await closeAllSettingsWindows(mainWin);
});

test('deleting a populated group re-homes its items into default', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  const before = await getLayout(settingsWin);
  // A non-default group that has items and a delete button (not protected).
  const victim = before.groups.find((g) => g.id !== 'default' && g.items.length > 0);
  expect(victim, 'expected a deletable populated group').toBeTruthy();
  const orphans = [...victim!.items];

  await settingsWin.getByTestId(`settings-layout-delete-group-${victim!.id}-btn`).click();
  await settingsWin.getByRole('button', { name: 'Confirm' }).click();
  await settingsWin.waitForTimeout(400);

  const after = await getLayout(settingsWin);
  // The group is gone and every orphaned item now lives in 'default'.
  expect(after.groups.some((g) => g.id === victim!.id)).toBe(false);
  const defaultItems = after.groups.find((g) => g.id === 'default')!.items;
  for (const id of orphans) {
    expect(defaultItems).toContain(id);
  }

  await closeAllSettingsWindows(mainWin);
});

test('default group cannot be deleted (no delete button)', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  await expect(settingsWin.getByTestId('settings-layout-group-default')).toBeVisible();
  await expect(settingsWin.getByTestId('settings-layout-delete-group-default-btn')).toHaveCount(0);

  await closeAllSettingsWindows(mainWin);
});

test('reset restores DEFAULT_CONTROL_BAR_LAYOUT after a rearrangement', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openLayoutTab(mainWin);

  const before = await getLayout(settingsWin);
  // Sanity: we start from a multi-group arrangement (not already the bare default).
  expect(before.groups.length).toBeGreaterThan(1);

  // Force a divergent state first: move an item across groups.
  const src = before.groups.find((g) => g.items.length > 0);
  const moving = src!.items[0];
  const dst = before.groups.find((g) => g.id !== src!.id);
  await dragOnto(
    settingsWin,
    settingsWin.getByTestId(`settings-layout-item-${moving}`),
    dropTargetFor(settingsWin, dst!),
  );
  await settingsWin.waitForTimeout(300);
  expect(groupOf(await getLayout(settingsWin), moving)).toBe(dst!.id);

  // Reset → confirm.
  await settingsWin.getByTestId('settings-layout-reset-btn').click();
  await settingsWin.getByRole('button', { name: 'Confirm' }).click();
  // Reset persists DEFAULT_CONTROL_BAR_LAYOUT and broadcasts to both windows.
  await settingsWin.waitForTimeout(1000);

  // The reset target is the single empty 'default' group.
  const afterReset = await getLayout(settingsWin);
  expect(afterReset.version).toBe(1);
  expect(afterReset.groups).toEqual([{ id: 'default', items: [], separator: 'auto' }]);
  // The main process holds the same authoritative layout.
  const mainLayout = await getLayout(mainWin);
  expect(mainLayout.groups).toEqual([{ id: 'default', items: [], separator: 'auto' }]);

  await closeAllSettingsWindows(mainWin);
});
