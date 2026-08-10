/**
 * node-label-decouple.spec.ts — Slice S2 (#4 node label ↔ name decouple).
 *
 * ADR 0032 amendment (2026-06-30): the on-canvas node text is the model item's
 * `label`, decoupled from the identity `name` (Layers-only, hidden from canvas).
 * Render source is `label ?? name`. This pins the two load-bearing invariants:
 *   1. render-source — the on-canvas chip shows `label` when set;
 *   2. decouple — changing the identity `name` does NOT move the canvas text
 *      once a `label` exists.
 *
 * The chip is drawn on the GPU (no DOM text), so the node is promoted into the
 * DOM overlay (`[data-testid="node-label"]`) to read it. R4/RND-13/15: SELECTION
 * no longer promotes — the rename session does — so that goes through
 * `helpers/nodeOverlay`, which carries the reason. `<Node>` resolves the text as
 * `label ?? name`, the same resolution `webgl/scene/nodeEmitter.ts` uses, which
 * is what makes reading the overlay a fair reading of the canvas. Field writes
 * go through the model store bridge (actions.set), the same model the Details
 * "Label" field and a Layers rename write to.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getModelItemCount } from '../helpers/store';
import { promotedLabelText } from '../helpers/nodeOverlay';

type Page = import('@playwright/test').Page;

const firstItem = (page: Page) =>
  page.evaluate(() => {
    const it = (window as any).__axoview__.model.getState().items[0];
    return it ? { id: it.id, name: it.name, label: it.label } : null;
  });

const firstItemTile = (page: Page) =>
  page.evaluate(() => {
    const v = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    return (views.find((x: any) => x.id === v) ?? views[0]).items[0].tile;
  });

// Patch one model item via the store bridge (mirrors what the Details Label
// field / a Layers rename write to the model).
const patchItem = (page: Page, id: string, patch: Record<string, unknown>) =>
  page.evaluate(
    ({ id, patch }) => {
      const model = (window as any).__axoview__.model;
      const items = model.getState().items as any[];
      model
        .getState()
        .actions.set({
          items: items.map((it) => (it.id === id ? { ...it, ...patch } : it))
        });
    },
    { id, patch }
  );

const domLabelText = async (page: Page) => {
  const id = (await firstItem(page))!.id;
  return promotedLabelText(page, id);
};

test.describe('Node label ↔ name decouple — Slice S2 (#4)', () => {
  test('on-canvas label reads `label` and is decoupled from identity `name`', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 420, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    const placed = await firstItem(page);
    expect(placed).not.toBeNull();
    expect(placed!.name).toBe('Untitled');

    // Select the node → it promotes into the DOM overlay; the chip falls back to
    // `name` ('Untitled') because no explicit label is set yet.
    await page.keyboard.press('s');
    const tile = await firstItemTile(page);
    await canvas.clickAt(await canvas.tileToScreen(tile));
    await expect.poll(() => domLabelText(page), { timeout: 3_000 }).toBe(
      'Untitled'
    );

    // Set an explicit on-canvas label → the chip shows it.
    await patchItem(page, placed!.id, { label: 'Database' });
    await expect.poll(() => domLabelText(page), { timeout: 3_000 }).toBe(
      'Database'
    );
    expect((await firstItem(page))!.name).toBe('Untitled'); // identity untouched

    // Rename the IDENTITY name → the on-canvas label must NOT move (decoupled).
    await patchItem(page, placed!.id, { name: 'svc-db' });
    expect((await firstItem(page))!.name).toBe('svc-db');
    await expect.poll(() => domLabelText(page), { timeout: 3_000 }).toBe(
      'Database'
    );
  });
});
