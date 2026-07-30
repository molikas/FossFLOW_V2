/**
 * R3 — GPU-02: what does the stranded `data-all-icons-drawn` flag (GPU-01) cost
 * the image export?
 *
 * The hypothesis as filed claimed a "silent minutes-scale regression … twice".
 * `ExportImageDialog` actually bounds both waits — `ICONS_READY_TIMEOUT_MS` 400
 * before the first capture and `ICONS_RECAPTURE_TIMEOUT_MS` 2000 for the
 * recapture poll — so this probe MEASURES the real cost rather than asserting
 * the prediction. It compares a healthy diagram with one whose single icon url
 * 404s, in the same page, so the numbers are comparable.
 *
 * The dialog mounts its OWN hidden Axoview (its own NodesCanvas, its own icon
 * cache), which is what makes the export gate observable at all.
 *
 * RIG TRAP discovered here: `Axoview`'s debug-bridge effect does
 * `delete window.__axoview__` on cleanup, and the export dialog mounts a SECOND
 * Axoview. So closing the dialog deletes the MAIN app's bridge — every later
 * `page.evaluate` through `window.__axoview__` throws. (While the dialog is open,
 * the bridge points at the HIDDEN export instance, not the app.) Hence the
 * ordering below: the store is touched exactly once, before the first open, and
 * the icon is "repaired" by re-routing the url instead — the second dialog mounts
 * a fresh hidden Axoview with a fresh icon cache, so the route decides the
 * outcome without the bridge.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { AppToolbarPOM } from '../../pom/AppToolbarPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { byLibTestId } from '../../helpers/selectors';
import { getViewItemCount } from '../../helpers/store';
import { layerCounters } from '../_rig/glOracles';

const BROKEN = '/explore-probe-export-icon.png';

// A real 1×1 PNG — the "the icon is reachable again" body for the second dialog.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Time from opening the Export-as-image dialog to its first finished export. */
const timeExportDialog = async (page: Page): Promise<number> => {
  const toolbar = new AppToolbarPOM(page);
  const t0 = Date.now();
  await toolbar.clickExportImage();
  await expect(page.getByText('Export as image')).toBeVisible({ timeout: 15_000 });
  // The SVG button is disabled until the first export resolves — the same
  // "dialog finished its first export" signal `import-export-image.spec.ts` uses.
  await expect(byLibTestId(page, 'export-svg-button')).toBeEnabled({
    timeout: 30_000
  });
  return Date.now() - t0;
};

const closeDialog = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(page.getByText('Export as image')).toBeHidden({ timeout: 10_000 });
  await page.waitForTimeout(300);
};

test.describe('GPU-02 — the cost of a stranded icon-readiness flag on export', () => {
  test('a 404 icon delays every export by the bounded gate, and never more', async ({
    page,
    app,
    consoleOracle
  }) => {
    test.setTimeout(180_000);
    consoleOracle.allow(
      /Failed to load resource|explore-probe-export-icon/i,
      'GPU-02 deliberately serves a 404 for the node icon.'
    );
    let serving: 'down' | 'up' = 'down';
    await page.route(`**${BROKEN}`, (route) =>
      serving === 'down'
        ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' })
        : route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: PNG_1PX
          })
    );

    const canvas = new CanvasPOM(page);
    const c = await canvasCentre(canvas);
    await placeIconViaMouse(page, c);
    await expect.poll(() => getViewItemCount(page)).toBe(1);

    // PRECONDITION: the healthy layer reports its icons drawn before anything is
    // broken — proof the flag works here at all.
    await expect
      .poll(async () => (await layerCounters(page, 'axoview-nodes-canvas')).allIconsDrawn, {
        timeout: 15_000
      })
      .toBe('true');

    // The ONLY bridge write in the probe (see the rig-trap note above).
    const moved = await page.evaluate((u: string) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      const iconId = m.items[0]?.icon;
      const icons = m.icons.map((ic: any) =>
        ic.id === iconId ? { ...ic, url: u } : ic
      );
      m.actions.set({ icons }, true);
      return (
        bridge.model.getState().icons.find((ic: any) => ic.id === iconId)?.url ===
        u
      );
    }, BROKEN);
    expect(moved, 'icon repoint failed').toBe(true);
    // PRECONDITION: the main canvas's flag really is stuck (GPU-01) — the hidden
    // export canvas hits the same wall.
    await expect
      .poll(async () => (await layerCounters(page, 'axoview-nodes-canvas')).allIconsDrawn, {
        timeout: 10_000
      })
      .toBe('false');

    const brokenMs = await timeExportDialog(page);
    // The preview must exist even with the icon unreachable — the gate is
    // bounded, not a hang.
    const preview = await page.evaluate(() => {
      const img = Array.from(document.querySelectorAll('img')).find((i) =>
        i.src.startsWith('data:image/png')
      );
      return img ? { present: true, bytes: img.src.length } : { present: false };
    });
    await closeDialog(page);

    // "Repair" the icon by re-routing rather than through the store: the bridge
    // is gone now, and a second dialog mounts a fresh hidden Axoview whose icon
    // cache is empty, so the route alone decides the outcome.
    serving = 'up';
    const healthyMs = await timeExportDialog(page);

    test.info().annotations.push({
      type: 'GPU-02',
      description: `first export: broken=${brokenMs}ms healthy=${healthyMs}ms delta=${brokenMs - healthyMs}ms | broken-icon preview=${JSON.stringify(preview)}`
    });

    expect(preview.present, 'the broken-icon export still produced a PNG preview').toBe(true);
    // The claim under test was "minutes-scale, twice". Both waits are bounded by
    // 400 + 2000 ms, so the delta must stay well inside a few seconds — anything
    // beyond that would be the filed prediction, and this is the assertion that
    // would catch it.
    expect(
      brokenMs - healthyMs,
      `broken-icon export overhead (healthy=${healthyMs}ms broken=${brokenMs}ms)`
    ).toBeLessThan(10_000);
    await closeDialog(page);
  });
});
