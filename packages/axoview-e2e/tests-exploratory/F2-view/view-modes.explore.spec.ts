/**
 * F2 probes — the editor-mode ladder, the ADR 0012 popover, the preview
 * override and the ADR 0014 annotation overlay, in the browser.
 *
 * RIG NOTES: every test destructures `app` (the fixture is lazy), and every
 * probe asserts its PRECONDITION — the entity exists, the mode really flipped,
 * the control really mounted — before drawing a conclusion.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { byAxoviewId } from '../../helpers/selectors';

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

// ---------------------------------------------------------------------------
// VIEW-11 — the editing dock in view mode
// ---------------------------------------------------------------------------

test.describe('F2 / view mode vs the editing dock', () => {
  test('VIEW-11 control: the NODE panel honours readOnly in view mode', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 1, y: 1 }));
    const id = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      return items[items.length - 1]?.id ?? null;
    });
    expect(id).not.toBeNull();

    await setViewMode(page);
    await page.evaluate((nodeId: string) => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setItemControls({ type: 'ITEM', id: nodeId });
      a.setRightSidebarOpen(true);
    }, id!);

    const panel = page.getByTestId('item-controls-panel');
    await panel.waitFor({ state: 'visible', timeout: 5_000 });
    // PRECONDITION: the dock really mounted for this node.
    await expect(panel).toBeVisible();
    // NodePanel takes the `readOnly` branch: its notes editor is a read-only
    // Quill (`<RichTextEditor value={…} readOnly />`), so the contenteditable
    // reports itself non-editable.
    const editableSurfaces = await panel
      .locator('.ql-editor[contenteditable="true"]')
      .count();
    expect(editableSurfaces).toBe(0);
  });

  test('VIEW-11: a RECTANGLE / TEXTBOX / LABEL / CONNECTOR panel is fully editable in view mode', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    await page.getByTestId('label-inline-editor').waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    const label = (await activeView(page))?.labels?.[0];
    // PRECONDITION: a Label exists to select.
    expect(label).toBeTruthy();

    await setViewMode(page);
    // PRECONDITION: the mode really flipped.
    expect((await ui(page)).editorMode).toBe('EXPLORABLE_READONLY');

    await page.evaluate((labelId: string) => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setItemControls({ type: 'LABEL', id: labelId });
      a.setRightSidebarOpen(true);
    }, label.id as string);

    const panel = page.getByTestId('item-controls-panel');
    await panel.waitFor({ state: 'visible', timeout: 5_000 });
    // `ItemControlsManager` forwards `readOnly` to the ITEM branch only, so the
    // Label panel renders its EDITABLE notes surface to a viewer.
    const editor = panel.locator('.ql-editor[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });

    // …and it really mutates the model from inside a read-only mode.
    expect((await activeView(page)).labels[0].notes ?? '').toBe('');
    await editor.click();
    await page.keyboard.type('EDITEDINVIEWMODE', { delay: 10 });
    await expect
      .poll(
        async () => (await activeView(page)).labels[0].notes ?? '',
        { timeout: 3_000 }
      )
      .toContain('EDITEDINVIEWMODE');
    // The mode never changed under us.
    expect((await ui(page)).editorMode).toBe('EXPLORABLE_READONLY');
  });
});

// ---------------------------------------------------------------------------
// VIEW-05 — the ADR 0012 popover has no LABEL branch on the pinned path
// ---------------------------------------------------------------------------

test.describe('F2 / view-mode info popover', () => {
  test('VIEW-05: a floating Label with a headerLink can never pin the popover', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
    await page.getByTestId('label-inline-editor').waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    const view = await activeView(page);
    const labelId = view?.labels?.[0]?.id as string;
    expect(labelId).toBeTruthy();

    // Give the Label a headerLink, and a node one too as the CONTROL.
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 3, y: 3 }));
    const nodeId = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      return items[items.length - 1]?.id ?? null;
    });
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

    // CONTROL: a node with the same shape of content DOES pin.
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id, tile: { x: 3, y: 3 } });
    }, nodeId!);
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(
      byAxoviewId(page, 'view-mode-info-popover-link')
    ).toHaveAttribute('href', 'https://example.com/node');

    // The Label: same content, no popover — `INFO_TYPES` has no 'LABEL'.
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'LABEL', id, tile: { x: 0, y: 0 } });
    }, labelId);
    await page.waitForTimeout(400);
    // PRECONDITION: the selection really moved to the Label.
    expect((await ui(page)).itemControls?.type).toBe('LABEL');
    await expect(popover).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// VIEW-03 — annotation strokes vs a projection switch
// ---------------------------------------------------------------------------

test.describe('F2 / annotation overlay', () => {
  test('VIEW-03: an iso→2D switch re-projects the diagram out from under the ink', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 2, y: 2 }));
    const nodeId = await page.evaluate(() => {
      const items = (window as any).__axoview__.model.getState().items;
      return items[items.length - 1]?.id ?? null;
    });
    expect(nodeId).not.toBeNull();

    // Seed one stroke through the store (the geometry question is what matters,
    // not the pointer path — VIEW-04 covers the drawing gate).
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setAnnotationOpen(true);
      (window as any).__axoview__.ui.getState().actions.addAnnotationStroke({
        id: 'probe-stroke',
        tool: 'pencil',
        color: '#ff0000',
        thickness: 6,
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 40 }
        ]
      });
    });

    const strokePath = page.locator(
      '[data-axoview-id="annotation-layer"] svg g path'
    );
    await strokePath.first().waitFor({ state: 'attached', timeout: 5_000 });

    const nodeBefore = await canvas.tileToScreen({ x: 2, y: 2 });
    const strokeBefore = await strokePath.first().boundingBox();
    expect(strokeBefore).not.toBeNull();

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
    );
    await page.waitForTimeout(400);
    // PRECONDITION: the projection really switched.
    expect((await ui(page)).canvasMode).toBe('2D');

    const nodeAfter = await canvas.tileToScreen({ x: 2, y: 2 });
    const strokeAfter = await strokePath.first().boundingBox();
    expect(strokeAfter).not.toBeNull();

    // PRECONDITION: the node's tile really did move on screen (otherwise the
    // comparison below is vacuous).
    const nodeMoved =
      Math.abs(nodeAfter.x - nodeBefore.x) + Math.abs(nodeAfter.y - nodeBefore.y);
    expect(nodeMoved).toBeGreaterThan(20);

    // CHARACTERIZATION: the ink did NOT follow it — it is anchored to scene
    // canvas px, which the projection switch only translates (scroll), so the
    // stroke and the thing it annotates part company.
    const inkMoved =
      Math.abs(strokeAfter!.x - strokeBefore!.x) +
      Math.abs(strokeAfter!.y - strokeBefore!.y);
    expect({ nodeMoved: nodeMoved > 20, drifted: Math.abs(nodeMoved - inkMoved) > 20 })
      .toEqual({ nodeMoved: true, drifted: true });
  });

  test('VIEW-09: hiding the view controls strands an armed draw tool with no exit affordance', async ({
    page,
    app
  }) => {
    void app;
    await setViewMode(page);
    await page.evaluate(() => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setAnnotationOpen(true);
      a.setAnnotationTool('pencil');
    });
    const palette = byAxoviewId(page, 'annotation-palette');
    const layer = byAxoviewId(page, 'annotation-layer');
    // PRECONDITION: the palette and the capturing layer are both up.
    await expect(layer).toBeVisible();
    await expect(palette).toBeVisible();
    expect(
      await layer.evaluate((el) => getComputedStyle(el).pointerEvents)
    ).toBe('auto');

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setHideViewControls(true)
    );
    await page.waitForTimeout(250);

    // CHARACTERIZATION: the palette is gone, the overlay keeps capturing the
    // whole canvas, and the tool is still armed.
    await expect(palette).toHaveCount(0);
    await expect(layer).toBeVisible();
    expect(
      await layer.evaluate((el) => getComputedStyle(el).pointerEvents)
    ).toBe('auto');
    expect((await ui(page)).annotation.tool).toBe('pencil');
  });

  test('VIEW-10: image export does not bake the annotation strokes in', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 2, y: 2 }));
    await page.evaluate(() => {
      const a = (window as any).__axoview__.ui.getState().actions;
      a.setAnnotationOpen(true);
      a.addAnnotationStroke({
        id: 'probe-stroke',
        tool: 'pencil',
        color: '#ff0000',
        thickness: 6,
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 40 }
        ]
      });
    });
    // PRECONDITION: exactly one annotation layer on screen, carrying the stroke.
    await expect(byAxoviewId(page, 'annotation-layer')).toHaveCount(1);
    await expect(
      page.locator('[data-axoview-id="annotation-layer"] svg g path')
    ).toHaveCount(1);

    // The export dialog mounts a SECOND Axoview with its own UiStateProvider.
    // If the export tree carried the strokes there would be a second overlay
    // with a second path. (The bridge is destroyed by this dialog — R3/GPU-02 —
    // so every bridge read above must already have happened.)
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setDialog('EXPORT_IMAGE')
    );
    await page.waitForTimeout(1500);
    const overlays = await page
      .locator('[data-axoview-id="annotation-layer"]')
      .count();
    const paths = await page
      .locator('[data-axoview-id="annotation-layer"] svg g path')
      .count();
    expect({ overlays, paths }).toEqual({ overlays: 1, paths: 1 });
  });
});

// ---------------------------------------------------------------------------
// VIEW-12 — the preview override across an in-diagram navigation
// ---------------------------------------------------------------------------

test.describe('F2 / preview layer override lifetime', () => {
  test('VIEW-12: an in-diagram link navigation does not clear a solo override', async ({
    page,
    app
  }) => {
    void app;
    await setViewMode(page);
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setPreviewSoloLayer('layer-probe')
    );
    // PRECONDITION: the override really is set.
    expect((await ui(page)).previewLayerOverrides.soloLayerId).toBe('layer-probe');

    // The in-diagram link path: TextBox.onRestingClick / the NodePanel link
    // dispatch this exact event; the app routes on it.
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('axoview-navigate-to-diagram', {
          detail: { id: 'some-other-diagram' }
        })
      )
    );
    await page.waitForTimeout(400);

    // CHARACTERIZATION: the override IS cleared — the app's navigation handler
    // routes through one of the two clearing actions, so no solo id leaks into
    // the next diagram. The predicted leak does not exist.
    const after = (await ui(page)).previewLayerOverrides.soloLayerId;
    expect(after).toBeNull();
  });
});
