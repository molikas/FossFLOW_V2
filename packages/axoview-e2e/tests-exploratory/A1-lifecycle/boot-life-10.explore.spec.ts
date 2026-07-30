/**
 * A1/LIFE-10 — boot with a corrupted session list.
 *
 * `DiagramLifecycleProvider`'s mount effect restores the session diagram list:
 *
 *   const savedDiagrams = localStorage.getItem('axoview-diagrams');
 *   if (savedDiagrams) {
 *     setDiagrams(JSON.parse(savedDiagrams));   // <- OUTSIDE the try/catch
 *     setIsDiagramsInitialized(true);
 *   }
 *   const lastOpenedId = localStorage.getItem('axoview-last-opened');
 *   if (lastOpenedId && savedDiagrams) {
 *     try { JSON.parse(savedDiagrams) ... } catch (e) { console.error(...) }
 *   }
 *
 * The SECOND parse of the same string is guarded and the first is not. Closes
 * the coverage-baseline gap "Boot with a corrupted localStorage session
 * (recovery path)".
 *
 * Deliberately does NOT use the explore fixture: the fixture waits for the app
 * to become ready and would turn a boot failure into a fixture timeout rather
 * than evidence. Raw Playwright, own oracles.
 */
import { test, expect, Page } from '@playwright/test';

const ONBOARDING: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

/** Seeds localStorage pre-navigation and captures every uncaught page error. */
async function bootWith(page: Page, diagramsValue: string) {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript(
    ({ flags, diagrams }: { flags: Array<[string, string]>; diagrams: string }) => {
      try {
        for (const [k, v] of flags) localStorage.setItem(k, v);
        localStorage.setItem('axoview-diagrams', diagrams);
        localStorage.removeItem('axoview-last-opened');
        localStorage.removeItem('axoview-last-opened-data');
      } catch {
        /* localStorage unavailable pre-navigation */
      }
    },
    { flags: ONBOARDING, diagrams: diagramsValue }
  );
  await page.goto('/app');
  return pageErrors;
}

const appReady = (page: Page) =>
  Promise.race([
    page.locator('[data-axoview-id="screen-empty-create"]').waitFor({ state: 'visible', timeout: 8_000 }),
    page.locator('[data-testid="axoview-canvas"]').waitFor({ state: 'visible', timeout: 8_000 })
  ]);

const errorScreen = (page: Page) => page.getByText('Something went wrong!');

test.describe('A1/LIFE-10 — a corrupt axoview-diagrams value at boot', () => {
  test('control: a WELL-FORMED session list boots to the app', async ({ page }) => {
    // The control matters: if the app failed to boot for an unrelated reason
    // (dev server, seeding), the corrupt-value probe below would "confirm" a
    // bug it never demonstrated.
    const errs = await bootWith(page, JSON.stringify([]));
    await appReady(page);
    await expect(errorScreen(page)).toHaveCount(0);
    expect(errs).toEqual([]);
  });

  test('characterization: a corrupt value replaces the app with the crash screen', async ({ page }) => {
    await bootWith(page, '{"items": [');

    // PRECONDITION: this is the ErrorBoundary fallback, not a blank page —
    // and the message names the parse that threw.
    await expect(errorScreen(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/JSON/i).first()).toBeVisible();

    // The editor never mounted.
    await expect(page.locator('[data-axoview-id="screen-empty-create"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="axoview-canvas"]')).toHaveCount(0);
  });

  test('characterization: the corrupt value survives, so a reload crashes again', async ({ page }) => {
    await bootWith(page, '{"items": [');
    await expect(errorScreen(page)).toBeVisible({ timeout: 10_000 });

    // The boot path that DOES guard its parse (`axoview-last-opened-data`)
    // removes the bad key on the way out; this one does not, so the user's
    // instinctive refresh lands on the same screen forever.
    const stillThere = await page.evaluate(() =>
      localStorage.getItem('axoview-diagrams')
    );
    expect(stillThere).toBe('{"items": [');

    await page.reload();
    await expect(errorScreen(page)).toBeVisible({ timeout: 10_000 });
  });

  test.fail('LIFE-10: a corrupt session list is discarded and the app boots', async ({ page }) => {
    await bootWith(page, '{"items": [');
    // Expected: the same recovery the sibling parse already performs — warn,
    // drop the key, boot empty. Actual: the unguarded `JSON.parse` throws
    // inside the mount effect and the ErrorBoundary eats the whole app.
    await appReady(page);
  });
});
