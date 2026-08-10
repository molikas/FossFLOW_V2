/**
 * canvas-node-render.spec — the canvas renderer's "render == the rest of the app"
 * invariant (the canvas-pixel guard the prior reviews asked for; none existed).
 *
 * ADR 0019 made a Canvas2D layer the production node renderer. The DOM hybrid
 * overlay (used for the selected/dragged node), hit-testing, drag preview,
 * connectors and lasso all place a node at the SAME spot; the canvas must paint
 * it there too. The PoC drew each sprite with its top-LEFT at the tile anchor,
 * offsetting every isometric/2D icon by ~half a sprite — invisible to the
 * store/DOM-only "13/13 gate" because no spec read canvas pixels.
 *
 * Core invariant: selecting a node must NOT move it. We capture the canvas icon's
 * pixel centroid while the node is canvas-drawn, then select it (so the DOM
 * overlay renders the same node) and read the DOM icon's box centre; the two must
 * coincide. The bug makes them differ by ~half a sprite. Also asserts render ==
 * hit-test: a click on the drawn icon selects that node. Runs in ISO and 2D.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';

type Page = import('@playwright/test').Page;
type Pt = { x: number; y: number };

// Full-bleed square sprite — its pixel centroid is the sprite centre, so an
// anchor error surfaces directly as a centroid offset.
const FULL_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%235b8def'/></svg>";

async function commitSingleNode(page: Page, isometric: boolean) {
  await page.evaluate(
    ({ url, iso }) => {
      const ax = (window as any).__axoview__;
      const m = ax.model.getState();
      const ui = ax.ui.getState();
      const view =
        (ui.view && m.views.find((v: any) => v.id === ui.view)) || m.views[0];
      const icon = { id: 'tIcon', name: 'i', url, collection: 'imported', isIsometric: iso };
      const item = { id: 'tn', name: '', icon: 'tIcon' }; // no name → no label chip
      const vitem = { id: 'tn', tile: { x: 0, y: 0 } };
      const views = m.views.map((v: any) =>
        v.id === view.id
          ? { ...v, items: [vitem], connectors: [], rectangles: [], textBoxes: [] }
          : v
      );
      m.actions.set({ items: [item], icons: [icon], colors: [], views }, true);
      ax.ui.getState().actions.setItemControls(null);
    },
    { url: FULL_ICON, iso: isometric }
  );
}

const setSelected = (page: Page, id: string | null) =>
  page.evaluate((nodeId) => {
    const a = (window as any).__axoview__.ui.getState().actions;
    a.setItemControls(nodeId ? { type: 'ITEM', id: nodeId } : null);
  }, id);

/**
 * Promote a node into the DOM `<Node>` overlay.
 *
 * R4/RND-13/15: SELECTION no longer promotes — that lift was the accidental
 * "bring to front" the entry filed, and with one merged bulk canvas (ADR 0038
 * §8) a promoted element can only paint above or below the whole canvas. The
 * rename session is the promotion now. These specs use the overlay purely as the
 * placement SOURCE OF TRUTH (where does the DOM put this icon?), so the route
 * into it is rig detail; what they assert is unchanged.
 */
const setPromoted = (page: Page, id: string | null) =>
  page.evaluate((nodeId) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setInlineEditNodeId(nodeId);
  }, id);

const selectedId = (page: Page) =>
  page.evaluate(() => {
    const ic = (window as any).__axoview__.ui.getState().itemControls;
    return ic && ic.type === 'ITEM' ? ic.id : null;
  });

/** Centre of the DOM overlay icon <img> for a node (selected → rendered as DOM). */
const domIconCentre = (page: Page, id: string): Promise<Pt | null> =>
  page.evaluate((nodeId) => {
    const img = document.querySelector(
      `[data-drag-id="${nodeId}"] img`
    ) as HTMLElement | null;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);

/** Centroid (CSS px) of non-transparent canvas pixels within `half` of `pt`. */
const canvasCentroid = (page: Page, pt: Pt, half: number) =>
  page.evaluate(
    ({ x, y, half }) => {
      const cv = document.querySelector(
        '[data-testid="axoview-scene-canvas"]'
      ) as HTMLCanvasElement | null;
      if (!cv) return null;
      const rect = cv.getBoundingClientRect();
      const sx = cv.width / rect.width;
      const sy = cv.height / rect.height;
      const x0 = Math.max(0, Math.round((x - rect.left - half) * sx));
      const y0 = Math.max(0, Math.round((y - rect.top - half) * sy));
      const w = Math.min(cv.width - x0, Math.round(half * 2 * sx));
      const h = Math.min(cv.height - y0, Math.round(half * 2 * sy));
      if (w <= 0 || h <= 0) return null;
      // The node canvas is WebGL2 (preserveDrawingBuffer:true), so getContext('2d')
      // returns null. Read its pixels via drawImage onto a scratch 2D canvas —
      // substrate-agnostic (works for a Canvas2D layer too).
      const scratch = document.createElement('canvas');
      scratch.width = w;
      scratch.height = h;
      const s2d = scratch.getContext('2d')!;
      s2d.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
      const data = s2d.getImageData(0, 0, w, h).data;
      let sX = 0;
      let sY = 0;
      let n = 0;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (data[(j * w + i) * 4 + 3] > 20) {
            sX += i;
            sY += j;
            n += 1;
          }
        }
      }
      if (!n) return null;
      return { x: rect.left + (x0 + sX / n) / sx, y: rect.top + (y0 + sY / n) / sy, n };
    },
    { x: pt.x, y: pt.y, half }
  );

test.describe('Canvas node render — render == DOM/hit-test (ADR 0019)', () => {
  for (const mode of ['ISOMETRIC', '2D'] as const) {
    test(`${mode}: selecting must not move the node, and a click on the icon selects it`, async ({
      page,
      app
    }) => {
      void app;
      if (mode === '2D') {
        await page.evaluate(() =>
          (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
        );
      }
      await commitSingleNode(page, mode === 'ISOMETRIC');

      // The DOM overlay is the placement source of truth. Read where it renders
      // the icon, then un-promote so the canvas paints the same node.
      await setPromoted(page, 'tn');
      const dom = await page
        .locator('[data-drag-id="tn"] img')
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => domIconCentre(page, 'tn'));
      expect(dom, 'DOM overlay icon rendered').not.toBeNull();

      await setPromoted(page, null);
      // Wait for the icon (async data-URI decode) to actually paint on the canvas.
      await expect
        .poll(async () => (await canvasCentroid(page, dom!, 160))?.n ?? 0, {
          timeout: 5_000
        })
        .toBeGreaterThan(50);
      const cv = await canvasCentroid(page, dom!, 160);

      // INVARIANT: the canvas paints the icon where the DOM put it (≤ a few px).
      // The top-left-anchor bug offset this by ~half a sprite (~40–80 px).
      const drift = Math.hypot(cv!.x - dom!.x, cv!.y - dom!.y);
      expect(
        drift,
        `canvas centroid (${cv!.x.toFixed(1)},${cv!.y.toFixed(
          1
        )}) vs DOM icon centre (${dom!.x.toFixed(1)},${dom!.y.toFixed(1)})`
      ).toBeLessThan(6);

      // Render == hit-test: a click on the drawn icon selects THIS node.
      await page.mouse.click(dom!.x, dom!.y);
      await expect.poll(() => selectedId(page), { timeout: 3_000 }).toBe('tn');
    });
  }

  // D2-1: the canvas must paint the dotted label stalk (it previously drew none,
  // so at-rest nodes showed no stalk and selecting one popped it in via the DOM
  // overlay). Assert BLACK pixels (the stalk) exist in the gap between the icon
  // top and the chip bottom, at the node's x — the blue icon there is not black,
  // so black pixels in that gap are the stalk.
  test('ISOMETRIC: a labelled node paints its dotted label stalk on the canvas', async ({
    page,
    app
  }) => {
    void app;
    await page.evaluate(
      ({ url }) => {
        const ax = (window as any).__axoview__;
        const m = ax.model.getState();
        const ui = ax.ui.getState();
        const view =
          (ui.view && m.views.find((v: any) => v.id === ui.view)) ||
          m.views[0];
        const icon = {
          id: 'tIcon',
          name: 'i',
          url,
          collection: 'imported',
          isIsometric: true
        };
        const item = { id: 'sn', name: 'Stalk', icon: 'tIcon' };
        // Tall stalk → a clear icon↔chip gap to sample.
        const vitem = { id: 'sn', tile: { x: 0, y: 0 }, labelHeight: 120 };
        const views = m.views.map((v: any) =>
          v.id === view.id
            ? { ...v, items: [vitem], connectors: [], rectangles: [], textBoxes: [] }
            : v
        );
        m.actions.set({ items: [item], icons: [icon], colors: [], views }, true);
        ax.ui.getState().actions.setItemControls(null);
      },
      { url: FULL_ICON }
    );

    // Tile screen centre via the DOM overlay, then un-promote so the CANVAS
    // paints the node + its stalk.
    await setPromoted(page, 'sn');
    const dom = await page
      .locator('[data-drag-id="sn"] img')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => domIconCentre(page, 'sn'));
    expect(dom, 'DOM overlay icon rendered').not.toBeNull();
    await setPromoted(page, null);

    const zoom = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().zoom
    );
    const stalkPx = 120 * zoom; // labelHeight * zoom

    // Count near-black, opaque pixels in a thin vertical box over the stalk's
    // mid-section (clear of the icon below and the chip above).
    const stalkBlackCount = () =>
      page.evaluate(
        ({ x, y, halfW, halfH }) => {
          const cv = document.querySelector(
            '[data-testid="axoview-scene-canvas"]'
          ) as HTMLCanvasElement | null;
          if (!cv) return 0;
          const rect = cv.getBoundingClientRect();
          const sx = cv.width / rect.width;
          const sy = cv.height / rect.height;
          const x0 = Math.max(0, Math.round((x - rect.left - halfW) * sx));
          const y0 = Math.max(0, Math.round((y - rect.top - halfH) * sy));
          const w = Math.min(cv.width - x0, Math.round(halfW * 2 * sx));
          const h = Math.min(cv.height - y0, Math.round(halfH * 2 * sy));
          if (w <= 0 || h <= 0) return 0;
          // WebGL2 node canvas → read via a scratch 2D canvas (drawImage relies
          // on preserveDrawingBuffer:true); substrate-agnostic.
          const scratch = document.createElement('canvas');
          scratch.width = w;
          scratch.height = h;
          const s2d = scratch.getContext('2d')!;
          s2d.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
          const data = s2d.getImageData(0, 0, w, h).data;
          let n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (
              data[i] < 60 &&
              data[i + 1] < 60 &&
              data[i + 2] < 60 &&
              data[i + 3] > 40
            ) {
              n += 1;
            }
          }
          return n;
        },
        { x: dom!.x, y: dom!.y - stalkPx * 0.5, halfW: 6, halfH: stalkPx * 0.25 }
      );

    await expect
      .poll(stalkBlackCount, { timeout: 5_000 })
      .toBeGreaterThan(0);
  });
});
