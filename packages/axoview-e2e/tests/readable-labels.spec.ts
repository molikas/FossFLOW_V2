/**
 * readable-labels.spec.ts — Thread E (ADR 0015).
 *
 * The "keep labels readable" toggle (the "Aa" button in ZoomControls) is an
 * opt-in that counter-scales node name labels up to a legible floor below a
 * zoom threshold, so text stays readable when zoomed out. Off by default;
 * persisted across reload; label-only (node geometry untouched).
 *
 * Asserts:
 *   - the toggle flips uiState.readableLabels and persists across a reload;
 *   - with it ON, a real node label's --axoview-label-scale counter-scale rises
 *     above 1 at low zoom; with it OFF the label scales normally (factor 1).
 */
import path from 'path';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { importFileViaDialog } from '../helpers/import';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { waitForDebugBridge } from '../helpers/store';

type Page = import('@playwright/test').Page;

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

const FIXTURE_JSON = path.join(__dirname, '..', 'fixtures', 'sample-diagram.json');

async function pinOnboardingDismissed(page: Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function clearDiagramStorage(page: Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

const getReadableLabels = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!(window as any).__axoview__.ui.getState().readableLabels);

const setZoom = (page: Page, zoom: number): Promise<void> =>
  page.evaluate((z: number) => {
    (window as any).__axoview__.ui.getState().actions.setZoom(z);
  }, zoom);

/**
 * The applied label counter-scale, read renderer-agnostically.
 *
 * DOM renderer: the resolved `--axoview-label-scale` on the first node label's
 * wrapper (unchanged — flag-off behaviour is identical).
 *
 * Canvas renderer (T2 node-layer hybrid): no per-node DOM label exists, so read
 * `data-label-scale` off the `<canvas>` — the exact value NodesCanvas feeds to
 * `ctx.scale` when drawing labels (published each draw). Same feature, same
 * `computeLabelCounterScale` output; only the observation surface differs.
 */
const getLabelScale = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const label = document.querySelector('[data-testid="node-label"]');
    if (label) {
      const wrapper = label.firstElementChild ?? label;
      const raw = getComputedStyle(wrapper).getPropertyValue(
        '--axoview-label-scale'
      );
      return parseFloat(raw) || 1;
    }
    const canvas = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    );
    if (canvas) {
      return parseFloat(canvas.getAttribute('data-label-scale') ?? '') || 1;
    }
    return NaN;
  });

async function importSampleDiagram(page: Page) {
  await clearDiagramStorage(page);
  await page.reload();
  const emptyState = new EmptyStateScreenPOM(page);
  await emptyState.expectVisible();
  // A3/ZIP-09 (owner ruling 2026-07-30): one import flow — the Import
  // button opens `ImportDialog` for an empty tree as much as a populated
  // one, and the import is confirmed with its destination on screen.
  await emptyState.clickImport();
  await importFileViaDialog(page, FIXTURE_JSON);
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
  // Named items (Alpha/Beta) render node labels — as DOM in the default
  // renderer, or as canvas pixels under the T2 node-layer flag. Wait for
  // whichever surface this run uses so the label-scale read below has a target.
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible' });
  await page
    .locator(
      '[data-testid="node-label"], [data-testid="axoview-scene-canvas"]'
    )
    .first()
    .waitFor({ state: 'attached', timeout: 10_000 });
}

test.describe('Readable labels — Thread E (ADR 0015)', () => {
  test.beforeEach(async ({ page, app }) => {
    void app;
    await pinOnboardingDismissed(page);
  });

  test('the Aa toggle flips readableLabels and persists across reload', async ({
    page
  }) => {
    await importSampleDiagram(page);

    // Off by default.
    expect(await getReadableLabels(page)).toBe(false);

    const toggle = byAxoviewId(page, 'canvas-readable-labels');
    await toggle.click();
    await expect.poll(() => getReadableLabels(page), { timeout: 3_000 }).toBe(true);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Persists across reload (written to axoview_user_settings).
    await page.reload();
    await waitForDebugBridge(page);
    expect(await getReadableLabels(page)).toBe(true);

    // Toggling off persists too.
    const toggleAfter = byAxoviewId(page, 'canvas-readable-labels');
    await toggleAfter.click();
    await expect.poll(() => getReadableLabels(page), { timeout: 3_000 }).toBe(false);
  });

  test('counter-scales a node label at low zoom only when the toggle is on', async ({
    page
  }) => {
    await importSampleDiagram(page);

    // Low zoom: 14px base * 0.4 = 5.6px on-screen, below the 11px floor.
    await setZoom(page, 0.4);

    // Off → no counter-scale (factor 1).
    await expect.poll(() => getLabelScale(page), { timeout: 3_000 }).toBeCloseTo(1, 2);

    // On → label counter-scales up (≈ 11 / 5.6 ≈ 1.96).
    await byAxoviewId(page, 'canvas-readable-labels').click();
    await expect
      .poll(() => getLabelScale(page), { timeout: 3_000 })
      .toBeGreaterThan(1.5);

    // Off again → back to 1.
    await byAxoviewId(page, 'canvas-readable-labels').click();
    await expect.poll(() => getLabelScale(page), { timeout: 3_000 }).toBeCloseTo(1, 2);
  });
});
