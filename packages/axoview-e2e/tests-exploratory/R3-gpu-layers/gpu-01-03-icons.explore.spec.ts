/**
 * R3 — the NodesCanvas icon pipeline (GPU-01, GPU-03).
 *
 * `NodesCanvas.getImage` gates an icon on `img.decode()` (the black-atlas-tile
 * prevention). Its rejection path is:
 *
 *     .catch(() => {
 *       if (img.complete && img.naturalWidth > 0) markReady();
 *       else img.onload = markReady;          // <- for a FAILED load
 *     });
 *
 * There is no `onerror` branch at all, and for a load that already errored
 * `complete` is true while `naturalWidth` is 0 — so the fallback installs an
 * `onload` handler on an image that will never load again. Both probes here
 * drive that path with a real HTTP failure through `page.route`, and both assert
 * their PRECONDITIONS (the url really changed in the store, the request really
 * was made, the layer really rebuilt) so a rig failure can't read as evidence.
 *
 * Oracle: `data-all-icons-drawn`, which NodesCanvas publishes per build and the
 * image-export readiness gate (`waitForIconsDrawn`) polls.
 */
import {
  exploreTest as test,
  expect,
  expectModelHealthy
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { layerCounters, paintedPixels } from '../_rig/glOracles';

const NODES = 'axoview-nodes-canvas';

// A real 1×1 PNG — the "the server came back" body for the GPU-03 retry probe.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** One node with a real icon, waited until the layer reports every icon drawn. */
const seedNode = async (page: Page) => {
  const canvas = new CanvasPOM(page);
  const c = await canvasCentre(canvas);
  await placeIconViaMouse(page, c);
  await expect.poll(() => getViewItemCount(page)).toBe(1);
  return c;
};

const allIconsDrawn = async (page: Page) =>
  (await layerCounters(page, NODES)).allIconsDrawn;

const buildCount = async (page: Page) =>
  (await layerCounters(page, NODES)).buildCount ?? -1;

/**
 * Repoint the placed node's icon at `url`. Returns the ids/urls involved so the
 * caller can assert the store really moved (a silent no-op here would make the
 * rest of the probe measure nothing).
 */
const repointIcon = (page: Page, url: string) =>
  page.evaluate((u: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const iconId = m.items[0]?.icon;
    if (!iconId) return { ok: false, reason: 'first model item has no icon ref' };
    const before = m.icons.find((ic: any) => ic.id === iconId)?.url ?? null;
    const icons = m.icons.map((ic: any) =>
      ic.id === iconId ? { ...ic, url: u } : ic
    );
    m.actions.set({ icons }, true);
    const after =
      bridge.model
        .getState()
        .icons.find((ic: any) => ic.id === iconId)?.url ?? null;
    return { ok: after === u, iconId, before, after };
  }, url);

// ---------------------------------------------------------------------------
// GPU-01 — a broken icon url strands `data-all-icons-drawn` at "false" forever
// ---------------------------------------------------------------------------

test.describe('GPU-01 — the decode() fallback has no onerror path', () => {
  test('one 404 icon leaves data-all-icons-drawn="false" permanently', async ({
    page,
    app,
    consoleOracle
  }) => {
    test.setTimeout(120_000);
    // The probe deliberately serves a 404 for an <img> — the browser is right to
    // log it, and it is the stimulus, not a finding.
    consoleOracle.allow(
      /Failed to load resource|explore-probe-broken-icon/i,
      'GPU-01 deliberately serves a 404 for the node icon.'
    );

    const BROKEN = '/explore-probe-broken-icon.png';
    let brokenRequests = 0;
    await page.route(`**${BROKEN}`, (route) => {
      brokenRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'not found'
      });
    });

    await seedNode(page);

    // PRECONDITION 1: with a HEALTHY icon the layer reaches "true" — so a
    // "false" later is the finding and not simply a flag that never works.
    await expect
      .poll(() => allIconsDrawn(page), { timeout: 15_000 })
      .toBe('true');
    const paintedHealthy = await paintedPixels(page, NODES);
    expect(paintedHealthy, 'the node layer must be painting').toBeGreaterThan(0);
    const buildsBefore = await buildCount(page);

    // Break it.
    const moved = await repointIcon(page, BROKEN);
    // PRECONDITION 2: the store really carries the broken url now.
    expect(moved.ok, `icon repoint failed: ${JSON.stringify(moved)}`).toBe(true);
    expect(moved.after).toBe(BROKEN);

    // PRECONDITION 3: the layer rebuilt (so it re-ran getImage) and the browser
    // really attempted the load.
    await expect
      .poll(() => buildCount(page), { timeout: 10_000 })
      .toBeGreaterThan(buildsBefore);
    await expect.poll(() => brokenRequests, { timeout: 10_000 }).toBeGreaterThan(0);

    // The finding: the flag never comes back. 8 s is 20× the export dialog's
    // initial icons-ready budget (400 ms) and 4× its recapture budget (2000 ms).
    await page.waitForTimeout(8_000);
    const flag = await allIconsDrawn(page);
    const paintedBroken = await paintedPixels(page, NODES);
    test.info().annotations.push({
      type: 'GPU-01',
      description: `requests=${brokenRequests} allIconsDrawn=${flag} painted healthy=${paintedHealthy} broken=${paintedBroken} builds ${buildsBefore}->${await buildCount(page)}`
    });

    expect(
      flag,
      `data-all-icons-drawn after 8 s on a 404 icon (requests=${brokenRequests})`
    ).toBe('false');
    // …and the icon is simply absent from the frame: fewer painted pixels than
    // the healthy build (the chip/stalk still draw, so this is not 0).
    expect(paintedBroken).toBeLessThan(paintedHealthy);

    await expectModelHealthy(page, 'GPU-01 after a broken icon url');
  });
});

// ---------------------------------------------------------------------------
// GPU-03 — a transient failure is cached as a permanent one; nothing retries
// ---------------------------------------------------------------------------

test.describe('GPU-03 — the icon cache holds the failed Image forever', () => {
  test('the url is never re-requested after the server recovers', async ({
    page,
    app,
    consoleOracle
  }) => {
    test.setTimeout(120_000);
    consoleOracle.allow(
      /Failed to load resource|explore-probe-flaky-icon/i,
      'GPU-03 deliberately fails the first icon request, then recovers.'
    );

    const FLAKY = '/explore-probe-flaky-icon.png';
    let serving: 'down' | 'up' = 'down';
    let requests = 0;
    await page.route(`**${FLAKY}`, (route) => {
      requests += 1;
      if (serving === 'down') {
        return route.fulfill({
          status: 503,
          contentType: 'text/plain',
          body: 'temporarily unavailable'
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG_1PX
      });
    });

    await seedNode(page);
    await expect
      .poll(() => allIconsDrawn(page), { timeout: 15_000 })
      .toBe('true');

    const moved = await repointIcon(page, FLAKY);
    expect(moved.ok, `icon repoint failed: ${JSON.stringify(moved)}`).toBe(true);

    // PRECONDITION: the failing load really happened, exactly once.
    await expect.poll(() => requests, { timeout: 10_000 }).toBe(1);
    await expect
      .poll(() => allIconsDrawn(page), { timeout: 10_000 })
      .toBe('false');

    // The server comes back. Now force the layer to rebuild several times over —
    // a projection switch and two readableLabels toggles all set geomDirty, so
    // buildInstances (and therefore getImage) runs again for this url.
    serving = 'up';
    const buildsBefore = await buildCount(page);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setCanvasMode('2D');
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setCanvasMode('ISOMETRIC');
    });
    await page.waitForTimeout(400);
    for (const on of [true, false]) {
      await page.evaluate((v: boolean) => {
        const ui = (window as any).__axoview__.ui.getState();
        ui.actions.setReadableLabels?.(v);
      }, on);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(2_000);

    const buildsAfter = await buildCount(page);
    // PRECONDITION: geometry really was rebuilt at least twice — otherwise
    // "no retry" would just mean "nothing asked".
    expect(
      buildsAfter,
      `the layer must have rebuilt (builds ${buildsBefore} -> ${buildsAfter})`
    ).toBeGreaterThanOrEqual(buildsBefore + 2);

    test.info().annotations.push({
      type: 'GPU-03',
      description: `requests=${requests} allIconsDrawn=${await allIconsDrawn(page)} builds ${buildsBefore}->${buildsAfter}`
    });

    // The finding: `iconCacheRef` already holds the failed Image keyed by url, so
    // every later build takes the `existing` branch and returns null. The healthy
    // server is never asked again and the icon can only recover on a remount.
    expect(
      requests,
      'the recovered url was re-requested — the cache does retry'
    ).toBe(1);
    expect(await allIconsDrawn(page)).toBe('false');

    await expectModelHealthy(page, 'GPU-03 after the server recovered');
  });
});
