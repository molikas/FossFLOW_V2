/**
 * R4 — RND-13, RND-15, RND-05, RND-14: what hybrid promotion does BESIDES
 * swapping a node's renderer.
 *
 * The Renderer lifts a node out of the WebGL bulk into a DOM `<Nodes>` overlay
 * whenever it is selected / dragged / label-dragged / icon-resized. That overlay
 * is a separate `<SceneLayer>` mounted far later in the Renderer's child list
 * than `NodesCanvas` and `LabelsCanvas`, so promotion is not order-preserving
 * (RND-13, RND-15); the overlay's `<Node>` has no LOD gate, so it keeps its name
 * chip where the bulk has dropped every one (RND-05); and the overlay set is
 * filtered through the VIEWPORT CULL, so panning the selected node off-screen
 * silently unmounts it (RND-14).
 *
 * ORACLE — paint order, asked of the browser rather than read off the CSS spec
 * (COLDSTART: "do not conclude a platform behaviour from the spec").
 * `document.elementsFromPoint` returns the hit-test stack topmost-first, which
 * IS paint order — but the bulk canvases are `pointer-events: none` and the
 * full-viewport `canvas-interactions` box would swallow the point. So
 * `stackOrder` temporarily flips `pointer-events` on exactly the elements under
 * test (and off on the interactions box), measures, and restores. A CONTROL
 * measurement over a pair whose order is already known (rectangles canvas below
 * nodes canvas — mount order) proves the rig can tell above from below.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { layerCounters } from '../_rig/glOracles';

const CANVAS = '[data-testid="axoview-canvas"]';
const NODES_CANVAS = '[data-testid="axoview-nodes-canvas"]';
const LABELS_CANVAS = '[data-testid="axoview-labels-canvas"]';
const RECTS_CANVAS = '[data-testid="axoview-rectangles-canvas"]';
const PROBE_SEL = '[data-rnd-probe="1"]';

/**
 * Indices of `selectors` in the paint stack at (x, y): 0 = topmost, -1 = not in
 * the stack. Lower index ⇒ painted LATER ⇒ drawn ON TOP.
 */
const stackOrder = (
  page: Page,
  x: number,
  y: number,
  selectors: string[]
): Promise<number[]> =>
  page.evaluate(
    ({ x: px, y: py, selectors: sels }) => {
      const saved: Array<[HTMLElement, string]> = [];
      const force = (el: Element | null, v: string) => {
        if (!el) return;
        const h = el as HTMLElement;
        saved.push([h, h.style.pointerEvents]);
        h.style.pointerEvents = v;
      };
      force(document.querySelector('[data-axoview-id="canvas-interactions"]'), 'none');
      sels.forEach((s) => force(document.querySelector(s), 'auto'));
      const stack = document.elementsFromPoint(px, py);
      const order = sels.map((s) =>
        stack.findIndex((el) => el.matches(s) || Boolean(el.closest(s)))
      );
      saved.forEach(([el, v]) => {
        el.style.pointerEvents = v;
      });
      return order;
    },
    { x, y, selectors }
  );

/**
 * Tag the largest-area descendant of the DOM overlay copy of `id` with
 * `data-rnd-probe` and return its centre — the shell itself is a zero-size
 * positioned div (its children are absolutely positioned), so it is not
 * hit-testable and measuring it would silently return "not in the stack".
 */
const markDomNode = (page: Page, id: string) =>
  page.evaluate((nodeId: string) => {
    document
      .querySelectorAll('[data-rnd-probe]')
      .forEach((el) => el.removeAttribute('data-rnd-probe'));
    const shell = document.querySelector(`[data-drag-id="${nodeId}"]`);
    if (!shell) return null;
    let best: Element | null = null;
    let bestArea = 0;
    shell.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > bestArea) {
        bestArea = a;
        best = el;
      }
    });
    if (!best) return null;
    (best as Element).setAttribute('data-rnd-probe', '1');
    const r = (best as Element).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, area: bestArea };
  }, id);

const firstItemId = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return (view?.items ?? [])[0]?.id ?? null;
  });

const selectItem = (page: Page, id: string) =>
  page.evaluate((itemId: string) => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls({ type: 'ITEM', id: itemId });
  }, id);

const setName = (page: Page, id: string, name: string) =>
  page.evaluate(
    ({ id: itemId, name: n }) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      m.actions.set(
        { items: m.items.map((i: any) => (i.id === itemId ? { ...i, name: n } : i)) },
        true
      );
      return (
        bridge.model.getState().items.find((i: any) => i.id === itemId)?.name ??
        null
      );
    },
    { id, name }
  );

// ---------------------------------------------------------------------------
// RND-13 / RND-15 — promotion is not order-preserving
// ---------------------------------------------------------------------------

test.describe('RND-13/RND-15 — a promoted node paints above the whole bulk', () => {
  test('the DOM overlay outranks BOTH the node canvas and the floating-Label canvas', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, at);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const id = await firstItemId(page);
    expect(id, 'PRECONDITION: the node exists').toBeTruthy();

    // RIG CONTROL — a pair whose order is fixed by mount order in Renderer.tsx:
    // RectanglesCanvas is the first child, NodesCanvas comes much later, and
    // LabelsCanvas comes right after NodesCanvas (the ADR-0031 "a Label paints
    // ABOVE nodes" decision). If the rig cannot see that, nothing below counts.
    const control = await stackOrder(page, at.x, at.y, [
      LABELS_CANVAS,
      NODES_CANVAS,
      RECTS_CANVAS
    ]);
    expect(control.every((i) => i >= 0), `control stack was ${control}`).toBe(true);
    expect(control[0], 'labels canvas paints above the node canvas').toBeLessThan(
      control[1]
    );
    expect(control[1], 'node canvas paints above the rectangle canvas').toBeLessThan(
      control[2]
    );

    // Unselected: there is no DOM copy at all.
    expect(await page.locator(`[data-drag-id="${id}"]`).count()).toBe(0);

    await selectItem(page, id!);
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
    await page.waitForTimeout(400);

    const marked = await markDomNode(page, id!);
    expect(marked, 'PRECONDITION: the DOM overlay has a hit-testable box').not.toBeNull();
    expect(marked!.area).toBeGreaterThan(0);

    const promoted = await stackOrder(page, marked!.x, marked!.y, [
      PROBE_SEL,
      NODES_CANVAS,
      LABELS_CANVAS
    ]);
    expect(promoted.every((i) => i >= 0), `promoted stack was ${promoted}`).toBe(true);
    // Characterization: the promoted copy is topmost of the three.
    expect(promoted[0]).toBeLessThan(promoted[1]);
    expect(promoted[0]).toBeLessThan(promoted[2]);
  });

  test.fail(
    'BUG: selecting a node must not lift it above the floating-Label canvas',
    async ({ page, app }) => {
      void app;
      test.setTimeout(180_000);
      const canvas = new CanvasPOM(page);
      const at = await canvas.tileToScreen({ x: 0, y: 0 });
      await placeIconViaMouse(page, at);
      await expect.poll(() => getViewItemCount(page)).toBe(1);
      const id = await firstItemId(page);
      expect(id, 'PRECONDITION: the node exists').toBeTruthy();

      const control = await stackOrder(page, at.x, at.y, [
        LABELS_CANVAS,
        NODES_CANVAS
      ]);
      expect(
        control[0],
        'PRECONDITION: at rest, Labels paint above Nodes (ADR 0031)'
      ).toBeLessThan(control[1]);

      await selectItem(page, id!);
      await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
      await page.waitForTimeout(400);
      const marked = await markDomNode(page, id!);
      expect(marked, 'PRECONDITION: the DOM overlay is hit-testable').not.toBeNull();

      const promoted = await stackOrder(page, marked!.x, marked!.y, [
        PROBE_SEL,
        LABELS_CANVAS
      ]);
      expect(
        promoted.every((i) => i >= 0),
        `PRECONDITION: both elements are in the stack (${promoted})`
      ).toBe(true);

      // The assertion under test: the node must stay BELOW the Label layer.
      expect(promoted[0]).toBeGreaterThan(promoted[1]);
    }
  );
});

// ---------------------------------------------------------------------------
// RND-05 — the LOD band applies to the bulk only
// ---------------------------------------------------------------------------

test.describe('RND-05 — below the label LOD zoom, only the promoted node keeps a name', () => {
  const NAME = 'ZQPLODZQP';

  test('the bulk draws zero chips while the selected node still shows one', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const a = await canvas.tileToScreen({ x: -2, y: 0 });
    const b = await canvas.tileToScreen({ x: 2, y: 0 });
    await placeIconViaMouse(page, a);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await placeIconViaMouse(page, b);
    await expect.poll(() => getViewItemCount(page)).toBe(2);
    const id = await firstItemId(page);
    expect(await setName(page, id!, NAME)).toBe(NAME);

    // PRECONDITION: readable-labels is OFF, so the LOD band is live at all.
    expect(
      await page.evaluate(
        () => (window as any).__axoview__.ui.getState().readableLabels
      )
    ).toBe(false);

    await selectItem(page, id!);
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setZoom(0.2)
    );
    await page.waitForTimeout(900);

    // PRECONDITION: the bulk really did drop every chip (LABEL_LOD_ZOOM = 0.25).
    const counters = await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as HTMLElement | null;
      return {
        labelsDrawn: c?.dataset.labelsDrawn ?? null,
        drawCount: c?.dataset.drawCount ?? null
      };
    }, NODES_CANVAS);
    expect(counters.labelsDrawn, 'the bulk drew no name chips').toBe('0');
    expect(Number(counters.drawCount), 'the OTHER node is still on the bulk').toBe(1);

    // Characterization: the promoted node's DOM name chip is still on screen.
    await expect(page.locator(`${CANVAS} >> text=${NAME}`)).toHaveCount(1);
  });

  test.fail(
    'BUG: below the LOD zoom no node should show a name, promoted or not',
    async ({ page, app }) => {
      void app;
      test.setTimeout(180_000);
      const canvas = new CanvasPOM(page);
      const a = await canvas.tileToScreen({ x: -2, y: 0 });
      const b = await canvas.tileToScreen({ x: 2, y: 0 });
      await placeIconViaMouse(page, a);
      await expect.poll(() => getViewItemCount(page)).toBe(1);
      await placeIconViaMouse(page, b);
      await expect.poll(() => getViewItemCount(page)).toBe(2);
      const id = await firstItemId(page);
      expect(
        await setName(page, id!, NAME),
        'PRECONDITION: the node is named'
      ).toBe(NAME);
      await selectItem(page, id!);
      await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
      await page.evaluate(() =>
        (window as any).__axoview__.ui.getState().actions.setZoom(0.2)
      );
      await page.waitForTimeout(900);
      const labelsDrawn = await page.evaluate((sel: string) => {
        const c = document.querySelector(sel) as HTMLElement | null;
        return c?.dataset.labelsDrawn ?? null;
      }, NODES_CANVAS);
      expect(labelsDrawn, 'PRECONDITION: the bulk is past the LOD band').toBe('0');

      expect(await page.locator(`${CANVAS} >> text=${NAME}`).count()).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// RND-14 — the promotion set is filtered through the viewport cull
// ---------------------------------------------------------------------------

test.describe('RND-14 — panning the selected node off-screen drops its overlay', () => {
  /**
   * CONTROL (added after R5/OVL-11 hit the same trap): `handleFunctionKeys`
   * drops F2 unless the keystroke came from inside the renderer or from
   * document.body, and placing an icon leaves focus in the Elements grid. So
   * "F2 mounted no editor" only means something once F2 is shown to WORK for the
   * same selection without the pan.
   */
  test('CONTROL: with the node on screen, F2 does mount the inline editor', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, at);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const id = await firstItemId(page);
    await selectItem(page, id!);
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? null),
      'PRECONDITION: focus is on body so F2 is not filtered out'
    ).toBe('BODY');
    await page.keyboard.press('F2');
    await page.waitForTimeout(600);
    expect(await page.locator('[contenteditable="true"]').count()).toBeGreaterThan(0);
  });

  test('itemControls still names it, but its DOM copy and rename affordance are gone', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, at);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const id = await firstItemId(page);
    await selectItem(page, id!);
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);

    // Pan far enough that the node's TILE leaves the padded coarse bounds.
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setScroll({
        position: { x: 20000, y: 20000 },
        offset: { x: 0, y: 0 }
      });
    });
    await page.waitForTimeout(900);

    // PRECONDITION: the cull really did fire (the bulk draws nothing now).
    const c = await layerCounters(page, 'axoview-nodes-canvas');
    expect(c.drawCount, 'the node was culled from the bulk').toBe(0);

    // The selection is untouched…
    const controls = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().itemControls
    );
    expect(controls?.id).toBe(id);

    // …but the DOM overlay is gone, so F2 has nothing to talk to.
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(0);
    await selectItem(page, id!);
    // Same focus reset the CONTROL above proves is sufficient, so a null result
    // here is about the missing overlay and not about the F2 focus filter.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? null),
      'PRECONDITION: focus is on body so F2 is not filtered out'
    ).toBe('BODY');
    await page.keyboard.press('F2');
    await page.waitForTimeout(600);
    expect(
      await page.locator('[contenteditable="true"]').count(),
      'no inline rename editor was mounted'
    ).toBe(0);
  });
});
