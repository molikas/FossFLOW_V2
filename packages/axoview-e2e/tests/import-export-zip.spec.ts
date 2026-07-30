/**
 * import-export-zip.spec.ts — Tier 1 J9 + J10.
 *
 * J9 (per docs/manual-test-baseline.md): import a project ZIP → all
 * diagrams + folders load.
 * J10: export project ZIP → file downloads → can re-import into a clean
 * session.
 *
 * Fixture strategy — programmatic (helpers/projectZip.ts):
 *   - The project-ZIP format is defined by axoview-app (services/project/projectZip.ts),
 *     ADR 0001. Generating in-test keeps the fixture in lockstep with future
 *     format bumps and avoids checking opaque binary into the repo. Tradeoff:
 *     one helper file (~120 LOC) versus one harder-to-evolve .zip blob — the
 *     helper wins for clarity.
 *   - JSZip is hoisted to the repo's root node_modules by workspaces; the
 *     e2e package imports it without adding a local devDependency entry. If
 *     hoisting ever breaks, the import error is immediate and obvious.
 *
 * Import surface for J9 + J10 round-trip:
 *   - Empty-tree Import button fires a native chooser (App.tsx#handleImportClick).
 *   - setInputFiles(zipPath) drives the rest: handleDirectImportFile detects
 *     `.zip` and runs parseProject → importProject({ destination: { kind: 'root' } }).
 *   - Post-import we read sessionStorage `axoview_diagrams` directly to count
 *     the imported diagrams; LocalStorageProvider stores Local-mode diagrams
 *     in sessionStorage (see services/storage/providers/LocalStorageProvider.ts:76).
 *
 * Export surface:
 *   - ExportPopover → "Export Project (.zip)" MenuItem opens
 *     ExportProjectZipDialog (DiagramLifecycleProvider#isProjectExportOpen).
 *   - The dialog's "Download .zip" button (data-axoview-id="dialog-export-project-zip-confirm")
 *     calls downloadBlob synchronously inside handleExport, then closes the
 *     dialog. Test arms `page.waitForEvent('download')` before clicking.
 *
 * Lazy data-axoview-id retrofits this spec (all app-side, hot reload — zero
 * lib rebuild cycles this commit):
 *   - `dialog-export-project-zip-confirm` (ExportProjectZipDialog "Download .zip" button)
 *   - (`toolbar-export-project-zip` already landed in Commit 1 alongside the
 *     ExportPopover edit)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { AppToolbarPOM } from '../pom/AppToolbarPOM';
import { DialogsPOM } from '../pom/DialogsPOM';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { importFileViaDialog } from '../helpers/import';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { getModelItemCount, waitForDebugBridge } from '../helpers/store';
import {
  buildSampleProjectZip,
  parseProjectZip,
  SAMPLE_PROJECT_FIXTURE
} from '../helpers/projectZip';

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open',
  'axoview-folders',
  'axoview-tree-manifest'
];

const SESSION_STORAGE_KEY = 'axoview_diagrams';

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
 * Wipes both local + session storage. Local-mode diagrams live in
 * sessionStorage (LocalStorageProvider#sessionSaveDiagram), so a localStorage-
 * only clear leaves prior-test diagrams behind for the next-test reload.
 * Playwright BrowserContext isolation handles this between tests too, but
 * the J10 round-trip *intentionally* reuses the same context across the
 * import-leg + reimport-leg, so explicit sessionStorage hygiene is the load-
 * bearing path.
 */
async function clearAllStorage(page: import('@playwright/test').Page) {
  await page.evaluate(
    ([localKeys]: [string[]]) => {
      for (const k of localKeys) localStorage.removeItem(k);
      try {
        sessionStorage.clear();
      } catch {
        /* sessionStorage may be locked down */
      }
    },
    [LOCAL_STORAGE_KEYS]
  );
}

const sessionDiagramCount = (page: import('@playwright/test').Page) =>
  page.evaluate((k: string) => {
    const raw = sessionStorage.getItem(k);
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, SESSION_STORAGE_KEY);

const sessionDiagramNames = (page: import('@playwright/test').Page) =>
  page.evaluate((k: string) => {
    const raw = sessionStorage.getItem(k);
    if (!raw) return [] as string[];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((d: any) => d.name) : [];
    } catch {
      return [] as string[];
    }
  }, SESSION_STORAGE_KEY);

async function openElementsPanel(page: import('@playwright/test').Page) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const gridItem = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const gridVisible = await gridItem.isVisible().catch(() => false);
  if (!gridVisible) await elementsToggle.click();
  await gridItem.waitFor({ state: 'visible', timeout: 5_000 });
}

interface CanvasPoint { x: number; y: number; }

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
  await clearAllStorage(page);
  await page.reload();
  const createBtn = byAxoviewId(page, 'screen-empty-create');
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
}

async function importZipFromEmptyState(
  page: import('@playwright/test').Page,
  zipPath: string
) {
  const emptyState = new EmptyStateScreenPOM(page);
  await emptyState.expectVisible();
  // A3/ZIP-09 (owner ruling): one import flow, with the destination named on
  // screen and the import explicitly confirmed.
  await emptyState.clickImport();
  await importFileViaDialog(page, zipPath);
  // The import is async — poll sessionStorage rather than the toast.
  await expect.poll(() => sessionDiagramCount(page), { timeout: 10_000 }).toBeGreaterThan(0);
}

test.describe('Import / Export project ZIP — J9 + J10', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('J9: imports a project ZIP from the empty-state Import button', async ({ page, app }) => {
    void app;
    await clearAllStorage(page);
    await page.reload();

    const { filepath } = await buildSampleProjectZip();
    await importZipFromEmptyState(page, filepath);

    // Expected: 2 diagrams imported (folder "Imports" is recreated server-side,
    // but the diagram count is the load-bearing assertion).
    await expect
      .poll(() => sessionDiagramCount(page), { timeout: 5_000 })
      .toBe(SAMPLE_PROJECT_FIXTURE.diagrams.length);

    // Both fixture names should be present (sessionStorage is the source of
    // truth for the file-explorer tree in Local mode).
    const names = await sessionDiagramNames(page);
    for (const expected of SAMPLE_PROJECT_FIXTURE.diagrams.map((d) => d.name)) {
      expect(names).toContain(expected);
    }
  });

  test('J10: export project ZIP downloads; re-import round-trips into a clean session', async ({ page, app }) => {
    void app;
    await bootBlankDiagram(page);

    // Place 2 icons so the exported project has a non-trivial diagram.
    await placeIcon(page, { x: 380, y: 280 });
    await placeIcon(page, { x: 460, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    // Save first — exportProject reads from storage, so unsaved canvas
    // changes won't make it into the .zip. Ctrl+S is the cheapest path; the
    // hotkeys spec already verifies it persists the snapshot.
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    const toolbar = new AppToolbarPOM(page);
    const dialogs = new DialogsPOM(page);

    // Open the popover, click Project (.zip) — that opens the
    // ExportProjectZipDialog. The dialog isn't a chooser; the download fires
    // when we click its confirm button.
    await toolbar.clickExportProjectZip();
    await dialogs.exportProjectZipConfirmButton().waitFor({ state: 'visible', timeout: 5_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      dialogs.confirmExportProjectZip()
    ]);

    // download.path() returns a UUID-named tempfile WITHOUT the .zip suffix —
    // Playwright preserves bytes, not the original filename. handleDirectImportFile
    // routes by extension (App.tsx#handleDirectImportFile checks `/\.zip$/i`),
    // so re-importing the raw download.path() would mis-route into the JSON
    // branch and surface "That file is not valid JSON." (verified against the
    // first run of this spec). Save the bytes to a `.zip`-suffixed path before
    // we feed the picker.
    const downloadTmp = await download.path();
    expect(downloadTmp).toBeTruthy();
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const exportedZipPath = path.join(
      os.tmpdir(),
      'axoview-e2e-exports',
      download.suggestedFilename()
    );
    fs.mkdirSync(path.dirname(exportedZipPath), { recursive: true });
    fs.copyFileSync(downloadTmp!, exportedZipPath);

    // Inspect the exported zip's manifest — at least one diagram and the
    // canonical PROJECT_FORMAT must be present.
    const { manifest, diagramFiles } = await parseProjectZip(exportedZipPath);
    expect(manifest.format).toBe('axoview-project');
    expect(Array.isArray(manifest.diagrams)).toBe(true);
    expect(manifest.diagrams.length).toBeGreaterThanOrEqual(1);
    expect(diagramFiles.length).toBe(manifest.diagrams.length);

    const exportedDiagramNames: string[] = manifest.diagrams.map((d: any) => d.name);
    const preWipeCount = manifest.diagrams.length;

    // Wipe + reload — fresh empty state. addInitScript runs again on the
    // reload, so the onboarding flags are pinned before the React tree
    // boots; clearAllStorage was already called above, but a defensive
    // re-clear AFTER the reload covers the case where the addInitScript
    // re-set keys we just removed (it pins onboarding flags only — not the
    // diagram-bearing keys — but the assertion below verifies).
    await clearAllStorage(page);
    await page.reload();
    await clearAllStorage(page);
    await page.reload();
    const emptyStateCreate = byAxoviewId(page, 'screen-empty-create');
    await emptyStateCreate.waitFor({ state: 'visible', timeout: 10_000 });

    // Re-import the freshly-exported zip via the empty-state path.
    await importZipFromEmptyState(page, exportedZipPath);

    // Round-trip assertion: every diagram name from the exported manifest is
    // back in sessionStorage. The IDs are re-minted by importProject's
    // rewriteIds, so we match on name, not id.
    await expect
      .poll(() => sessionDiagramCount(page), { timeout: 5_000 })
      .toBe(preWipeCount);
    const reimportedNames = await sessionDiagramNames(page);
    for (const name of exportedDiagramNames) {
      expect(reimportedNames).toContain(name);
    }
  });
});

