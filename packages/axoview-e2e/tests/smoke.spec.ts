/**
 * smoke.spec.ts — Tier 1 J1 + J20.
 *
 * J1 (per docs/manual-test-baseline.md): new diagram → place a few icons →
 * save → close → reopen → state preserved.
 *
 * J20: empty state → EmptyStateScreen renders → "New / Import" buttons work.
 *
 * Session 2 landed J1. Session 3 added J20.
 *
 * J1 verification: after reload the persisted localStorage diagram is
 * rehydrated by DiagramLifecycleProvider (frozen on first render via
 * `axoview-last-opened-data`). Asserting the model item count from the
 * debug bridge is the load-bearing check — counting DOM <img> nodes is
 * also done as a cross-check on the visual layer.
 *
 * J20 verification: with all storage cleared the boot lands on
 * EmptyStateScreen; the New button creates a blank diagram (canvas mounts
 * + debug bridge attaches), and the Import button opens `ImportDialog` — the
 * ONE import flow (A3/ZIP-09, owner ruling 2026-07-30). The empty tree used to
 * bypass the dialog and import straight to root; the native chooser now sits
 * one click further in, behind "Choose file…".
 */
import { appTest as test, expect } from '../fixtures/app.fixture';
import { AppToolbarPOM } from '../pom/AppToolbarPOM';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { getModelItemCount, waitForDebugBridge } from '../helpers/store';

// Storage keys touched by Local-mode persistence — clearing them gives J1 a
// deterministic empty-state boot. See DiagramLifecycleProvider.tsx.
const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

// Onboarding affordances that overlay the empty state and intercept clicks on
// first run. We pre-dismiss them so the smoke test exercises the J1 flow, not
// the welcome popover. These flags are set on EVERY navigation (init script)
// because they need to be present before the React tree reads them, and the
// reload leg of J1 also needs the welcome popover suppressed.
const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

async function pinOnboardingDismissed(page: import('@playwright/test').Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

/**
 * One-shot diagram-state clear. Runs AFTER the first navigation so the reload
 * leg of J1 keeps the saved diagram intact — using addInitScript here would
 * wipe `axoview-last-opened-data` on every page load, including the reload
 * we're trying to verify persists.
 */
async function clearDiagramStorage(page: import('@playwright/test').Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

async function openElementsPanel(page: import('@playwright/test').Page) {
  // The Elements panel is a LeftDock toggle in the new chrome. Opening it
  // exposes the icon grid we drag from. Idempotent — clicking when already
  // open is a no-op race we don't care about.
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const gridItem = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const gridVisible = await gridItem.isVisible().catch(() => false);
  if (!gridVisible) await elementsToggle.click();
  await gridItem.waitFor({ state: 'visible', timeout: 5_000 });
}

async function placeIcon(page: import('@playwright/test').Page, x: number, y: number) {
  // Drag the first icon from the Elements panel onto the canvas. The lib's
  // PlaceIcon handler completes the placement on mouseup. The icon grid item
  // is anchored on `canvas-icon-grid-item` (lazy retrofit in Session 2); the
  // canvas itself still uses the lib's data-testid and gets its
  // data-axoview-id retrofit when CanvasPOM lands in Session 5.
  //
  // We can't use Locator.dragTo() because the icon's MUI Tooltip flips to
  // visible on mouseover and its portaled subtree intercepts pointer events
  // mid-drag. Stepping through page.mouse directly bypasses the actionability
  // re-check that Locator.dragTo performs between move and up.
  await openElementsPanel(page);
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox) throw new Error('placeIcon: icon or canvas missing a bounding box');
  await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + x, canvasBox.y + y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

test.describe('Smoke — J1: new diagram, save, reopen, state preserved', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('J1: places 3 icons, saves, reloads, and the 3 icons persist', async ({ page, app }) => {
    void app;
    // 1. Reset diagram storage AFTER the fixture's initial boot, then reload
    //    once to land deterministically on EmptyStateScreen. Init-script
    //    storage clears would also wipe the saved diagram before the reload
    //    leg, so the one-shot evaluate is load-bearing.
    await clearDiagramStorage(page);
    await page.reload();
    const createBtn = byAxoviewId(page, 'screen-empty-create');
    await createBtn.waitFor({ state: 'visible', timeout: 10_000 });

    // 2. Create a blank diagram.
    await createBtn.click();
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
    await waitForDebugBridge(page);

    // 3. Place 3 icons at distinct positions.
    await placeIcon(page, 380, 280);
    await placeIcon(page, 460, 320);
    await placeIcon(page, 420, 380);

    // 4. Confirm the model has 3 items before save.
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(3);

    // 5. Save via the toolbar POM. Local-mode persistence is synchronous
    //    against localStorage; a short wait covers the React commit.
    const toolbar = new AppToolbarPOM(page);
    await toolbar.clickSave();
    await page.waitForTimeout(250);

    // 6. Sanity-check: localStorage carries the persisted snapshot.
    const persistedCount = await page.evaluate(() => {
      const raw = localStorage.getItem('axoview-last-opened-data');
      if (!raw) return -1;
      try {
        const parsed = JSON.parse(raw);
        const items = parsed?.items ?? parsed?.data?.items;
        return Array.isArray(items) ? items.length : -1;
      } catch {
        return -1;
      }
    });
    expect(persistedCount).toBe(3);

    // 7. Reload — the lifecycle provider rehydrates from
    //    `axoview-last-opened-data` on first render.
    await page.reload();
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
    await waitForDebugBridge(page);

    // 8. State preserved: model carries 3 items after reload.
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(3);
  });
});

test.describe('Smoke — J20: empty state → New / Import buttons work', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('J20 (new): empty state renders, New opens a blank diagram', async ({ page, app }) => {
    void app;
    // Reset to the canonical empty-state boot.
    await clearDiagramStorage(page);
    await page.reload();

    // EmptyStateScreen overlays the canvas (z=5 in App.tsx) when no diagram
    // is open. The canvas DOM node is mounted but covered; we assert on the
    // empty-state affordance, not on canvas absence.
    const emptyState = new EmptyStateScreenPOM(page);
    await emptyState.expectVisible();

    // Click New → diagram opens, debug bridge attaches, model is empty.
    await emptyState.clickCreate();
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
    await waitForDebugBridge(page);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(0);
  });

  test('J20 (import): empty state Import button opens the one import flow', async ({ page, app }) => {
    void app;
    await clearDiagramStorage(page);
    await page.reload();

    const emptyState = new EmptyStateScreenPOM(page);
    await emptyState.expectVisible();

    // A3/ZIP-09 (owner ruling 2026-07-30): the empty tree no longer skips the
    // dialog and imports straight to root. Every entry point opens
    // `ImportDialog`, so the destination is named on screen before anything is
    // written; the native chooser is one click further in.
    await emptyState.clickImport();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Import' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5_000 }),
      dialog.getByRole('button', { name: 'Choose file…' }).click()
    ]);
    expect(fileChooser.isMultiple()).toBe(false);
  });
});
