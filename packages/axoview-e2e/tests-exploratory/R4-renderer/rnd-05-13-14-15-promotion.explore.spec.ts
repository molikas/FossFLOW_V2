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