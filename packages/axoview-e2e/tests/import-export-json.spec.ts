/**
 * import-export-json.spec.ts — Tier 1 J7 + J8.
 *
 * J7 (per docs/manual-test-baseline.md): import a JSON diagram → renders
 * correctly.
 * J8: export current diagram as JSON → file downloads → contents look right.
 *
 * Import path:
 *   - The fixture is `fixtures/sample-diagram.json` (static — see Session 4
 *     actual-vs-estimate note for the static-vs-programmatic rationale).
 *   - We use the empty-state Import affordance — when the file tree is empty
 *     App.tsx#handleImportClick fires `importFileInputRef.current.click()`
 *     directly, opening a native file picker (NOT the in-tree ImportDialog).
 *     `setInputFiles` on the chooser drives the rest: handleDirectImportFile
 *     parses the JSON, calls storage.createDiagram, then openDiagramById —
 *     the canvas mounts with the imported diagram on the active view.
 *   - Assertions read the model + view via the debug bridge, identical to
 *     the smoke/connector specs.
 *
 * Export path:
 *   - exportAsJSON (lib/utils/exportOptions.ts) creates a Blob and triggers
 *     `<a download>`. Playwright surfaces that via `page.waitForEvent('download')`.
 *   - We read `download.path()` to load the file from disk and JSON.parse it.
 *   - Round-trip assertion: the exported JSON's view items + connector count
 *     match what we placed before export.
 *
 * Lazy data-axoview-id retrofits this spec (all app-side, hot reload — no
 * lib rebuild required):
 *   - `toolbar-export`             (ExportPopover IconButton)
 *   - `toolbar-export-json`        (Export JSON MenuItem)
 *   - `toolbar-export-project-zip` (Export Project MenuItem — for J10 in
 *     import-export-zip.spec.ts; co-located so the ExportPopover edit is
 *     one commit, not two)
 */
import path from 'path';
import fs from 'fs';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { AppToolbarPOM } from '../pom/AppToolbarPOM';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { importFileViaDialog } from '../helpers/import';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import {
  getModelConnectorCount,
  getModelItemCount,
  getViewItemCount,
  waitForDebugBridge
} from '../helpers/store';

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

async function pinOnboardingDismissed(page: import('@playwright/test').Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function clearDiagramStorage(page: import('@playwright/test').Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

async function openElementsPanel(page: import('@playwright/test').Page) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const gridItem = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const gridVisible = await gridItem.isVisible().catch(() => false);
  if (!gridVisible) await elementsToggle.click();
  await gridItem.waitFor({ state: 'visible', timeout: 5_000 });
}

interface CanvasPoint {
  x: number;
  y: number;
}

async function placeIcon(
  page: import('@playwright/test').Page,
  point: CanvasPoint
) {
  await openElementsPanel(page);
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox) throw new Error('placeIcon: missing bounding box');
  await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + point.x, canvasBox.y + point.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function bootBlankDiagram(page: import('@playwright/test').Page) {
  await clearDiagramStorage(page);
  await page.reload();
  const createBtn = byAxoviewId(page, 'screen-empty-create');
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
}

test.describe('Import / Export JSON — J7 + J8', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('J7: imports a JSON diagram from the empty-state Import button', async ({ page, app }) => {
    void app;
    await clearDiagramStorage(page);
    await page.reload();

    const emptyState = new EmptyStateScreenPOM(page);
    await emptyState.expectVisible();

    // A3/ZIP-09 (owner ruling): one import flow — the Import button opens
    // `ImportDialog` for an empty tree as much as a populated one, and the
    // import is explicitly confirmed with its destination on screen.
    await emptyState.clickImport();
    await importFileViaDialog(page, FIXTURE_JSON);

    // The dialog's single-JSON path creates the diagram and opens it, which
    // mounts the canvas with the imported model on the active view.
    await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
    await waitForDebugBridge(page);

    // Fixture: 2 model items + 1 connector on the single view.
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);
    await expect.poll(() => getModelConnectorCount(page), { timeout: 5_000 }).toBe(1);
  });

  test('J8: exports the current diagram as JSON; file downloads round-trip', async ({ page, app }) => {
    void app;
    await bootBlankDiagram(page);

    // Place 2 icons so the exported JSON has a non-trivial item count.
    await placeIcon(page, { x: 380, y: 280 });
    await placeIcon(page, { x: 460, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    const toolbar = new AppToolbarPOM(page);

    // Arm the download listener BEFORE the click — exportAsJSON dispatches
    // the `<a download>` click synchronously inside the MenuItem onClick.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      toolbar.clickExportJson()
    ]);

    // Filename follows generateTitleFilename(model.title, 'json'). Lib code
    // tolerates either '.json' or '.compact.json' suffixes (see leanSave),
    // so we only assert the JSON extension is present.
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const raw = fs.readFileSync(downloadPath!, 'utf8');
    const parsed = JSON.parse(raw);

    // Shape sanity — exportAsJSON writes the lean model (stripDefaultIcons).
    // The bundled-fixtures array is currently empty (see lib/fixtures/icons.ts),
    // so `icons` survives intact, but we assert only the structural keys the
    // ADR-0001-adjacent JSON shape guarantees: items + views.
    expect(parsed).toHaveProperty('items');
    expect(parsed).toHaveProperty('views');
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(Array.isArray(parsed.views)).toBe(true);

    // Round-trip cardinality: 2 model items, 2 view items, 0 connectors.
    expect(parsed.items.length).toBe(2);
    expect(parsed.views.length).toBeGreaterThanOrEqual(1);
    const firstView = parsed.views[0];
    expect(firstView.items?.length).toBe(2);
    // Placed icons via the elements panel don't draw connectors — sanity
    // check that the exported view's connectors array (if present) is empty.
    expect(firstView.connectors?.length ?? 0).toBe(0);
  });
});
