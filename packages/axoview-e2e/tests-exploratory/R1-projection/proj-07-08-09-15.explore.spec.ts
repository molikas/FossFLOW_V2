/**
 * R1 probes that need the real browser: the wheel handler (PROJ-08 / PROJ-09),
 * the iso<->2D residual carry (PROJ-07), and the browser's own verdict on the
 * exponent-notation CSS length PROJ-15 found arithmetically.
 *
 * Rig rules (COLDSTART): every `test.fail` is paired with a passing
 * characterization that pins the observed numbers, and each probe asserts its
 * PRECONDITION first — that the pointer really is over the panel, that the drag
 * really committed an offset, that the canvas mode really switched. CI is
 * pixel-blind, so every oracle here is geometry the app itself computes
 * (`window.__axoview__`, `CanvasPOM.tileToScreen`, `getComputedStyle`).
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { byAxoviewId } from '../../helpers/selectors';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint
} from '../../helpers/offGrid';
import { getZoom, getScroll } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const canvasMode = (page: Page): Promise<string> =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().canvasMode);

const setCanvasMode = (page: Page, mode: 'ISOMETRIC' | '2D') =>
  page.evaluate(
    (m) => (window as any).__axoview__.ui.getState().actions.setCanvasMode(m),
    mode
  );

/** The tile the app itself would resolve for a client point (its own math). */
const tileAtClientPoint = (page: Page, p: { x: number; y: number }) =>
  page.evaluate((pt: { x: number; y: number }) => {
    const ui = (window as any).__axoview__.ui.getState();
    const box = document.querySelector(
      '[data-axoview-id="canvas-interactions"]'
    ) as HTMLElement;
    const rect = box.getBoundingClientRect();
    const mouse = { x: pt.x - rect.left, y: pt.y - rect.top };
    const UNPROJ = 100;
    const iso = ui.canvasMode !== '2D';
    const zoom = ui.zoom;
    const size = ui.rendererSize;
    const scroll = ui.scroll.position;
    const relX = -size.width * 0.5 + mouse.x - scroll.x;
    const relY = -size.height * 0.5 + mouse.y - scroll.y;
    if (!iso) {
      const t = UNPROJ * zoom;
      return {
        x: Math.floor((relX + t / 2) / t),
        y: Math.floor((-relY + t / 2) / t) || 0
      };
    }
    const w = UNPROJ * 1.415 * zoom;
    const h = UNPROJ * 0.819 * zoom;
    return {
      x: Math.floor((relX + w / 2) / w - relY / h),
      y: -Math.floor((relY + h / 2) / h + relX / w) || 0
    };
  }, p);

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

// ---------------------------------------------------------------------------
// PROJ-08 — the wheel handler never asks whether the event was on the canvas
// ---------------------------------------------------------------------------

/**
 * Find a client point that is (a) NOT the interactions layer per
 * `document.elementFromPoint` — the only correct on-canvas test (TCH-05,
 * CTX-01) — but (b) IS inside the renderer element's bounding rect, which is
 * the element the wheel listener is bound to. Returns null when no such point
 * exists, which is itself the answer for this hypothesis.
 */
const findPanelPointInsideRenderer = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector(
      '[data-axoview-id="canvas-interactions"]'
    ) as HTMLElement | null;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    for (let x = Math.round(r.left) + 20; x < r.left + 460; x += 20) {
      for (let y = Math.round(r.top) + 140; y < r.bottom - 140; y += 20) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (el.closest('[data-axoview-id="canvas-interactions"]')) continue;
        // Inside the renderer's rect by construction of the loop bounds.
        return { x, y, tag: el.tagName, id: (el as HTMLElement).dataset?.axoviewId ?? null };
      }
    }
    return null;
  });

test.describe('PROJ-08 — mouse wheel over a left-dock panel', () => {
  test('characterization: the open Elements panel sits inside the renderer rect', async ({
    page,
    app
  }) => {
    await byAxoviewId(page, 'dock-elements-toggle').click();
    await page.waitForTimeout(300);
    const point = await findPanelPointInsideRenderer(page);
    // PRECONDITION: such a point exists at all. If it does not, the hypothesis
    // is dead on arrival and the probe says so instead of guessing.
    expect(point, 'a non-canvas point inside the renderer rect').not.toBeNull();
    test.info().annotations.push({
      type: 'PROJ-08',
      description: `panel point ${JSON.stringify(point)}`
    });
  });

  // VERDICT: FALSIFIED. Standing thread B does not reproduce here — the wheel
  // listener is bound to the renderer ELEMENT, and DOM containment (not rect
  // overlap) decides delivery. The left dock overlaps the renderer's rect but
  // is not its descendant, so the wheel never reaches `onScroll`.
  test('a wheel over the open Elements panel does NOT zoom the canvas', async ({
    page,
    app
  }) => {
    await byAxoviewId(page, 'dock-elements-toggle').click();
    await page.waitForTimeout(300);
    const point = await findPanelPointInsideRenderer(page);
    // PRECONDITION: the point really is over the panel and inside the rect.
    expect(point).not.toBeNull();

    const before = await getZoom(page);
    expect(before).toBeGreaterThan(0);
    await page.mouse.move(point!.x, point!.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
    expect(await getZoom(page)).toBe(before);

    // CONTROL: the same wheel gesture on the canvas DOES zoom — so the probe
    // is measuring dock-scoping, not a dead wheel handler.
    const canvas = new CanvasPOM(page);
    const { box } = await canvasCentre(canvas);
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
    expect(await getZoom(page)).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// PROJ-09 — wheel zoom-to-cursor anchoring
// ---------------------------------------------------------------------------

test.describe('PROJ-09 — wheel zoom keeps the point under the cursor fixed', () => {
  test('an off-centre wheel zoom keeps the same tile under the cursor', async ({
    page,
    app
  }) => {
    const canvas = new CanvasPOM(page);
    const { box } = await canvasCentre(canvas);
    // Deliberately off-centre, and clear of the docks.
    const point = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.3 };

    // PRECONDITION: zoom-to-cursor is on, and the probe point is on the canvas.
    const zoomToCursor = await page.evaluate(
      () =>
        (window as any).__axoview__.ui.getState().zoomSettings?.zoomToCursor ??
        null
    );
    expect(zoomToCursor).toBe(true);
    const onCanvas = await page.evaluate(
      (p: { x: number; y: number }) =>
        !!document
          .elementFromPoint(p.x, p.y)
          ?.closest('[data-axoview-id="canvas-interactions"]'),
      point
    );
    expect(onCanvas).toBe(true);

    const tileBefore = await tileAtClientPoint(page, point);
    const zoomBefore = await getZoom(page);

    await page.mouse.move(point.x, point.y);
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 120); // zoom OUT (deltaY > 0)
      await page.waitForTimeout(60);
    }

    const zoomAfter = await getZoom(page);
    // PRECONDITION: the wheel actually moved the zoom (else the probe proves
    // nothing about anchoring).
    expect(zoomAfter).toBeLessThan(zoomBefore);

    const tileAfter = await tileAtClientPoint(page, point);
    expect(tileAfter).toEqual(tileBefore);
  });

  test('and the scroll really moved, so the anchoring is doing work', async ({
    page,
    app
  }) => {
    const canvas = new CanvasPOM(page);
    const { box } = await canvasCentre(canvas);
    const point = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.3 };
    const before = await getScroll(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(200);
    const after = await getScroll(page);
    expect(after.position).not.toEqual(before.position);
  });
});

// ---------------------------------------------------------------------------
// PROJ-07 — the off-grid residual is carried verbatim across an iso<->2D switch
// ---------------------------------------------------------------------------

test.describe('PROJ-07 — off-grid residual across a projection switch', () => {
  test('a residual inside the ISO diamond survives the switch unprojected', async ({
    page,
    app
  }) => {
    test.setTimeout(90_000);
    const canvas = new CanvasPOM(page);
    await setSnapToGrid(page, false);
    const { x: cx, y: cy } = await canvasCentre(canvas);
    await placeIconViaMouse(page, { x: cx, y: cy });

    const placed = await getOffGridItems(page);
    expect(placed).toHaveLength(1);
    const id = placed[0].id;
    expect(await canvasMode(page)).toBe('ISOMETRIC');

    // Aim ONE real drag at a target residual of (58, 0) SceneLayer px: inside
    // the ISO tile diamond (58/70.75 = 0.82 < 1, and the y term is 0), outside
    // the 2D tile square (58 > 50). The screen delta is derived from the live
    // zoom and the residual the placement already left, so the release lands in
    // the SAME tile and the residual is the whole of the movement.
    const zoom = await getZoom(page);
    expect(zoom).toBeGreaterThan(0);
    const TARGET = { x: 58, y: 0 };
    const start = placed[0];
    const startOffset = start.offset ?? { x: 0, y: 0 };
    const dx = Math.round((TARGET.x - startOffset.x) * zoom);
    const dy = Math.round((TARGET.y - startOffset.y) * zoom);

    const from = await drawnClientPoint(page, start);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    // PRECONDITION (the rig rule that cost five wrong I-block verdicts): the
    // gesture really entered the drag mode. Without this a no-op drag would
    // read as "the residual never escapes the cell".
    await expect
      .poll(
        async () =>
          ((await page.evaluate(
            () => (window as any).__axoview__.ui.getState().mode
          )) as { type?: string })?.type ?? null,
        { timeout: 3_000 }
      )
      .toBe('DRAG_ITEMS');
    await page.mouse.up();
    await page.waitForTimeout(250);

    const seen: string[] = [];
    let best: { ox: number; oy: number; tile: { x: number; y: number } } | null =
      null;
    const after = (await getOffGridItems(page)).find((it) => it.id === id)!;
    if (after.offset) {
      const { x: ox, y: oy } = after.offset;
      seen.push(`(${ox.toFixed(1)},${oy.toFixed(1)})@${after.tile.x},${after.tile.y}`);
      const insideIso = Math.abs(ox) / 70.75 + Math.abs(oy) / 40.95 <= 1;
      const inside2D = Math.abs(ox) <= 50 && Math.abs(oy) <= 50;
      if (insideIso && !inside2D) best = { ox, oy, tile: after.tile };
    }

    const trace = `zoom=${zoom} delta=(${dx},${dy}) startOffset=(${startOffset.x},${startOffset.y}) residuals=[${seen.join(' ')}]`;
    test.info().annotations.push({ type: 'PROJ-07', description: trace });

    // PRECONDITION: the drags really landed and committed residuals.
    expect(seen.length, `no residual was ever committed — ${trace}`).toBeGreaterThan(0);

    // THE CORE CLAIM, asserted before anything that might not hold: the
    // residual is a post-projection px value and is carried verbatim across
    // the projection swap rather than re-projected for the new tile geometry.
    const isoItem = (await getOffGridItems(page)).find((it) => it.id === id)!;
    expect(isoItem.offset).toBeTruthy();
    await setCanvasMode(page, '2D');
    expect(await canvasMode(page)).toBe('2D');

    const twoDItem = (await getOffGridItems(page)).find((it) => it.id === id)!;
    expect(twoDItem.offset).toEqual(isoItem.offset);
    expect(twoDItem.tile).toEqual(isoItem.tile);

    await expectStoreInvariants(page, 'PROJ-07 after mode switch');

    // CONSEQUENCE, reported rather than assumed: is a residual that fits inside
    // the ISO diamond ever outside the 2D tile square? The failure message
    // carries every residual the search actually observed, so the row records
    // real numbers either way.
    expect(
      best,
      `no residual inside the ISO diamond escaped the 2D tile square — ${trace}`
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PROJ-15 (browser half) — does Chrome really reject the exponent length?
// ---------------------------------------------------------------------------

test.describe('PROJ-15 — exponent-notation CSS length in the drag transform', () => {
  test('Chromium ACCEPTS the exponent form — the arithmetic finding is inert', async ({
    page,
    app
  }) => {
    const result = await page.evaluate(() => {
      const mk = (v: string) => {
        const el = document.createElement('div');
        el.style.setProperty('--ff-drag-dx', '25px');
        el.style.setProperty('--ff-drag-dy', '0px');
        el.style.transform = `translate3d(calc(var(--ff-drag-dx, 0px) + ${v}), calc(var(--ff-drag-dy, 0px) + 0px), 0)`;
        document.body.appendChild(el);
        const computed = getComputedStyle(el).transform;
        const inline = el.style.transform;
        el.remove();
        return { computed, inline };
      };
      return {
        good: mk('12.5px'),
        exponent: mk(String(4.547473508864641e-13) + 'px'),
        infinite: mk(String(Infinity) + 'px')
      };
    });

    // NOTE: a declaration containing `var()` is stored as an unresolved token
    // stream, so `el.style.transform` ALWAYS round-trips whatever was assigned
    // — validity is only decided at computed-value time. The computed value is
    // therefore the only oracle here.
    // PRECONDITION: a well-formed residual composes with the live drag var.
    expect(result.good.computed).toBe('matrix(1, 0, 0, 1, 37.5, 0)');

    // The exponent form is ACCEPTED — CSS Values 4 allows scientific notation
    // and Chromium implements it. The transform survives, the live drag var
    // still applies (25px), and the sub-picometre residual is invisible.
    expect(result.exponent.computed).toBe('matrix(1, 0, 0, 1, 25, 0)');

    // `Infinity` (reachable only through an unvalidated imported model — the
    // already-filed CLIP-14/15 class) is the one input that is NOT accepted.
    expect(result.infinite.computed).not.toContain('25');
    test.info().annotations.push({
      type: 'PROJ-15',
      description: `computed: good=${result.good.computed} exponent=${result.exponent.computed} infinite=${result.infinite.computed}`
    });
  });
});
