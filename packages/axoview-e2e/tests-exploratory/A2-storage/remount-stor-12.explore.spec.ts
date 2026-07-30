/**
 * A2/STOR-12 (browser half) — does an in-app route change remount `EditorPage`?
 *
 * `App.tsx` renders `<EditorPage />` as the element of `/`, `/display/p/:uuid`,
 * `/display/drive/:fileId` and `/display/:id`. If react-router reconciles those
 * four into ONE mounted instance, the STOR-12 desync (React `activeProviderId`
 * resetting to 'local' while the module-level `StorageManager` still routes to
 * Drive) and A1/LIFE-05 (the unmount cleanup dropping a queued autosave) are
 * both unreachable by navigating. If it remounts, both are live.
 *
 * COLDSTART rule: ask the browser, don't read the router's source.
 *
 * The observable is `fileExplorerOpen` — React state inside
 * `DiagramLifecycleProvider` whose initialiser effect is ref-guarded
 * (`explorerInitializedRef`), so it runs exactly once per MOUNT and forces the
 * panel closed in session mode. Open it, navigate away and back: still open
 * means one instance survived; closed again means a fresh mount.
 */
import { exploreTest as test, expect } from '../../fixtures/explore.fixture';
import { FileExplorerPOM } from '../../pom/FileExplorerPOM';

test.describe('A2/STOR-12 — EditorPage identity across an in-app route change', () => {
  test('characterization: a /display round trip remounts the editor tree', async ({
    page,
    app,
    consoleOracle
  }) => {
    void app;
    // The readonly loader fails for an id the session place does not hold; that
    // is the route working, not a finding.
    consoleOracle.allow(/Failed to/i, 'expected: /display with no backing diagram');

    const explorer = new FileExplorerPOM(page);
    await explorer.toggleButton().click();
    // PRECONDITION: the panel really is open before we navigate. A selector
    // matching nothing would read exactly like "it closed again".
    await expect(explorer.panelRoot().first()).toBeVisible({ timeout: 10_000 });

    const editorUrl = page.url();
    await page.goto('/app/display/no-such-diagram');
    await page.waitForLoadState('domcontentloaded');
    await page.goBack();
    await expect(page).toHaveURL(editorUrl);
    // Wait for the editor surface to be back before reading the panel.
    await expect(explorer.toggleButton()).toBeVisible({ timeout: 10_000 });

    const stillOpen = await explorer
      .panelRoot()
      .first()
      .isVisible()
      .catch(() => false);
    // eslint-disable-next-line no-console
    console.log(`[STOR-12] explorer still open after the round trip: ${stillOpen}`);

    // A closed panel means the ref-guarded initialiser ran again, i.e. a fresh
    // mount of DiagramLifecycleProvider (and of AppStorageProvider above it).
    expect(stillOpen).toBe(false);
  });
});
