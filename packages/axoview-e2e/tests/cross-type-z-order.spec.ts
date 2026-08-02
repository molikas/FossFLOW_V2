/**
 * cross-type-z-order.spec.ts — R3/GPU-13 + R4/RND-13/15 (ADR 0038 §8).
 *
 * The bug GPU-13 filed: `resolveRenderOrder` is a correct GLOBAL ordering
 * function, but it was applied INSIDE each of four separate WebGL contexts
 * stacked by mount order in `Renderer.tsx`. A rectangle could never paint above a
 * node however high its `zIndex` or its layer's `order`; the z-order controls
 * were silently inert across entity types. The fix merges the four contexts into
 * one and paints a single sorted draw.
 *
 * This asserts the OUTCOME, in pixels, because that is the only thing the merge
 * can be judged on: mount order carries no ordering meaning any more, so there is
 * no DOM position left to read (the amendment's "asserts the sort, not DOM
 * order"). Both entities are given a flat saturated colour and the canvas is
 * sampled where they overlap — whoever's colour is there is whoever painted last.
 *
 * The substrate is readable from CI because the context is created with
 * `preserveDrawingBuffer: true` for image export (ADR 0038 §4).
 *
 * RND-13/15 rides here rather than in its own file because it is the same
 * property from the other side: selecting an element must not change the paint
 * order, and the only way to see that is the same overlap sample.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import {
  sceneCounters,
  canvasPatchColor,
  colorDistance,
  SCENE_CANVAS_SELECTOR,
  Rgba
} from '../helpers/sceneCanvas';

type Page = import('@playwright/test').Page;

// Full-bleed flat sprites, so a patch average IS the entity's colour.
const BLUE = { r: 0x5b, g: 0x8d, b: 0xef };
const RED = { r: 0xe5, g: 0x39, b: 0x35 };
const NODE_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%235b8def'/></svg>";

/** How near a patch has to be to a reference colour to count as "that entity". */
const NEAR = 90;

const nearness = (c: Rgba, ref: { r: number; g: number; b: number }) =>
  Math.abs(c.r - ref.r) + Math.abs(c.g - ref.g) + Math.abs(c.b - ref.b);

/**
 * A node at tile (0,0) under a grouping rectangle that covers it.
 *
 * `rectZ` is the whole point: at 0 the rectangle sorts below the node by TYPE
 * RANK (rectangle < connector < node < label — the rank that reproduces the old
 * mount order, so an unlayered document looks identical). Raising it above the
 * node's z-index must now flip the paint order, which is precisely what four
 * separate contexts made impossible.
 */
async function seed(
  page: Page,
  rectZ: number,
  nodeName = 'N',
  showLabel = false
) {
  await page.evaluate(
    ({ url, z, name, label }) => {
      const ax = (window as any).__axoview__;
      const m = ax.model.getState();
      const ui = ax.ui.getState();
      const view =
        (ui.view && m.views.find((v: any) => v.id === ui.view)) || m.views[0];
      const icon = {
        id: 'zIcon',
        name: 'i',
        url,
        collection: 'imported',
        isIsometric: false
      };
      const item = { id: 'zn', name, icon: 'zIcon' };
      const vitem = { id: 'zn', tile: { x: 0, y: 0 }, showLabel: label };
      const rect = {
        id: 'zr',
        from: { x: -1, y: -1 },
        to: { x: 1, y: 1 },
        customColor: '#e53935',
        fillOpacity: 1,
        zIndex: z
      };
      const views = m.views.map((v: any) =>
        v.id === view.id
          ? {
              ...v,
              items: [vitem],
              connectors: [],
              rectangles: [rect],
              textBoxes: [],
              labels: []
            }
          : v
      );
      m.actions.set({ items: [item], icons: [icon], colors: [], views }, true);
      ax.ui.getState().actions.setItemControls(null);
    },
    { url: NODE_ICON, z: rectZ, name: nodeName, label: showLabel }
  );
  await page.waitForTimeout(400);
}

/** Set the rectangle's zIndex on the live model, as the z-order command does. */
const setRectZ = (page: Page, z: number) =>
  page.evaluate((zz) => {
    const ax = (window as any).__axoview__;
    const m = ax.model.getState();
    const ui = ax.ui.getState();
    const views = m.views.map((v: any) =>
      v.id === ui.view
        ? {
            ...v,
            rectangles: (v.rectangles ?? []).map((r: any) =>
              r.id === 'zr' ? { ...r, zIndex: zz } : r
            )
          }
        : v
    );
    m.actions.set({ views }, false);
  }, z);

/** Viewport point over the node's tile centre. */
async function overlapPoint(page: Page) {
  const canvas = new CanvasPOM(page);
  const local = await canvas.tileToScreen({ x: 0, y: 0 });
  const box = await page.locator(SCENE_CANVAS_SELECTOR).boundingBox();
  if (!box) throw new Error('rig: the merged scene canvas has no bounding box');
  return { x: box.x + local.x, y: box.y + local.y };
}

test.describe('GPU-13 — z-order crosses entity types', () => {
  test('a rectangle raised above a node paints above it, and back again', async ({
    page,
    app
  }) => {
    void app;
    await seed(page, 0);

    // PRECONDITION: exactly one node and one rectangle really are on the merged
    // canvas — a zero here would make every colour comparison below vacuous.
    const counts = await sceneCounters(page);
    expect(counts.present, 'the merged scene canvas is mounted').toBe(true);
    expect(counts.nodesDrawn).toBe(1);
    expect(counts.rectanglesDrawn).toBe(1);

    const pt = await overlapPoint(page);

    // At equal z-index the TYPE RANK decides, and rectangle < node — the old
    // mount order, preserved so an unlayered document looks identical.
    const belowState = await canvasPatchColor(page, pt);
    expect(belowState, 'rig: the canvas patch is readable').not.toBeNull();
    expect(
      nearness(belowState!, BLUE),
      `the NODE is on top at equal z-index (patch ${JSON.stringify(belowState)})`
    ).toBeLessThan(NEAR);

    // The bug: this used to change nothing at all.
    await setRectZ(page, 5);
    await page.waitForTimeout(400);
    const aboveState = await canvasPatchColor(page, pt);
    expect(
      nearness(aboveState!, RED),
      `a rectangle at zIndex 5 paints above a node at zIndex 0 (patch ${JSON.stringify(
        aboveState
      )})`
    ).toBeLessThan(NEAR);

    // …and it is a real ordering, not a one-way latch.
    await setRectZ(page, -1);
    await page.waitForTimeout(400);
    const backState = await canvasPatchColor(page, pt);
    expect(nearness(backState!, BLUE)).toBeLessThan(NEAR);
  });

  test('a floating Label paints above a node at the same z-index (ADR 0031 §2 as a sort key)', async ({
    page,
    app
  }) => {
    void app;
    await seed(page, -1); // rectangle out of the way, under everything
    const pt = await overlapPoint(page);
    const before = await canvasPatchColor(page, pt);
    expect(nearness(before!, BLUE)).toBeLessThan(NEAR);

    // Drop a Label on the node's own tile. Its chip is the theme's near-white
    // background with a grey border — nothing like the node's flat blue.
    await page.evaluate(() => {
      const ax = (window as any).__axoview__;
      const m = ax.model.getState();
      const ui = ax.ui.getState();
      const views = m.views.map((v: any) =>
        v.id === ui.view
          ? {
              ...v,
              labels: [
                { id: 'zl', tile: { x: 0, y: 0 }, text: 'LABEL', zIndex: 0 }
              ]
            }
          : v
      );
      m.actions.set({ views }, false);
    });
    await expect
      .poll(() => sceneCounters(page).then((c) => c.floatingLabelsDrawn ?? 0), {
        timeout: 5_000
      })
      .toBe(1);

    const after = await canvasPatchColor(page, pt);
    expect(
      colorDistance(before!, after!),
      `the Label chip covers the node beneath it (before ${JSON.stringify(
        before
      )}, after ${JSON.stringify(after)})`
    ).toBeGreaterThan(60);
    // Specifically: the chip, not "something changed" — the chip is light.
    expect(after!.r + after!.g + after!.b).toBeGreaterThan(
      before!.r + before!.g + before!.b
    );
  });
});

test.describe('RND-13/15 — selection is order-preserving', () => {
  test('selecting a node hidden under a rectangle does not lift it', async ({
    page,
    app
  }) => {
    void app;
    // Rectangle ABOVE the node, which is only expressible at all because of the
    // merge above. Before the RND-13/15 fix, selecting the node moved it into a
    // DOM overlay mounted after every canvas, so it jumped in front — an
    // accidental "bring to front" no z-order command issued.
    await seed(page, 5);
    const pt = await overlapPoint(page);
    const covered = await canvasPatchColor(page, pt);
    expect(nearness(covered!, RED)).toBeLessThan(NEAR);

    await page.evaluate(() => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id: 'zn' });
    });
    await page.waitForTimeout(400);

    // The node is still drawn by the bulk — it was NOT promoted out of it.
    expect((await sceneCounters(page)).nodesDrawn).toBe(1);
    expect(
      await page.locator('[data-drag-id="zn"]').count(),
      'selection alone must not mount a DOM overlay copy'
    ).toBe(0);

    // And the picture did not restack: the rectangle is still on top.
    const afterSelect = await canvasPatchColor(page, pt);
    expect(
      nearness(afterSelect!, RED),
      `selecting must not change paint order (patch ${JSON.stringify(
        afterSelect
      )})`
    ).toBeLessThan(NEAR);
  });

  test('renaming DOES promote, so F2 still gets a real contentEditable', async ({
    page,
    app
  }) => {
    void app;
    // The counterpart the flip rule demands: selection stopped promoting, so
    // something has to still promote or inline-rename would be silently gone.
    // The rename INTENT is the trigger now (`uiState.inlineEditNodeId`). The
    // node needs a VISIBLE label here: the editor is the label chip's
    // contentEditable, so `showLabel: false` would leave nothing to type into.
    await seed(page, -1, 'Renameable', true);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setItemControls({ type: 'ITEM', id: 'zn' });
    });
    await page.waitForTimeout(200);
    expect(await page.locator('[data-drag-id="zn"]').count()).toBe(0);

    await page.evaluate(() => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setInlineEditNodeId('zn');
    });
    await expect
      .poll(() => page.locator('[data-drag-id="zn"]').count(), {
        timeout: 5_000
      })
      .toBe(1);
    await expect(
      page.locator('[data-drag-id="zn"] [contenteditable="true"]')
    ).toHaveCount(1);

    // Closing the session returns the node to the bulk, in its own place.
    await page.evaluate(() => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setInlineEditNodeId(null);
    });
    await expect
      .poll(() => page.locator('[data-drag-id="zn"]').count(), {
        timeout: 5_000
      })
      .toBe(0);
  });
});
