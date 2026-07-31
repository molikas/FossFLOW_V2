/**
 * text-entity-lifecycle.spec.ts — promoted from the F1 explore lane (ADR 0047
 * flip rule): TXT-04, TXT-05, TXT-07 (owner ruling) and TXT-15.
 *
 * What they share is an entity that exists only provisionally — a text box or a
 * floating Label between placement and its first commit — and the three ways
 * that state used to leak: into history (TXT-04, undo landed BETWEEN the
 * placement entry and the discard entry and resurrected an invisible ghost),
 * into the selection (TXT-15, `setItemControls(null)` is a half-deselect), and
 * onto the canvas as a placeholder nobody typed (TXT-07).
 *
 * TXT-05 is the same shape one level down: the ADR 0032 label↔name seed ran on
 * LOAD only, so a never-reloaded node was still living off the `label ?? name`
 * fallback and a Layers rename moved its canvas text.
 *
 * Every test asserts its PRECONDITION before concluding, so a setup that
 * silently did not happen cannot read as a pass.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getViewTextBoxCount, getModelHistoryLength } from '../helpers/store';

type Page = import('@playwright/test').Page;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

const textBoxes = async (page: Page) =>
  ((await activeView(page))?.textBoxes ?? []).map((t: any) => ({
    id: t.id as string,
    content: (t.content ?? '') as string
  }));

const labels = async (page: Page) =>
  ((await activeView(page))?.labels ?? []).map((l: any) => ({
    id: l.id as string,
    text: (l.text ?? '') as string
  }));

const selectedIds = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__axoview__.ui.getState().selectedIds ?? []) as Array<{
        type: string;
        id: string;
      }>
  );

test.describe('Abandoning a fresh text box leaves nothing behind', () => {
  test('TXT-15: the discard clears the selection, not just itemControls', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 0, y: 0 });
    await canvas.placeTextBoxAt(placePixel, { keepEditing: true });

    // PRECONDITION: the box exists and IS the current selection.
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(1);
    const placed = (await textBoxes(page))[0];
    expect(placed).toBeTruthy();
    await expect
      .poll(async () => (await selectedIds(page)).map((s) => s.id), {
        timeout: 3_000
      })
      .toEqual([placed.id]);

    await canvas.dismissTextBoxEditor();
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(0);

    const controls = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().itemControls
    );
    expect(controls).toBeNull();
    // …and no dangling reference: Delete, arrow-nudge and every strip writer
    // read `selectedIds`, which used to still name the deleted box.
    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 3_000 })
      .toBe(0);
  });

  test('TXT-04: abandoning a fresh box adds no history entry, so undo cannot land on a ghost', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    // A committed box first, so `view.textBoxes` already exists. The very first
    // placement in a diagram also creates that container, and `undefined → []`
    // is a real (if contentless) patch — measuring the second placement keeps
    // the assertion about the session, not about the array being introduced.
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: -3, y: 0 }), {
      text: 'Keep'
    });
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(1);
    const historyBefore = await getModelHistoryLength(page);

    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 3, y: 0 }), {
      keepEditing: true
    });
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(2);
    await canvas.dismissTextBoxEditor();
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(1);

    // The whole session is ONE logical action. Placement and discard used to be
    // TWO entries, so a single Ctrl+Z landed between them and resurrected an
    // empty, invisible 1×1 box. At most one entry now — and its undo cannot
    // produce a text box, because the session's net content change is nothing.
    // (The one entry that does land carries only the view's `lastUpdated`: the
    // create and the delete are each a real action that stamps it, and they
    // cancel out on content but not on the timestamp. Recorded in the entry.)
    expect(await getModelHistoryLength(page)).toBeLessThanOrEqual(
      historyBefore + 1
    );

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    // No ghost: the abandoned box does not come back.
    expect(await getViewTextBoxCount(page)).toBeLessThanOrEqual(1);
    const remaining = await textBoxes(page);
    expect(remaining.every((t) => t.content.includes('Keep'))).toBe(true);
  });

  test('a box that IS typed into survives, as one undoable action', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: -3, y: 0 }), {
      text: 'First'
    });
    await expect
      .poll(() => getViewTextBoxCount(page), { timeout: 5_000 })
      .toBe(1);
    const historyBefore = await getModelHistoryLength(page);

    // Left-click-away COMMITS (Escape cancels — see the POM note), so this is
    // the place-and-type path end to end.
    await canvas.placeTextBoxAt(await canvas.tileToScreen({ x: 3, y: 0 }), {
      text: 'hello'
    });
    await expect
      .poll(async () => (await textBoxes(page)).length, { timeout: 5_000 })
      .toBe(2);
    expect(
      (await textBoxes(page)).some((t) => t.content.includes('hello'))
    ).toBe(true);
    // PRECONDITION for the undo below: exactly one entry for the whole session
    // — placement and the first commit together.
    expect(await getModelHistoryLength(page)).toBe(historyBefore + 1);

    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await textBoxes(page)).length, { timeout: 3_000 })
      .toBe(1);
  });
});

test.describe('Floating Label lifecycle parity (TXT-07 ruling)', () => {
  test('a Label abandoned during its first edit is discarded — no "Label" placeholder', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      keepEditing: true
    });
    const editor = page.getByTestId('label-inline-editor');
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: a Label really was created, and it holds NO placeholder
    // text — placement seeds empty, so "never committed" is "empty".
    await expect
      .poll(async () => (await labels(page)).length, { timeout: 3_000 })
      .toBe(1);
    expect((await labels(page))[0].text).toBe('');

    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect
      .poll(async () => (await labels(page)).length, { timeout: 3_000 })
      .toBe(0);
    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 3_000 })
      .toBe(0);
  });

  test('emptying an existing Label and committing DELETES it, undoably', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }), {
      keepEditing: true
    });
    const editor = page.getByTestId('label-inline-editor');
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await page.keyboard.type('Keep me', { delay: 10 });
    await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);
    // PRECONDITION: a committed Label with real text.
    await expect
      .poll(async () => (await labels(page)).map((l) => l.text), {
        timeout: 3_000
      })
      .toEqual(['Keep me']);
    const historyBefore = await getModelHistoryLength(page);

    // Re-open, clear, commit — the text box's contract, now the Label's too.
    await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const view =
        bridge.model
          .getState()
          .views.find((v: any) => v.id === bridge.ui.getState().view) ??
        bridge.model.getState().views[0];
      bridge.ui.getState().actions.setInlineEditLabelId(view.labels[0].id);
    });
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');

    // Deleted, not silently reverted to the old text.
    await expect
      .poll(async () => (await labels(page)).length, { timeout: 3_000 })
      .toBe(0);
    expect(await getModelHistoryLength(page)).toBeGreaterThan(historyBefore);

    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await labels(page)).map((l) => l.text), {
        timeout: 3_000
      })
      .toEqual(['Keep me']);
  });
});

test.describe('The node label↔name decouple holds before the first reload', () => {
  test('TXT-05: renaming a never-reloaded node in Layers leaves its canvas text alone', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const placePixel = await canvas.tileToScreen({ x: 1, y: 1 });
    await placeIconViaMouse(page, placePixel);

    const item = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      const last = items[items.length - 1];
      return last ? { id: last.id, name: last.name, label: last.label } : null;
    });
    // PRECONDITION: a node was placed AND the creation reducer seeded its
    // canvas label, so the `label ?? name` fallback is not live.
    expect(item).not.toBeNull();
    expect(item!.name).toBe('Untitled');
    expect(item!.label).toBe('Untitled');

    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id }, { openPanel: false });
    }, item!.id);
    const nodeLabel = page.locator('[data-testid="node-label"]').first();
    await nodeLabel.waitFor({ state: 'attached', timeout: 5_000 });
    expect(((await nodeLabel.textContent()) ?? '').trim()).toBe('Untitled');

    // Exactly what LayersPanel.handleItemRename does for an ITEM row.
    await page.evaluate((id: string) => {
      const bridge = (window as any).__axoview__;
      const model = bridge.model.getState();
      model.actions.set({
        items: model.items.map((i: any) =>
          i.id === id ? { ...i, name: 'Renamed identity' } : i
        )
      });
    }, item!.id);
    await page.waitForTimeout(250);

    const after = await page.evaluate((id: string) => {
      const items = (window as any).__axoview__.model.getState().items;
      const it = items.find((i: any) => i.id === id);
      return { name: it?.name, label: it?.label };
    }, item!.id);
    expect(after).toEqual({ name: 'Renamed identity', label: 'Untitled' });
    // The canvas text did NOT follow the identity rename — the ADR 0032
    // amendment's contract, now true before the first reload as well as after.
    expect(((await nodeLabel.textContent()) ?? '').trim()).toBe('Untitled');
  });
});
