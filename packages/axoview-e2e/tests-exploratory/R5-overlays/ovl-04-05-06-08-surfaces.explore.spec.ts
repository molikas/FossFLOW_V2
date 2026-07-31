/**
 * R5 — OVL-04, OVL-05, OVL-06, OVL-08: the non-label DOM overlays.
 *
 * OVL-04/05 — `Grid` is a SECOND projection implementation (CSS
 *   `background-size` / `background-position` math) that must stay in lock-step
 *   with `getTilePosition`. It re-derives only inside its own store subscriber
 *   (scroll/zoom) and on a `useResizeObserver` size change — and that observer
 *   is handed `elementRef.current`, which is `null` on the first render. It also
 *   sizes itself from the ELEMENT (`clientWidth`) while every GL layer sizes
 *   from the store's `rendererSize`: two sources for one number.
 *
 * OVL-06 — `LabelHitLayer` deliberately mounts hover-only proxies in
 *   `EXPLORABLE_READONLY`; `NodeLabelHitLayer` gates on `EDITABLE`, so a node's
 *   NAME chip has no proxy at all in present mode.
 *
 * OVL-08 — `CanvasCompositorOverlay` is an empirically-found Chrome compositing
 *   workaround with no assertion anywhere. Pin its three load-bearing
 *   properties: mounted, pointer-transparent, stacked above the bulk canvases.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';

const GRID = '[data-testid="axoview-canvas"] [style*="background"]';
// BOTH hit layers publish `data-axoview-id="canvas-label-hit"` AND
// `data-label-hit-id` — NodeLabelHitLayer keys the latter by NODE id and
// LabelHitLayer by LABEL id, so the only way to tell the two apart is the id
// itself. (Counting the bare attribute conflates them; that is what made the
// first run of this probe read 2 where it expected 1.)
const proxyFor = (id: string) => `[data-label-hit-id="${id}"]`;
const COMPOSITOR = '[data-axoview-id="canvas-compositor-overlay"]';
const NODES_CANVAS = '[data-testid="axoview-nodes-canvas"]';
const RECTS_CANVAS = '[data-testid="axoview-rectangles-canvas"]';

/**
 * The grid's live CSS background numbers plus the two candidate size sources —
 * its own element box and the store's rendererSize — read in one round trip.
 */
const gridState = (page: Page) =>
  page.evaluate(() => {
    // The grid is the only element inside the renderer whose background is the
    // repeated tile SVG.
    const el = Array.from(
      document.querySelectorAll('[data-testid="axoview-canvas"] div')
    ).find((d) =>
      getComputedStyle(d as HTMLElement).backgroundImage.includes('url(')
    ) as HTMLElement | undefined;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const ui = (window as any).__axoview__.ui.getState();
    const num = (s: string) => s.split(' ').map((p) => parseFloat(p));
    return {
      position: num(cs.backgroundPosition),
      size: num(cs.backgroundSize),
      elW: el.clientWidth,
      elH: el.clientHeight,
      storeW: ui.rendererSize.width,
      storeH: ui.rendererSize.height,
      scroll: { x: ui.scroll.position.x, y: ui.scroll.position.y },
      zoom: ui.zoom,
      canvasMode: ui.canvasMode
    };
  });

/** Where the grid SHOULD be, recomputed from Grid.tsx's own formula. */
const expectedIsoPosition = (g: NonNullable<Awaited<ReturnType<typeof gridState>>>, w: number, h: number) => {
  // PROJECTED_TILE_SIZE = 100 * {1.415, 0.819}
  const tileW = 100 * 1.415 * g.zoom;
  return { x: w / 2 + g.scroll.x + tileW / 2, y: h / 2 + g.scroll.y };
};

test.describe('OVL-04/OVL-05 — the grid is a second, independently-sized projection', () => {
  test('CONTROL: at boot the grid phase matches its own formula', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const g = await gridState(page);
    expect(g, 'PRECONDITION: the grid element was found').not.toBeNull();
    expect(g!.canvasMode).toBe('ISOMETRIC');
    const want = expectedIsoPosition(g!, g!.elW, g!.elH);
    expect(g!.position[0]).toBeCloseTo(want.x, 0);
    expect(g!.position[1]).toBeCloseTo(want.y, 0);
  });

  test('after a viewport resize with no pan, is the grid re-derived?', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const before = await gridState(page);
    expect(before, 'PRECONDITION: the grid element was found').not.toBeNull();

    await page.setViewportSize({ width: 1000, height: 700 });
    // Long enough for a ResizeObserver + React commit, and NO scroll/zoom write.
    await page.waitForTimeout(1500);

    const after = await gridState(page);
    expect(
      after!.elW,
      'PRECONDITION: the grid element really did resize'
    ).not.toBe(before!.elW);
    expect(after!.scroll, 'PRECONDITION: nothing panned').toEqual(before!.scroll);
    expect(after!.zoom).toBe(before!.zoom);

    const want = expectedIsoPosition(after!, after!.elW, after!.elH);
    // Characterization: does the live background match the live element size?
    expect(after!.position[0]).toBeCloseTo(want.x, 0);
    expect(after!.position[1]).toBeCloseTo(want.y, 0);
  });

  test('the grid sizes itself from its own element while the GL layers use the store', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(1200);
    const g = await gridState(page);
    // Characterization: the two candidate sources for the SAME centre.
    expect(g!.elW).toBeGreaterThan(0);
    expect(g!.storeW).toBeGreaterThan(0);
    // If these ever diverge the grid and the GL scene disagree about the centre
    // by half the difference.
    expect(Math.abs(g!.elW - g!.storeW)).toBeLessThanOrEqual(1);
    expect(Math.abs(g!.elH - g!.storeH)).toBeLessThanOrEqual(1);
  });

  test('and the grid phase tracks a real node across pan and zoom', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
    await expect.poll(() => getViewItemCount(page), { timeout: 8_000 }).toBe(1);

    // Offset (grid phase − tile-(0,0) screen x) / tile width must be the SAME
    // constant at every zoom; a drift means the two projections are out of
    // lock-step rather than merely shifted.
    const ratios: number[] = [];
    for (const z of [1, 0.75, 0.5, 0.37]) {
      await page.evaluate(
        (v: number) =>
          (window as any).__axoview__.ui.getState().actions.setZoom(v),
        z
      );
      await page.waitForTimeout(400);
      const g = await gridState(page);
      const nodeScreenX = g!.elW / 2 + g!.scroll.x;
      ratios.push((g!.position[0] - nodeScreenX) / g!.size[0]);
    }
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 3);
  });
});

// ---------------------------------------------------------------------------
// OVL-06 — no node-name proxy in present mode
// ---------------------------------------------------------------------------

const setEditorMode = (page: Page, mode: string) =>
  page.evaluate(
    (m: string) =>
      (window as any).__axoview__.ui.getState().actions.setEditorMode(m),
    mode
  );

const nameFirstItem = (page: Page, name: string) =>
  page.evaluate((n: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const view = m.views.find((v: any) => v.id === viewId);
    const id = view.items[0].id;
    m.actions.set(
      {
        items: m.items.map((i: any) =>
          i.id === id ? { ...i, name: n, label: n, headerLink: 'https://x.test' } : i
        )
      },
      true
    );
    return bridge.model.getState().items.find((i: any) => i.id === id)?.name;
  }, name);

/** Place a node and a floating Label; return both entity ids. */
async function setupNodeAndLabel(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: -2, y: 0 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 8_000 }).toBe(1);
  expect(await nameFirstItem(page, 'Linked Node')).toBe('Linked Node');

  await canvas.placeLabelAt(await canvas.tileToScreen({ x: 3, y: 0 }));
  await page.waitForTimeout(500);
  await page.keyboard.type('Legend');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });
  await page.waitForTimeout(700);

  const ids = await page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const v = bridge.model.getState().views.find((x: any) => x.id === viewId);
    return {
      nodeId: (v?.items ?? [])[0]?.id ?? null,
      labelId: (v?.labels ?? [])[0]?.id ?? null
    };
  });
  expect(ids.nodeId, 'PRECONDITION: a node exists').toBeTruthy();
  expect(ids.labelId, 'PRECONDITION: a floating Label exists').toBeTruthy();
  return ids as { nodeId: string; labelId: string };
}
// ---------------------------------------------------------------------------
// OVL-08 — the compositing workaround's contract
// ---------------------------------------------------------------------------

test.describe('OVL-08 — CanvasCompositorOverlay contract', () => {
  test('mounted, pointer-transparent, and above every bulk canvas', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    await expect(page.locator(COMPOSITOR)).toHaveCount(1);

    const inert = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      const svg = el.querySelector('svg') as SVGElement;
      return {
        outer: getComputedStyle(el).pointerEvents,
        inner: getComputedStyle(svg).pointerEvents,
        ariaHidden: el.getAttribute('aria-hidden')
      };
    }, COMPOSITOR);
    expect(inert.outer).toBe('none');
    expect(inert.inner).toBe('none');
    expect(inert.ariaHidden).not.toBeNull();

    // Paint order, asked of the browser (R4's stackOrder rig): force
    // pointer-events on for the measurement only, and validate with a control
    // pair whose order is fixed by mount order.
    const order = await page.evaluate(
      (sels: string[]) => {
        const saved: Array<[HTMLElement, string]> = [];
        const force = (el: Element | null, v: string) => {
          if (!el) return;
          const h = el as HTMLElement;
          saved.push([h, h.style.pointerEvents]);
          h.style.pointerEvents = v;
        };
        force(
          document.querySelector('[data-axoview-id="canvas-interactions"]'),
          'none'
        );
        sels.forEach((s) => force(document.querySelector(s), 'auto'));
        const stack = document.elementsFromPoint(
          window.innerWidth / 2,
          window.innerHeight / 2
        );
        const out = sels.map((s) =>
          stack.findIndex((el) => el.matches(s) || Boolean(el.closest(s)))
        );
        saved.forEach(([el, v]) => {
          el.style.pointerEvents = v;
        });
        return out;
      },
      [COMPOSITOR, NODES_CANVAS, RECTS_CANVAS]
    );
    expect(order.every((i) => i >= 0), `stack was ${order}`).toBe(true);
    // CONTROL: nodes canvas above rectangles canvas (Renderer mount order).
    expect(order[1]).toBeLessThan(order[2]);
    // The contract: the overlay is above the whole bulk.
    expect(order[0]).toBeLessThan(order[1]);
  });

  test('it survives a switch into present mode (where docks still toggle)', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    await expect(page.locator(COMPOSITOR)).toHaveCount(1);
    await setEditorMode(page, 'EXPLORABLE_READONLY');
    await page.waitForTimeout(700);
    await expect(page.locator(COMPOSITOR)).toHaveCount(1);
  });
});
