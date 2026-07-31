/**
 * connector-dot-and-label-placement.spec.ts — owner 2026-07-02.
 *
 *   - A connector whose two anchors land on the SAME tile has a single-point
 *     path (an SVG polyline draws nothing) — it now renders as a DOT marker so
 *     the degenerate connector is visible + selectable.
 *   - Placing a floating Label selects it but does NOT auto-open the Details
 *     deck (rightSidebar stays closed).
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getModelItemCount, getModelConnectorCount } from '../helpers/store';

type Page = import('@playwright/test').Page;

const rightSidebarOpen = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().rightSidebarOpen === true
  );
const itemControlsType = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().itemControls?.type ?? null
  );

test.describe('Single-tile connector renders a dot', () => {
  // WAVE 3 (I4/CONN-10): this used to build its fixture by clicking the same
  // node twice in CONNECTOR mode. That route is gone — the connector tool now
  // REFUSES a connector whose two ends resolve to the same target, from both
  // the draw path and the reconnect path, because a zero-length self-loop
  // validated clean, saved, and rendered as nothing useful. The renderer's job
  // is unchanged: a degenerate connector still arrives from an IMPORTED or
  // legacy diagram (nothing in `validateView` or `modelSchema` rejects one), and
  // an SVG polyline with a single point draws nothing, so it must still paint a
  // visible, selectable dot. The fixture is therefore built the way such a
  // connector really reaches the app — straight into the model, then routed
  // into the scene store through the same SYNC_SCENE path diagram-open uses.
  test('a connector with both anchors on one tile paints a dot marker', async ({
    page,
    app
  }) => {
    void app;
    const P = { x: 440, y: 300 };
    await placeIconViaMouse(page, P);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const model = bridge.model.getState();
      const view = model.views.find((v: any) => v.id === viewId);
      const nodeId = view.items[0].id;
      const views = model.views.map((v: any) =>
        v.id !== viewId
          ? v
          : {
              ...v,
              connectors: [
                ...(v.connectors ?? []),
                {
                  id: 'legacy-degenerate',
                  color: model.colors[0].id,
                  anchors: [
                    { id: 'anchor-a', ref: { item: nodeId } },
                    { id: 'anchor-b', ref: { item: nodeId } }
                  ]
                }
              ]
            }
      );
      model.actions.set({ views });
      // `changeView` takes the model to sync FROM — reading the store here
      // would race the set() above.
      bridge.changeView(viewId, { ...model, views });
    });

    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);

    // The dot marker paints (the invisible-polyline case is covered).
    await expect(page.locator('[data-testid="connector-dot"]')).toHaveCount(1);
  });
});

test.describe('Label placement does not open the Details deck', () => {
  test('placing a label selects it but leaves the right deck closed', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    // Ensure the deck starts closed.
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await canvas.placeLabelAt({ x: 420, y: 300 });

    // The label is selected (top-bar target)...
    await expect.poll(() => itemControlsType(page), { timeout: 3_000 }).toBe(
      'LABEL'
    );
    // ...but the Details deck did NOT auto-open.
    expect(await rightSidebarOpen(page)).toBe(false);
  });
});
