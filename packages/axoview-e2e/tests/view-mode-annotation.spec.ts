/**
 * Promoted from the F2 explore lane (ADR 0047 flip rule) — the wave-4 view/
 * annotation cluster, in the browser:
 *
 *   VIEW-05  a floating Label's link and notes are reachable in view mode
 *            (`INFO_TYPES` had no 'LABEL', so a selected Label was filtered out
 *            before the derivation it already had was ever called)
 *   VIEW-03  the annotation ink re-projects with the content on an iso<->2D
 *            switch, instead of being left behind over empty canvas
 *   VIEW-09  hiding the view chrome disarms the pen instead of stranding a
 *            full-canvas capturing overlay with no palette
 *
 * Each has a unit pin as well (`toHref.test.ts`, `annotationSlice.test.ts`).
 * These are the legs a unit test cannot fail on: whether the popover actually
 * mounts for the type, whether the DOM the ink is drawn into actually moves,
 * and whether the overlay actually stops capturing.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { byAxoviewId } from '../helpers/selectors';

type Page = import('@playwright/test').Page;

const ui = (page: Page) =>
  page.evaluate(() => (window as any).__axoview__.ui.getState());

const setViewMode = (page: Page) =>
  page.evaluate(() => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setEditorMode('EXPLORABLE_READONLY');
  });

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

test.describe('VIEW-05 — a floating Label pins the view-mode popover', () => {
  test('a Label with only a LINK opens the popover, same as a node', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    // `placeLabelAt` COMMITS by default since the wave-4 TXT-07 contract change
    // - it types the text and presses Enter, so the inline editor is already
    // detached when it returns. Nothing here needs the editing session, so this
    // uses the committing default rather than the `keepEditing` opt-out.
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      text: 'Linked label'
    });
    const labelId = (await activeView(page))?.labels?.[0]?.id as string;
    expect(labelId).toBeTruthy();

    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 3, y: 3 }));
    const nodeId = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      return items[items.length - 1]?.id ?? null;
    });

    // A link and NO notes on both. Notes matter: the hover branch is
    // notes-gated (owner 2026-07-01), so a link-only Label had no route at all
    // — which is why this is the shape under test rather than notes+link.
    await page.evaluate(
      (args: { labelId: string; nodeId: string }) => {
        const bridge = (window as any).__axoview__;
        const model = bridge.model.getState();
        model.actions.set({
          items: model.items.map((i: any) =>
            i.id === args.nodeId
              ? { ...i, headerLink: 'https://example.com/node' }
              : i
          ),
          views: model.views.map((v: any) => ({
            ...v,
            labels: (v.labels ?? []).map((l: any) =>
              l.id === args.labelId
                ? { ...l, headerLink: 'https://example.com/label' }
                : l
            )
          }))
        });
      },
      { labelId, nodeId: nodeId! }
    );
    await setViewMode(page);

    const popover = byAxoviewId(page, 'view-mode-info-popover');
    const link = byAxoviewId(page, 'view-mode-info-popover-link');

    // CONTROL: the node — the type that always worked. If this fails the test
    // below proves nothing about LABEL.
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id, tile: { x: 3, y: 3 } });
    }, nodeId!);
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute('href', 'https://example.com/node');

    // The Label, same content — this used to be filtered out by INFO_TYPES.
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'LABEL', id, tile: { x: 0, y: 0 } });
    }, labelId);
    expect((await ui(page)).itemControls?.type).toBe('LABEL');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute('href', 'https://example.com/label');
  });
});

test.describe('VIEW-03 — the ink re-projects with the content', () => {
  /**
   * Draws with REAL pointer events over the given screen point, so the
   * screen->scene-canvas conversion is done by `AnnotationLayer.toScene` - the
   * shipped code - rather than transcribed into the test. (A transcribed
   * predicate is a copy, and a copy cannot detect the original changing; see
   * the VIEW-04 probe that could never flip.)
   */
  const drawAt = async (page: Page, at: { x: number; y: number }) => {
    await page.evaluate(() => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setAnnotationOpen(true);
      a.setAnnotationTool('pencil');
    });
    const layer = page.locator('[data-axoview-id="annotation-layer"]');
    const box = (await layer.boundingBox())!;
    const x = box.x + at.x;
    const y = box.y + at.y;
    await page.mouse.move(x - 12, y - 12);
    await page.mouse.down();
    await page.mouse.move(x + 12, y + 12, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => (await ui(page)).annotation.strokes.length, {
        timeout: 5_000
      })
      .toBe(1);
  };

  const strokeLocator = (page: Page) =>
    page.locator('[data-axoview-id="annotation-layer"] svg g path');

  /** Stroke bbox centre, expressed relative to the annotation layer's origin. */
  const inkCentre = async (page: Page) => {
    const box = (await strokeLocator(page).first().boundingBox())!;
    const layer = (await page
      .locator('[data-axoview-id="annotation-layer"]')
      .boundingBox())!;
    return {
      x: box.x + box.width / 2 - layer.x,
      y: box.y + box.height / 2 - layer.y
    };
  };

  test('an iso->2D switch keeps the ink over the node it was drawn around', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodeTile = { x: 2, y: 2 };
    await placeIconViaMouse(page, await canvas.tileToScreen(nodeTile));

    // Drawn ON the node, which is the point: the claim is "the mark stays on
    // the thing it marks". Comparing two points far apart would fail even with
    // a correct fix, because iso->2D is a linear map and not a translation -
    // different points legitimately move by different amounts.
    const nodeBefore = await canvas.tileToScreen(nodeTile);
    await drawAt(page, nodeBefore);
    await strokeLocator(page).first().waitFor({ state: 'attached', timeout: 5_000 });

    const before = await inkCentre(page);
    const offsetBefore = {
      x: before.x - nodeBefore.x,
      y: before.y - nodeBefore.y
    };

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
    );
    await expect
      .poll(async () => (await ui(page)).canvasMode, { timeout: 5_000 })
      .toBe('2D');
    await page.waitForTimeout(300);

    const nodeAfter = await canvas.tileToScreen(nodeTile);
    // PRECONDITION: the projection really did move the content on screen.
    // Without this the assertion below is vacuous - it would also pass if
    // nothing moved at all.
    expect(
      Math.abs(nodeAfter.x - nodeBefore.x) + Math.abs(nodeAfter.y - nodeBefore.y)
    ).toBeGreaterThan(20);

    const after = await inkCentre(page);
    const offsetAfter = { x: after.x - nodeAfter.x, y: after.y - nodeAfter.y };

    // The ink is still the same distance from the node it was drawn around.
    // Generous tolerance: the stroke's own geometry re-projects too, so its
    // bbox centre shifts a little relative to a point.
    expect(Math.abs(offsetAfter.x - offsetBefore.x)).toBeLessThan(24);
    expect(Math.abs(offsetAfter.y - offsetBefore.y)).toBeLessThan(24);
  });

  test('and the ink survives the switch - re-projected, not cleared', async ({
    app
  }) => {
    // The rejected alternative from the entry. Clearing on a projection switch
    // would also stop the ink drifting, and would be wrong: a projection change
    // is a presentation change, not a content change, which is exactly the line
    // VIEW-01/02 draws (page switch clears, edit<->present does not).
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await drawAt(page, await canvas.tileToScreen({ x: 2, y: 2 }));
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
    );
    await page.waitForTimeout(300);
    expect((await ui(page)).annotation.strokes).toHaveLength(1);
  });
});

test.describe('VIEW-09 — hiding the chrome does not strand the pen', () => {
  test('the overlay stops capturing when the palette goes', async ({ app }) => {
    const { page } = app;
    await setViewMode(page);
    await page.evaluate(() => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setAnnotationOpen(true);
      a.setAnnotationTool('pencil');
    });

    const palette = byAxoviewId(page, 'annotation-palette');
    const layer = byAxoviewId(page, 'annotation-layer');
    // PRECONDITION: both are up and the layer really is capturing.
    await expect(layer).toBeVisible();
    await expect(palette).toBeVisible();
    expect(
      await layer.evaluate((el) => getComputedStyle(el).pointerEvents)
    ).toBe('auto');

    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setHideViewControls(true)
    );
    await page.waitForTimeout(250);

    // The palette goes — that is the point of the toggle — but the canvas is
    // usable again rather than sitting under a capturing overlay with no exit.
    await expect(palette).toHaveCount(0);
    expect((await ui(page)).annotation.tool).toBe('select');
    expect(
      await layer.evaluate((el) => getComputedStyle(el).pointerEvents)
    ).not.toBe('auto');
  });
});
