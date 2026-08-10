/**
 * import-error.spec.ts — ADR 0011 failure-of-intent (Import).
 *
 * Closes the Import leg of the deferred E2E coverage from PR #9/#10 5e.
 *
 * Flow: the empty-tree Import affordance fires a native file chooser
 * (App.tsx handleImportClick → importFileInputRef.click → handleDirectImportFile).
 * Feeding a malformed-JSON file makes parseJsonOrThrow throw, which the
 * handler's catch converts into the explicit ImportErrorDialog (replacing the
 * pre-ADR-0011 notificationStore toast). Dismiss closes the dialog and leaves
 * the tree empty — no phantom diagram is created.
 *
 * Anchors stamped alongside this spec (app-side, no lib rebuild):
 *   - dialog-import-error          (ImportErrorDialog Dialog paper)
 *   - dialog-import-error-dismiss  (ImportErrorDialog OK Button)
 */
import path from 'path';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { DialogsPOM } from '../pom/DialogsPOM';
import { EmptyStateScreenPOM } from '../pom/EmptyStateScreenPOM';
import { chooseImportFile } from '../helpers/import';

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

const INVALID_JSON = path.join(__dirname, '..', 'fixtures', 'invalid-diagram.json');

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

test.describe('Import error — ADR 0011 failure-of-intent (Import)', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('a malformed-JSON import surfaces ImportErrorDialog; dismiss leaves the tree empty', async ({ page, app }) => {
    void app;
    await clearDiagramStorage(page);
    await page.reload();

    const emptyState = new EmptyStateScreenPOM(page);
    await emptyState.expectVisible();

    // A3/ZIP-09 (owner ruling): the Import button opens the one import flow,
    // which surfaces a file it cannot READ through the same ADR 0011 dialog.
    await emptyState.clickImport();
    await chooseImportFile(page, INVALID_JSON);

    const dialogs = new DialogsPOM(page);
    await dialogs.importError().waitFor({ state: 'visible', timeout: 10_000 });
    await expect(dialogs.importError()).toContainText("Couldn't import.");
    await expect(dialogs.importError()).toContainText('valid Axoview diagram');

    await dialogs.dismissImportError();
    await expect(dialogs.importError()).toHaveCount(0);

    // State recovered: no diagram was created, so the empty-state screen
    // is still the active surface.
    await emptyState.expectVisible(5_000);
  });
});
