/**
 * gpu-icon-recovery.spec.ts — what the node layer does when an icon url fails.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed R3/GPU-01 and
 * GPU-03. `NodesCanvas.getImage` gates an icon on `img.decode()` (the
 * black-atlas-tile prevention), and its rejection path had no `onerror` branch
 * at all: for a load that already errored `complete` is true while
 * `naturalWidth` is 0, so the fallback installed an `onload` handler on an image
 * that would never load again. One dangling reference therefore held
 * `data-all-icons-drawn` at "false" for the whole session (GPU-01), and because
 * the `Image` was cached BEFORE the decode resolved, a transient 503 was cached
 * as permanent — the url was never re-requested even across four further
 * geometry rebuilds (GPU-03).
 *
 * Both cases drive a REAL HTTP failure through `page.route` and assert their
 * preconditions (the store really carries the new url, the request really was
 * made, the layer really rebuilt), so a rig failure cannot read as evidence.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getViewItemCount } from '../helpers/store';

test.describe.configure({ timeout: 120_000 });

const NODES = 'axoview-nodes-canvas';

/** A real 1×1 PNG — the "the server came back" body for the recovery case. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const counters = (page: Page) =>
  page.evaluate((id) => {
    const el = document.querySelector(
      `[data-testid="${id}"]`
    ) as HTMLElement | null;
    return {
      allIconsDrawn: el?.dataset.allIconsDrawn ?? null,
      buildCount: Number(el?.dataset.buildCount ?? -1)
    };
  }, NODES);

const allIconsDrawn = async (page: Page) =>
  (await counters(page)).allIconsDrawn;
const buildCount = async (page: Page) => (await counters(page)).buildCount;

async function seedNode(page: Page) {
  const canvas = new CanvasPOM(page);
  const box = (await canvas.interactionsLayer().boundingBox())!;
  await placeIconViaMouse(page, {
    x: box.width / 2,
    y: box.height / 2
  });
  await expect.poll(() => getViewItemCount(page), { timeout: 10_000 }).toBe(1);
}

/** Repoint the placed node's icon at `url`, reporting whether the store moved. */
const repointIcon = (page: Page, url: string) =>
  page.evaluate((u: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const iconId = m.items[0]?.icon;
    if (!iconId) return { ok: false, reason: 'first model item has no icon ref' };
    const icons = m.icons.map((ic: any) =>
      ic.id === iconId ? { ...ic, url: u } : ic
    );
    m.actions.set({ icons }, true);
    const after =
      bridge.model.getState().icons.find((ic: any) => ic.id === iconId)?.url ??
      null;
    return { ok: after === u, after };
  }, url);

/** Force geometry rebuilds without touching the icon (the GPU-03 oracle). */
async function forceRebuilds(page: Page, times: number) {
  for (let i = 0; i < times; i += 1) {
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setReadableLabels(!ui.readableLabels);
    });
    await page.waitForTimeout(150);
  }
}

test.describe('a broken icon url does not disable the readiness flag (GPU-01)', () => {
  test('one 404 icon still lets data-all-icons-drawn reach "true"', async ({
    page,
    app
  }) => {
    void app;
    const BROKEN = '/wave3-broken-icon.png';
    let requests = 0;
    await page.route(`**${BROKEN}`, (route) => {
      requests += 1;
      return route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'not found'
      });
    });

    await seedNode(page);

    // PRECONDITION: a HEALTHY icon reaches "true", so a "false" later would be
    // the finding rather than a flag that never works.
    await expect
      .poll(() => allIconsDrawn(page), { timeout: 20_000 })
      .toBe('true');
    const buildsBefore = await buildCount(page);

    const moved = await repointIcon(page, BROKEN);
    expect(moved.ok, `icon repoint failed: ${JSON.stringify(moved)}`).toBe(true);

    // PRECONDITION: the layer rebuilt (so it re-ran getImage) and the browser
    // really attempted the load.
    await expect
      .poll(() => buildCount(page), { timeout: 15_000 })
      .toBeGreaterThan(buildsBefore);
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);

    // The fix: the url resolves as UNAVAILABLE rather than staying pending, so
    // the flag comes back. Before this it stayed "false" for the session and
    // every consumer that gates on it — `waitForIconsDrawn`, the image export —
    // waited for a bitmap that was never coming.
    await expect
      .poll(() => allIconsDrawn(page), { timeout: 20_000 })
      .toBe('true');
  });
});

test.describe('a transient icon failure recovers (GPU-03)', () => {
  test('the url is re-requested after the server comes back', async ({
    page,
    app
  }) => {
    void app;
    const FLAKY = '/wave3-flaky-icon.png';
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
      .poll(() => allIconsDrawn(page), { timeout: 20_000 })
      .toBe('true');

    const moved = await repointIcon(page, FLAKY);
    expect(moved.ok, `icon repoint failed: ${JSON.stringify(moved)}`).toBe(true);
    await expect.poll(() => requests, { timeout: 15_000 }).toBeGreaterThan(0);

    const requestsWhileDown = requests;
    serving = 'up';

    // Force geometry rebuilds. Before the fix `iconCacheRef` held the FAILED
    // Image keyed by url, so every later build took the `existing` branch and
    // returned null without going near the network — the request count stayed
    // at 1 across four rebuilds.
    await forceRebuilds(page, 4);

    await expect
      .poll(() => requests, { timeout: 20_000 })
      .toBeGreaterThan(requestsWhileDown);
  });
});
