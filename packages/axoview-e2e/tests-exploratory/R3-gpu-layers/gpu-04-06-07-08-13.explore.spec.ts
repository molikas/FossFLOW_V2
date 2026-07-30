/**
 * R3 probes across all FOUR bulk GPU layers at once. The mapper note for this
 * area says the layers are copy-adapted from one skeleton and "a fix applied to
 * one layer routinely misses the others" — so every probe here sweeps all four
 * rather than sampling one.
 *
 * Oracles (`_rig/glOracles.ts`, built by R2): the read-back pixel count, the
 * `data-build-count` invalidation counter each layer publishes, and the real
 * `WEBGL_lose_context` driver.
 *
 * Rig rules: destructure `app` (the fixture is lazy — a probe that takes only
 * `page` never boots the diagram and every locator times out), and assert the
 * PRECONDITION of each probe (the layer was painting, the mode really switched,
 * the context really was lost) before concluding anything.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import {
  BULK_LAYERS,
  layerSelector,
  paintedPixels,
  countersAll,
  layerCounters,
  loseContext,
  restoreContext,
  isContextLost,
  canvasMode,
  setCanvasMode,
  setZoom
} from '../_rig/glOracles';

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const labelCount = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const ui = bridge.ui.getState();
    const views = bridge.model.getState().views;
    const view = (ui.view && views.find((v: any) => v.id === ui.view)) ?? views[0];
    return (view?.labels ?? []).length;
  });

/**
 * A node plus a committed floating Label, so the Nodes and Labels layers both
 * have work. A freshly placed Label opens an inline edit session — it must be
 * COMMITTED (Enter) before anything is probed, or the label lives in a
 * half-created state (the empty-content lifecycle trap from the I-block).
 */
const seedScene = async (page: import('@playwright/test').Page) => {
  const canvas = new CanvasPOM(page);
  const c = await canvasCentre(canvas);
  await placeIconViaMouse(page, c);
  await expect.poll(() => getViewItemCount(page)).toBe(1);

  await canvas.placeLabelAt({ x: c.x + 140, y: c.y + 90 });
  await expect.poll(() => labelCount(page), { timeout: 5_000 }).toBe(1);
  await page.keyboard.type('Probe');
  await page.keyboard.press('Enter');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__axoview__.ui.getState().inlineEditLabelId
        ),
      { timeout: 5_000 }
    )
    .toBeNull();
  await page.waitForTimeout(500);
  return { canvas, centre: c };
};

// ---------------------------------------------------------------------------
// GPU-07 — context-loss recovery across all four layers
// ---------------------------------------------------------------------------

test.describe('GPU-07 — context loss + restore on every bulk layer', () => {
  test('each of the four canvases recovers, not just NodesCanvas', async ({
    page,
    app
  }) => {
    test.setTimeout(180_000);
    await seedScene(page);

    const results: Record<string, string> = {};
    for (const id of BULK_LAYERS) {
      await expect(page.locator(layerSelector(id))).toBeAttached();

      // PRECONDITION: record what the layer was doing before the loss. A layer
      // with nothing to paint (0 px) is still a valid subject for the RECOVERY
      // question — what must not happen is a painting layer going dark.
      const before = await paintedPixels(page, id);
      expect(before, `${id} read-back oracle`).toBeGreaterThanOrEqual(0);

      const lost = await loseContext(page, id);
      expect(lost, `${id} lose-context`).toBe('lost');
      await expect.poll(() => isContextLost(page, id), { timeout: 5_000 }).toBe(true);

      expect(await restoreContext(page, id)).toBe('restored');
      await expect
        .poll(() => isContextLost(page, id), { timeout: 15_000 })
        .toBe(false);
      await page.waitForTimeout(600);

      const after = await paintedPixels(page, id);
      results[id] = `before=${before} after=${after}`;
    }

    test.info().annotations.push({
      type: 'GPU-07',
      description: JSON.stringify(results)
    });

    // The invariant: no layer that was painting before its context was lost may
    // be blank after the restore.
    for (const id of BULK_LAYERS) {
      const [b, a] = results[id]
        .split(' ')
        .map((kv) => Number(kv.split('=')[1]));
      if (b > 0) expect(a, `${id} went blank after restore (${results[id]})`).toBeGreaterThan(0);
    }
    await expectStoreInvariants(page, 'GPU-07 after four loss/restore cycles');
  });
});

// ---------------------------------------------------------------------------
// GPU-06 — does an iso<->2D switch re-dirty every layer?
// ---------------------------------------------------------------------------

test.describe('GPU-06 — projection switch invalidation across the four layers', () => {
  test('every layer that has geometry rebuilds on an iso<->2D switch', async ({
    page,
    app
  }) => {
    test.setTimeout(120_000);
    await seedScene(page);

    // PRECONDITION: we start in ISOMETRIC and the counters are readable.
    expect(await canvasMode(page)).toBe('ISOMETRIC');
    const before = await countersAll(page);
    for (const id of BULK_LAYERS) {
      expect(before[id].present, `${id} mounted`).toBe(true);
      expect(before[id].buildCount, `${id} publishes data-build-count`).not.toBeNull();
    }

    await setCanvasMode(page, '2D');
    expect(await canvasMode(page)).toBe('2D');
    await page.waitForTimeout(900);

    const after = await countersAll(page);
    const report: string[] = [];
    for (const id of BULK_LAYERS) {
      report.push(
        `${id}: build ${before[id].buildCount} -> ${after[id].buildCount}`
      );
    }
    test.info().annotations.push({
      type: 'GPU-06',
      description: report.join(' | ')
    });

    // PRECONDITION: at least TWO layers must actually have geometry, or a
    // sweep that only exercised one layer would read as "all four are fine".
    const withGeometry = BULK_LAYERS.filter(
      (id) => (before[id].drawCount ?? 0) > 0
    );
    expect(
      withGeometry.length,
      `layers with drawn instances: ${JSON.stringify(
        Object.fromEntries(
          BULK_LAYERS.map((id) => [id, before[id].drawCount])
        )
      )}`
    ).toBeGreaterThanOrEqual(2);

    // A layer with instances MUST re-project. A layer with nothing to draw may
    // legitimately not rebuild, so gate on the layer having drawn something.
    for (const id of withGeometry) {
      expect(
        after[id].buildCount,
        `${id} did not rebuild across the projection switch — ${report.join(' | ')}`
      ).toBeGreaterThan(before[id].buildCount!);
    }
    await expectStoreInvariants(page, 'GPU-06 after projection switch');
  });
});

// ---------------------------------------------------------------------------
// GPU-08 — layer-visibility toggle invalidation
//
// SUPERSEDED: this stub skips because a blank-diagram boot configures no layers.
// `gpu-08-layer-visibility.explore.spec.ts` seeds the layer set through
// `model.actions.set({ views })` and carries the real verdict (FALSIFIED). Kept
// as the record of why the first attempt could not answer the question.
// ---------------------------------------------------------------------------

test.describe('GPU-08 — hiding a layer must repaint every bulk canvas that shows it', () => {
  test('the node layer stops painting when its layer is hidden', async ({
    page,
    app
  }) => {
    test.setTimeout(120_000);
    await seedScene(page);

    const painted = await paintedPixels(page, 'axoview-nodes-canvas');
    // PRECONDITION: the node layer really is painting before the toggle.
    expect(painted).toBeGreaterThan(0);

    const hidden = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const ui = bridge.ui.getState();
      const model = bridge.model.getState();
      const view = model.views.find((v: any) => v.id === ui.view);
      const layers = view?.layers ?? [];
      if (!layers.length) return { ok: false, reason: 'no layers configured' };
      return { ok: true, reason: `${layers.length} layer(s)` };
    });
    test.info().annotations.push({
      type: 'GPU-08',
      description: `layers: ${hidden.reason}`
    });
    // A blank diagram may have no explicit layers at all; in that case the
    // hypothesis has no subject here and the probe says so rather than passing
    // on a vacuous truth.
    test.skip(!hidden.ok, `GPU-08 needs a configured layer (${hidden.reason})`);
  });
});

// ---------------------------------------------------------------------------
// GPU-04 — Label drawn but not grabbable below HIT_MIN_ZOOM
// ---------------------------------------------------------------------------

test.describe('GPU-04 — the draw threshold and the hit threshold disagree', () => {
  test('a floating Label paints below zoom 0.4 while its hit proxy is gone', async ({
    page,
    app
  }) => {
    test.setTimeout(120_000);
    await seedScene(page);

    const hitProxies = () =>
      page.evaluate(
        () => document.querySelectorAll('[data-label-hit-id]').length
      );

    // PRECONDITION: at default zoom the Label both paints AND has a hit proxy.
    // Asserting the proxy count here is what stops the probe reading a wrong
    // selector as "the feature is absent" — a zero below would otherwise look
    // exactly like the finding.
    const paintedHigh = await paintedPixels(page, 'axoview-labels-canvas');
    const proxiesHigh = await hitProxies();
    test.info().annotations.push({
      type: 'GPU-04',
      description: `default zoom: painted=${paintedHigh} proxies=${proxiesHigh}`
    });
    expect(
      paintedHigh,
      'the Label must paint at default zoom'
    ).toBeGreaterThan(0);
    expect(
      proxiesHigh,
      'the [data-label-hit-id] selector must match at default zoom, or a zero below proves nothing'
    ).toBeGreaterThan(0);
    const zoomHigh = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().zoom
    );
    expect(zoomHigh, 'default zoom must be above HIT_MIN_ZOOM').toBeGreaterThanOrEqual(0.4);

    // Below HIT_MIN_ZOOM (0.4) but above nothing in particular for the paint.
    await setZoom(page, 0.3);
    await page.waitForTimeout(700);
    const paintedLow = await paintedPixels(page, 'axoview-labels-canvas');
    const proxiesLow = await hitProxies();
    test.info().annotations.push({
      type: 'GPU-04',
      description: `zoom 0.3: painted=${paintedLow} proxies=${proxiesLow}`
    });

    // The finding: still drawn, no longer hit-testable.
    expect(
      paintedLow,
      `label chip must still paint at zoom 0.3 (painted=${paintedLow})`
    ).toBeGreaterThan(0);
    expect(
      proxiesLow,
      `hit proxies at zoom 0.3 (high=${proxiesHigh} low=${proxiesLow})`
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GPU-13 — cross-layer z-order is fixed by DOM stacking
// ---------------------------------------------------------------------------

// DEDUPE NOTE: `label-entity.spec.ts` already asserts the Labels-after-Nodes
// DOM order for that ONE pair. What is novel here is the four-layer rule and its
// consequence: every bulk canvas shares a single stacking context, so a
// per-element `zIndex` sorts only WITHIN its own canvas and can never lift a
// connector above a node.
test.describe('GPU-13 — per-element zIndex cannot cross a layer boundary', () => {
  test('the four bulk canvases stack by mount order, all at the same zIndex', async ({
    page,
    app
  }) => {
    for (const id of BULK_LAYERS) {
      await expect(page.locator(layerSelector(id))).toBeAttached();
    }
    const order = await page.evaluate((sels: string[]) => {
      const els = sels.map(
        (s) => document.querySelector(s) as HTMLElement | null
      );
      if (els.some((e) => !e)) return null;
      const zs = els.map((e) => getComputedStyle(e!).zIndex);
      // Pairwise: does each layer come BEFORE the next in document order?
      const ascending = els.slice(0, -1).every((e, i) => {
        return (e!.compareDocumentPosition(els[i + 1]!) & 4) !== 0;
      });
      return { zs, ascending };
    }, BULK_LAYERS.map(layerSelector));

    expect(order).not.toBeNull();
    test.info().annotations.push({
      type: 'GPU-13',
      description: `zIndex=${JSON.stringify(order!.zs)} ascending=${order!.ascending}`
    });
    // The consequence: since every canvas carries the same stacking context,
    // ONLY document order decides which entity type paints on top — a per-element
    // zIndex can never lift a connector above a node.
    expect(new Set(order!.zs).size).toBe(1);
    expect(order!.ascending).toBe(true);
  });
});
