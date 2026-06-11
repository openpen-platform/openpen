/**
 * One-shot debug spec: inspect computed CSS styles and height interpolation
 * on .pac-modal to diagnose why the height transition is not visible.
 *
 * NOT part of the permanent test suite — lives under dev-only/.
 * Run manually: npx playwright test tests/e2e/dev-only/inspect-dialog-height.spec.js --reporter=list
 */
import { test } from '@playwright/test';
import { launchElectronApp } from '../launch.js';

let electronApp;
let settingsWin;

test.setTimeout(60000);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function openSettingsWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          await w.evaluate(() => window.openPenApi?.openSettingsWindow());
          break;
        }
      } catch { /* window may not be ready yet */ }
    }
    await new Promise((r) => setTimeout(r, 400));
    const wins = electronApp.windows();
    for (const w of wins) {
      try {
        if (w.url().includes('window=settings')) {
          settingsWin = w;
          return;
        }
      } catch { /* skip */ }
    }
  }
  throw new Error('Settings window did not open within timeout');
}

test('inspect pac-modal computed styles and height interpolation', async () => {
  await openSettingsWindow();

  // Wait for settings window to fully load
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });

  // Navigate: Modules top-level tab (defaults to Marketplace sub-tab)
  await settingsWin.click('[data-testid="tab-modules"]');
  await settingsWin.waitForTimeout(300);

  // Click "Add source" button to open pac-modal
  const addSourceBtn = settingsWin.getByTestId('plugins-add-source-btn');
  await addSourceBtn.waitFor({ state: 'visible', timeout: 5000 });
  await addSourceBtn.click();
  await settingsWin.waitForTimeout(300);

  // Wait for pac-modal to appear
  await settingsWin.waitForSelector('[data-testid="pac-modal"]', { timeout: 5000 });

  // --- Capture initial computed styles ---
  const initialData = await settingsWin.evaluate(() => {
    const modal = document.querySelector('[data-testid="pac-modal"]');
    const overlay = document.querySelector('[data-testid="pac-overlay"]');

    if (!modal) return { error: 'pac-modal not found' };

    const cs = window.getComputedStyle(modal);
    const overlayCs = overlay ? window.getComputedStyle(overlay) : null;

    const rect = modal.getBoundingClientRect();

    return {
      modal: {
        height:                   cs.height,
        transition:               cs.transition,
        transitionProperty:       cs.transitionProperty,
        transitionDuration:       cs.transitionDuration,
        transitionTimingFunction: cs.transitionTimingFunction,
        display:                  cs.display,
        heightInlineStyle:        modal.style.height,
        overflow:                 cs.overflow,
        flexDirection:            cs.flexDirection,
        position:                 cs.position,
        boxSizing:                cs.boxSizing,
      },
      overlay: overlayCs ? {
        display:         overlayCs.display,
        alignItems:      overlayCs.alignItems,
        justifyContent:  overlayCs.justifyContent,
        flexDirection:   overlayCs.flexDirection,
        position:        overlayCs.position,
        height:          overlayCs.height,
      } : null,
      rectHeight: rect.height,
      rectWidth:  rect.width,
      activeSubTab: document.querySelector('[data-testid="pac-tab-local"][aria-pressed="true"], [data-testid="pac-tab-github"][aria-pressed="true"]')?.textContent?.trim() ?? 'none',
      allSubTabs: [
        document.querySelector('[data-testid="pac-tab-local"]'),
        document.querySelector('[data-testid="pac-tab-github"]'),
      ].filter(Boolean).map(b => ({
        text: b.textContent?.trim(),
        active: b.classList.contains('active'),
      })),
      rootInterpolateSize: window.getComputedStyle(document.documentElement).interpolateSize ?? 'NOT_EXPOSED',
    };
  });

  console.log('\n=== INITIAL STATE ===');
  console.log(JSON.stringify(initialData, null, 2));

  // --- Switch to the OTHER sub-tab and capture immediately ---
  const localTabActive = await settingsWin.evaluate(() =>
    document.querySelector('[data-testid="pac-tab-local"]')?.classList.contains('active')
  );
  const otherTabTestId = localTabActive ? 'pac-tab-github' : 'pac-tab-local';
  const otherTab = settingsWin.getByTestId(otherTabTestId);
  const otherTabCount = await otherTab.count();
  console.log(`\n=== OTHER SUB-TAB COUNT: ${otherTabCount} ===`);

  if (otherTabCount === 0) {
    console.log('ERROR: No inactive sub-tab found — cannot test height switch');
    return;
  }

  // Record height right before click
  const heightBeforeClick = await settingsWin.evaluate(() => {
    const modal = document.querySelector('[data-testid="pac-modal"]');
    return modal ? modal.getBoundingClientRect().height : -1;
  });
  console.log(`\n=== HEIGHT BEFORE CLICK: ${heightBeforeClick}px ===`);

  // Click the other tab
  await otherTab.first().click();

  // Capture immediately after click
  const immediateData = await settingsWin.evaluate(() => {
    const modal = document.querySelector('[data-testid="pac-modal"]');
    if (!modal) return { error: 'pac-modal not found after tab switch' };
    const cs = window.getComputedStyle(modal);
    const rect = modal.getBoundingClientRect();
    return {
      heightPx:            rect.height,
      computedHeight:      cs.height,
      activeSubTab:        document.querySelector('[data-testid="pac-tab-local"][aria-pressed="true"], [data-testid="pac-tab-github"][aria-pressed="true"]')?.textContent?.trim() ?? 'none',
      localTabContentExists: !!document.querySelector('[data-testid="pac-drop-zone"]'),
      githubTabContentExists: !!document.querySelector('[data-testid="pac-repo-input"]'),
    };
  });

  console.log('\n=== IMMEDIATE AFTER CLICK (~0ms) ===');
  console.log(JSON.stringify(immediateData, null, 2));

  // Wait 400ms (transition should be fully done)
  await settingsWin.waitForTimeout(400);

  const finalData = await settingsWin.evaluate(() => {
    const modal = document.querySelector('[data-testid="pac-modal"]');
    if (!modal) return { error: 'pac-modal not found after wait' };
    const cs = window.getComputedStyle(modal);
    const rect = modal.getBoundingClientRect();
    return {
      heightPx:            rect.height,
      computedHeight:      cs.height,
      activeSubTab:        document.querySelector('[data-testid="pac-tab-local"][aria-pressed="true"], [data-testid="pac-tab-github"][aria-pressed="true"]')?.textContent?.trim() ?? 'none',
      localTabContentExists:  !!document.querySelector('[data-testid="pac-drop-zone"]'),
      githubTabContentExists: !!document.querySelector('[data-testid="pac-repo-input"]'),
    };
  });

  console.log('\n=== AFTER 400ms ===');
  console.log(JSON.stringify(finalData, null, 2));

  // --- Summarize height interpolation ---
  console.log('\n=== HEIGHT SUMMARY ===');
  console.log(`Before click:       ${heightBeforeClick}px`);
  console.log(`Immediately after:  ${immediateData.heightPx}px  (computed: ${immediateData.computedHeight})`);
  console.log(`After 400ms:        ${finalData.heightPx}px  (computed: ${finalData.computedHeight})`);

  const jumpedInstantly = Math.abs(immediateData.heightPx - finalData.heightPx) < 2;
  const heightChanged = Math.abs(finalData.heightPx - heightBeforeClick) > 2;
  console.log(`\nHeight changed at all: ${heightChanged}`);
  console.log(`Height appears to have jumped instantly (no intermediate): ${jumpedInstantly}`);

  // --- Additional diagnostic: check for Vue scoped attribute on pac-modal ---
  const scopedAttrData = await settingsWin.evaluate(() => {
    const modal = document.querySelector('[data-testid="pac-modal"]');
    if (!modal) return null;
    const attrs = Array.from(modal.attributes).map(a => a.name);
    const scopedAttrs = attrs.filter(a => a.startsWith('data-v-'));
    const matchingRules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && rule.selectorText.includes('pac-modal')) {
            matchingRules.push({
              selector:  rule.selectorText,
              styleText: rule.style.cssText,
              sourceHref: sheet.href ?? '(inline)',
            });
          }
        }
      } catch {
        // CORS-blocked sheet — skip
      }
    }
    return { scopedAttrs, matchingRules };
  });

  console.log('\n=== pac-modal SCOPED ATTRIBUTES & MATCHING CSS RULES ===');
  console.log(JSON.stringify(scopedAttrData, null, 2));
});
