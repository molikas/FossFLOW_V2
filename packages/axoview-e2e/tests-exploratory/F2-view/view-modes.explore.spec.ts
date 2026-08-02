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

// VIEW-11 is FIXED (wave 2). `ItemControlsManager` threads `readOnly` to all
// five element branches now, and `RightSidebar` derives it fail-closed from the
// prop OR the store. Both legs promoted to the main suite —
// `tests/readonly-enforcement.spec.ts` — with the per-panel enumeration in the
// class gate `axoview-lib/src/components/ItemControls/__tests__/readonlyPanels.contract.test.tsx`.

// VIEW-05, VIEW-03 and VIEW-09 are FIXED (wave 4) and their probes are
// retired. Promoted to the main suite as `tests/view-mode-annotation.spec.ts`
// (popover mounts for LABEL; the ink re-projects on an iso<->2D switch; hiding
// the chrome disarms the pen), with unit pins in
// `axoview-lib/src/components/ViewModeInfoPopover/__tests__/toHref.test.ts`
// and `axoview-lib/src/stores/__tests__/annotationSlice.test.ts`.

test.describe('F2 / annotation overlay', () => {
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
