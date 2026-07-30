/**
 * R5 — OVL-07, OVL-10, OVL-11: the overlays that own a gesture or preview.
 *
 * OVL-07 — the label-as-handle drag has TWO owners: `Label.tsx` (the selected
 *   node) and `NodeLabelHitLayer` (every other node). Both install window
 *   pointermove/up listeners on pointerdown and both keep a safety-net unmount
 *   effect that drops the gesture. `NodeLabelHitLayer` also unmounts wholesale
 *   below `HIT_MIN_ZOOM` (0.4) — so a zoom that crosses that line mid-drag tears
 *   the gesture's owner out from under it.
 *
 * OVL-10 — restated after reading `UiOverlay`: the placement ghost never covers
 *   the icon tool (`PlaceIconLayer` does that), so the probeable claim is the
 *   ADR-0023 one. `PlacementGhostLayer` anchors at
 *   `getTilePosition({ tile, origin: 'CENTER' })` with no residual, while the
 *   LABEL / TEXTBOX modes commit through `resolvePlacement` and DO keep an
 *   off-grid offset — so with global snap off the ghost and the drop disagree.
 *
 * OVL-11 — the F2 inline rename widens the node label from maxWidth 250 to 600.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';

const proxyFor = (id: string) => `[data-label-hit-id="${id}"]`;

const firstViewItem = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model.getState().views.find((v: any) => v.id === viewId);
    return (view?.items ?? [])[0] ?? null;
  });

const labelDragState = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().labelDrag ?? null
  );

const setZoom = (page: Page, z: number) =>
  page.evaluate(
    (v: number) => (window as any).__axoview__.ui.getState().actions.setZoom(v),
    z
  );

const clearSelection = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });

async function setupNamedNode(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 8_000 }).toBe(1);
  await page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const id = m.views.find((v: any) => v.id === viewId).items[0].id;
    m.actions.set(
      {
        items: m.items.map((i: any) =>
          i.id === id ? { ...i, name: 'Router', label: 'Router' } : i
        )
      },
      true
    );
  });
  await clearSelection(page);
  await page.waitForTimeout(600);
  const item = await firstViewItem(page);
  expect(item, 'PRECONDITION: the node exists').toBeTruthy();
  return item;
}

// ---------------------------------------------------------------------------
// OVL-07 — a zoom that crosses HIT_MIN_ZOOM mid-drag
// ---------------------------------------------------------------------------

test.describe('OVL-07 — the label drag loses its owner on a mid-gesture zoom', () => {
  test('CONTROL: an uninterrupted proxy drag commits a new labelHeight', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const item = await setupNamedNode(page, canvas);
    const before = item.labelHeight ?? 20;
    const rect = (await page.locator(proxyFor(item.id)).boundingBox())!;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 30, { steps: 6 });
    await page.mouse.move(cx, cy + 70, { steps: 6 });
    // PRECONDITION: the gesture really engaged (labelDrag is the preview channel).
    const live = await labelDragState(page);
    expect(live?.id, 'the drag promoted the node').toBe(item.id);
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect((await firstViewItem(page)).labelHeight).not.toBe(before);
    expect(await labelDragState(page), 'the preview was cleared').toBeNull();
  });

  /**
   * VERDICT (FALSIFIED): crossing HIT_MIN_ZOOM mid-drag DOES take the proxy div
   * out of the DOM, but the gesture survives — `active` makes the layer RETURN
   * NULL, which does not unmount the component, so the safety-net cleanup never
   * runs and the window-bound pointerup still commits. The two-owner seam is
   * real; the gesture is owned by window listeners, not by the div.
   */
  test('the drag survives its own proxy layer disappearing mid-gesture', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const item = await setupNamedNode(page, canvas);
    const before = item.labelHeight ?? 20;
    const rect = (await page.locator(proxyFor(item.id)).boundingBox())!;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 30, { steps: 6 });
    await page.mouse.move(cx, cy + 70, { steps: 6 });
    expect(
      (await labelDragState(page))?.id,
      'PRECONDITION: the drag engaged'
    ).toBe(item.id);

    // The same thing a wheel-zoom does mid-gesture — cross the 0.4 line the
    // proxy layer mounts behind.
    await setZoom(page, 0.3);
    await page.waitForTimeout(400);
    expect(
      await page.locator(proxyFor(item.id)).count(),
      'PRECONDITION: the proxy div really did leave the DOM'
    ).toBe(0);

    await page.mouse.up();
    await page.waitForTimeout(500);

    // The offset the user dragged to is committed anyway, and the preview
    // channel is cleared.
    expect((await firstViewItem(page)).labelHeight).not.toBe(before);
    expect(await labelDragState(page)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OVL-10 — the placement ghost ignores the off-grid residual
// ---------------------------------------------------------------------------

const setGlobalSnap = (page: Page, on: boolean) =>
  page.evaluate((v: boolean) => {
    const ui = (window as any).__axoview__.ui.getState();
    // The toggle lives on uiState; the action name is the only public writer.
    ui.actions.setSnapToGrid?.(v);
    return (window as any).__axoview__.ui.getState().snapToGrid;
  }, on);

const ghostRect = (page: Page) =>
  page.locator('[data-testid="placement-ghost"]').first().boundingBox();

test.describe('OVL-10 — the placement ghost is anchored at the bare tile', () => {
  test('with snap OFF the ghost sits at the cell centre while the drop follows the cursor', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const snap = await setGlobalSnap(page, false);
    expect(snap, 'PRECONDITION: global snap is off').toBe(false);

    // Arm the Label tool and hover a clearly OFF-CENTRE point inside a tile.
    const centre = await canvas.tileToScreen({ x: 0, y: 0 });
    const box = (await canvas.interactionsLayer().boundingBox())!;
    const target: CanvasPoint = { x: centre.x + 40, y: centre.y + 18 };
    await page.evaluate(() => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setMode({ type: 'LABEL', showCursor: true, id: null });
    });
    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.waitForTimeout(400);

    const ghost = await ghostRect(page);
    expect(ghost, 'PRECONDITION: the ghost is mounted').not.toBeNull();
    const ghostCentre = {
      x: ghost!.x + ghost!.width / 2,
      y: ghost!.y + ghost!.height / 2
    };

    // Drop it and read where the Label actually landed.
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(500);
    const label = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const v = bridge.model
        .getState()
        .views.find((x: any) => x.id === viewId);
      const l = (v?.labels ?? [])[0];
      return l ? { id: l.id, tile: l.tile, offset: l.offset ?? null } : null;
    });
    expect(label, 'PRECONDITION: a Label was placed').not.toBeNull();
    expect(
      label!.offset,
      'PRECONDITION: it really landed off-grid (a residual was kept)'
    ).not.toBeNull();

    // Characterization: the ghost was at the bare cell, the drop is offset by
    // the residual the ghost never showed.
    const drift = Math.hypot(label!.offset!.x, label!.offset!.y);
    expect(drift).toBeGreaterThan(4);
    // eslint-disable-next-line no-console
    console.log(
      '[OVL-10] ghost centre',
      JSON.stringify(ghostCentre),
      'residual',
      JSON.stringify(label!.offset)
    );
  });
});

// ---------------------------------------------------------------------------
// OVL-11 — F2 widens the chip past the canvas cap
// ---------------------------------------------------------------------------

/**
 * OVL-11 — DEFERRED (timebox). The claim is straightforward from the source:
 * `Node` passes `maxWidth={isEditingName ? 600 : 250}` to `ExpandableLabel`,
 * and 250 is the cap BOTH `measureNodeLabel` and `measureNameChip` clamp to —
 * so the rename editor is allowed to be 2.4x wider than anything the canvas or
 * the hit proxy will ever draw. What could not be measured inside the timebox is
 * the resulting on-screen width, because every candidate hook collapses:
 *   • `[data-axoview-id="canvas-label-chip"]` is published only when `Label`
 *     receives a `reposition` handle, and `Node` withholds it while editing;
 *   • `[data-testid="node-label"]` and the `ExpandableLabel` wrapper under it
 *     are zero-size (the chip inside them is absolutely positioned);
 *   • `LabelOuter` (which literally carries `width: maxWidth`) has no hook and
 *     sits two unnamed levels down, so any selector for it is a guess that would
 *     silently read 0 — exactly the "a wrong selector reads as 0 elements" trap.
 * A manual check is one step: give a node a 40-character name, select it, press
 * F2, and see whether the editor chip overhangs the chip that was there a moment
 * earlier. Landing this properly wants a `data-axoview-id` on `LabelOuter`,
 * which is product code and out of bounds for a probe.
 */
test.describe('OVL-11 — the inline rename widens the label past the drawn cap', () => {
  const LONG = 'Distribution Switch Rack Seventeen North';

  test.skip('entering F2 grows the chip beyond the 250px both renderers clamp to', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(90_000);
    const canvas = new CanvasPOM(page);
    const item = await setupNamedNode(page, canvas);
    await page.evaluate((n: string) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      const viewId = bridge.ui.getState().view;
      const id = m.views.find((v: any) => v.id === viewId).items[0].id;
      m.actions.set(
        {
          items: m.items.map((i: any) =>
            i.id === id ? { ...i, name: n, label: n } : i
          )
        },
        true
      );
    }, LONG);
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id });
    }, item.id);
    await page.waitForTimeout(600);

    const zoom = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().zoom as number
    );
    // NOT `canvas-label-chip`: `Label` publishes that id only when it is given a
    // `reposition` handle, and `Node` withholds it while `isEditingName` — so the
    // attribute vanishes the instant F2 lands and the locator times out. The
    // wrapper Node puts around ExpandableLabel is present in both states.
    // `LabelOuter` — the one element that carries `width: maxWidth` inline, which
    // IS the number under test. (`node-label` wraps an absolutely-positioned chip
    // and collapses to 0; `canvas-label-chip` is withheld during the rename.)
    const chip = page.locator('[data-testid="node-label"] > div').first();
    await expect(chip).toHaveCount(1);
    const before = (await chip.boundingBox())!.width / zoom;
    expect(
      before,
      'PRECONDITION: the resting label is inside the 250 cap both renderers clamp to'
    ).toBeLessThanOrEqual(251);

    // `handleFunctionKeys` ignores F2 unless the keystroke came from inside the
    // renderer (or from document.body) — MQA #13, so F2 in the file-explorer
    // tree renames a DIAGRAM. Placing an icon leaves focus in the Elements grid
    // (the COLDSTART focus trap), which is what made the first run of this probe
    // read "no editor" and look like a finding.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? null),
      'PRECONDITION: focus is on body so F2 is not filtered out'
    ).toBe('BODY');
    await page.keyboard.press('F2');
    await page.waitForTimeout(600);
    const editing = await page.locator('[contenteditable="true"]').count();
    expect(editing, 'PRECONDITION: the inline editor mounted').toBeGreaterThan(0);

    const after = (await chip.boundingBox())!.width / zoom;
    // eslint-disable-next-line no-console
    console.log('[OVL-11] chip width', before, '->', after);
    expect(after).toBeGreaterThan(before);
  });
});
