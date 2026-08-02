/**
 * layers.spec.ts — Tier 1 J6.
 *
 * J6 (per docs/manual-test-baseline.md): layers — assign item to layer →
 * hide layer → item hidden; lock layer → item not draggable.
 *
 * Surface walkthrough:
 *   - The Layers panel mounts inside LeftDock when activeLeftTab === 'LAYERS'.
 *     LayersPanelPOM.open() clicks the lib's `dock-layers-toggle` (Session 2).
 *   - Assignment uses LayersPanel's custom drag-drop: LayerItemRow.onMouseDown
 *     calls onDragStart(item) → setItemDragState; LayerRow.onMouseEnter →
 *     setItemDragState.overLayerId; panel root onMouseUp →
 *     assignLayerToItems. There is no context-menu path today (verified
 *     against LayersPanel.tsx — no onContextMenu / Menu wiring) so this spec
 *     drives the canonical UX path.
 *   - Lock behaviour lives upstream of DragItems mode: Cursor.mousedown
 *     evaluates isItemInteractable on the hit item; locked items return
 *     false, which sets mode.mousedownItem = null. No DRAG_ITEMS mode is
 *     ever entered. The persisted tile is the only durable observable.
 *   - Visibility behaviour: useInteractionManager's `visibleIds` filter
 *     excludes items on hidden layers from selection / interaction, and
 *     SceneLayers skips rendering them. The model's `view.layers[*].visible`
 *     flag is the load-bearing assertion target — DOM absence is downstream.
 *
 * Lazy data-axoview-id retrofits this spec — ALL lib-side, single rebuild:
 *   - `layers-panel-add`        (LayersPanel.tsx Add layer IconButton)
 *   - `layer-row` + `data-layer-name`
 *                               (LayerRow.tsx outer Box)
 *   - `layer-toggle-visibility` (LayerRow.tsx visibility IconButton)
 *   - `layer-toggle-lock`       (LayerRow.tsx lock IconButton)
 *   - `layer-item-row` + `data-layer-item-id` + `data-layer-item-type`
 *                               (LayerItemRow.tsx outer Box)
 *
 * Approach pick (drag-drop vs context-menu): drag-drop. LayersPanel.tsx
 * exposes no context-menu surface — only the bespoke pointer-handler drag.
 * The drag-drop path uses ordinary `page.mouse.{down,move,up}` because the
 * panel handlers don't gate on isRendererInteraction (no rendererRef gate
 * here — that gate lives in useInteractionManager, which doesn't run
 * against the LayersPanel DOM subtree).
 *
 * Drag-lock assertion approach: read the model's view.items[0].tile before
 * and after a synthetic drag attempt while the layer is locked. The Cursor
 * mode handler rejects the mousedown via isItemInteractable, so no
 * DRAG_ITEMS commit fires → the model item's tile is unchanged. We verify
 * the same drag DOES move the item once unlocked, to rule out a tile-
 * resolution false negative.
 */
import { appTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { LayersPanelPOM } from '../pom/LayersPanelPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import {
  getModelItemCount,
  getViewItemCount,
  waitForDebugBridge
} from '../helpers/store';

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

async function pinOnboardingDismissed(page: import('@playwright/test').Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function clearDiagramStorage(page: import('@playwright/test').Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

async function openElementsPanel(page: import('@playwright/test').Page) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const gridItem = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const gridVisible = await gridItem.isVisible().catch(() => false);
  if (!gridVisible) await elementsToggle.click();
  await gridItem.waitFor({ state: 'visible', timeout: 5_000 });
}

interface CanvasPoint {
  x: number;
  y: number;
}

async function placeIcon(
  page: import('@playwright/test').Page,
  point: CanvasPoint
) {
  await openElementsPanel(page);
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox) throw new Error('placeIcon: missing bounding box');
  await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + point.x, canvasBox.y + point.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function bootBlankDiagram(page: import('@playwright/test').Page) {
  await clearDiagramStorage(page);
  await page.reload();
  const createBtn = byAxoviewId(page, 'screen-empty-create');
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  await byLibTestId(page, 'axoview-canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForDebugBridge(page);
}

/**
 * Reads `view.layers[*]` from the debug bridge, optionally filtered by name.
 */
const getLayer = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((layerName: string) => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    const layers = view?.layers ?? [];
    return layers.find((l: any) => l.name === layerName) ?? null;
  }, name);

/**
 * Returns the first VIEW item's id + tile. The spec places exactly one icon,
 * so the tuple is unambiguous.
 *
 * Note: model-level items (model.items) carry the icon catalogue entry
 * (id, name, icon ref) but NOT the tile — placeIcon writes the tile onto
 * the view item only (see lib/.../modes/PlaceIcon.ts). Reading `tile` from
 * model.items returns undefined.
 */
const getFirstItem = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    const viewItem = view?.items?.[0];
    return viewItem ? { id: viewItem.id, tile: viewItem.tile } : null;
  });

/**
 * Returns the view-item entry for a given model item id. The `layerId`
 * lives on the VIEW item, not the model-level item, so assignment
 * verification reads through here.
 */
const getViewItem = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((itemId: string) => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    return (view?.items ?? []).find((it: any) => it.id === itemId) ?? null;
  }, id);

/**
 * Number of nodes the WebGL bulk layer actually PAINTED, read off the
 * `data-draw-count` the NodesCanvas publishes each build (the same observable
 * the perf harness uses as its anti-cheat). This is the load-bearing assertion
 * for the layer-visibility regression: `view.layers[*].visible` flipping to
 * false is necessary but NOT sufficient — the bug was that the flip left the
 * elements DRAWN because the render guard misread an empty visible-set as
 * "no layers → draw everything". Asserting the paint count (not the model flag)
 * is what makes this test fail on the real symptom instead of passing green
 * against a still-buggy canvas.
 */
const nodesDrawCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    // R3/GPU-13: one merged canvas, so `data-draw-count` is the TOTAL over every
    // entity type. The node count has its own channel — which is also the
    // ADR 0020 anti-cheat channel.
    const el = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLCanvasElement | null;
    return el ? parseInt(el.dataset.nodesDrawn ?? '0', 10) || 0 : 0;
  });

/**
 * Synthetic mouse drag on the renderer interactions Box. Delegates to
 * CanvasPOM.dragFromTo which dispatches each event in a SEPARATE page.evaluate
 * — that's load-bearing. Bundling all dispatches into one evaluate breaks
 * drag detection because the lib's RAF-throttled mouse-update scheduler
 * (interaction/useRAFThrottle.ts) only flushes once per RAF tick: with no
 * RAF ticks between synthetic events, Cursor.mousemove's hasDragged check
 * compares the OLD snapshot position (pre-mousemove) against the OLD
 * mousedown, both of which equal `from` — so hasDragged stays false and the
 * mode never transitions to DRAG_ITEMS. Separate evaluates let the event
 * loop yield, the RAF tick, and the store-snapshot refresh between events.
 *
 * (`isRendererInteraction` still gates Cursor.mousedown / .mouseup on
 * `rendererRef === e.target`, which is why we dispatch on the interactions
 * Box rather than via page.mouse — same reason as connector.spec.)
 */
async function syntheticDrag(
  page: import('@playwright/test').Page,
  from: CanvasPoint,
  to: CanvasPoint
) {
  const canvas = new CanvasPOM(page);
  await canvas.dragFromTo(from, to);
}

test.describe('Layers — J6: assign + hide + lock', () => {
  test.beforeEach(async ({ page, app }) => {
    void app;
    await pinOnboardingDismissed(page);
    await bootBlankDiagram(page);
  });

  test('J6 (assign + hide): drag item onto a new layer, hiding the layer flips its visible flag', async ({ page }) => {
    // 1. Place a single icon. Tile derives from canvas-relative coord (380,280).
    await placeIcon(page, { x: 380, y: 280 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    const item = await getFirstItem(page);
    if (!item) throw new Error('expected one model item after placeIcon');

    // 2. Open the Layers panel and create "Layer 1" via the + button.
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await expect(layers.getLayerRow('Layer 1')).toBeVisible({ timeout: 5_000 });

    // 3. Drag the item's unassigned row onto Layer 1. The item-row anchors
    //    by id so it stays locatable even after virtualisation shuffles.
    await layers.dragItemToLayer(item.id, 'Layer 1');

    // 4. Verify the view-item's layerId now points at the new layer.
    const layerAfterAssign = await getLayer(page, 'Layer 1');
    const viewItemAfterAssign = await getViewItem(page, item.id);
    expect(layerAfterAssign).not.toBeNull();
    expect(viewItemAfterAssign?.layerId).toBe(layerAfterAssign!.id);

    // 5. Toggle visibility off. layer.visible flips to false; SceneLayers'
    //    visibility filter excludes the item from canvas render.
    await layers.toggleVisibility('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.visible, {
        timeout: 3_000
      })
      .toBe(false);

    // 6. Toggle visibility back on so the next test ordering doesn't carry
    //    a hidden layer through any shared state. beforeEach already wipes
    //    storage, but the local-mode rehydration race seen in Session 4 is
    //    avoided cheaply by leaving the panel in its default state.
    await layers.toggleVisibility('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.visible, {
        timeout: 3_000
      })
      .toBe(true);
  });

  test('J6 (lock): locking the assigned layer prevents drag in CURSOR mode', async ({ page }) => {
    // 1. Place an icon and stash its starting tile.
    const START: CanvasPoint = { x: 380, y: 280 };
    const END: CanvasPoint = { x: 540, y: 360 };
    await placeIcon(page, START);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    const item = await getFirstItem(page);
    if (!item) throw new Error('expected one model item after placeIcon');
    const startTile = item.tile;

    // 2. Open Layers panel, add Layer 1, assign the item to it.
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await layers.dragItemToLayer(item.id, 'Layer 1');
    const layer = await getLayer(page, 'Layer 1');
    if (!layer) throw new Error('expected Layer 1 after addLayer');

    // 3. Sanity-check: unlocked drag actually moves the item. If this step
    //    ever fails, the lock assertion in step 5 below becomes a false
    //    positive — verifying both branches keeps the test honest.
    await syntheticDrag(page, START, END);
    await expect
      .poll(async () => (await getFirstItem(page))?.tile, { timeout: 5_000 })
      .not.toEqual(startTile);

    const tileAfterUnlockedDrag = (await getFirstItem(page))?.tile;
    if (!tileAfterUnlockedDrag) throw new Error('expected item after first drag');

    // 4. Lock the layer.
    await layers.toggleLock('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.locked, {
        timeout: 3_000
      })
      .toBe(true);

    // 5. Drag attempt while locked — Cursor.mousedown sees
    //    isItemInteractable === false and writes mousedownItem = null. No
    //    DRAG_ITEMS mode is entered; the item's tile is unchanged.
    //
    //    We drag FROM `END` (where the item now sits after step 3) BACK to
    //    START. The locked-tile observable is "tile equals post-unlock-drag
    //    tile", not "tile equals startTile" — the post-unlock-drag tile is
    //    the new ground-truth starting point.
    await syntheticDrag(page, END, START);
    await page.waitForTimeout(250); // settle any pending mode flips
    const tileAfterLockedDrag = (await getFirstItem(page))?.tile;
    expect(tileAfterLockedDrag).toEqual(tileAfterUnlockedDrag);
  });

  test('J6 (lock): a locked layer strips the selected element’s transform handles', async ({ page }) => {
    // Regression guard for the "locked layer still resizable" bug: an element
    // on a locked layer can be SELECTED (ring shows) but must expose NO resize
    // handles — TransformControlsManager gates showHandles on lockedIds, the
    // same interactable invariant the gesture path already enforces. Handles are
    // real DOM (`canvas-transform-anchor`), so unlike layer.visible this is
    // directly observable without pixels (canvas-rendering-guidelines §11/§15).
    const AT: CanvasPoint = { x: 380, y: 280 };
    await placeIcon(page, AT);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    const item = await getFirstItem(page);
    if (!item) throw new Error('expected one model item after placeIcon');

    // Assign the node to a fresh layer.
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await layers.dragItemToLayer(item.id, 'Layer 1');

    const anchors = byAxoviewId(page, 'canvas-transform-anchor');

    // Select the node on the canvas while the layer is UNLOCKED — resize handles
    // appear. Verifying this branch keeps the locked assertion below honest (a
    // handle-less selection could otherwise pass for the wrong reason).
    const canvas = new CanvasPOM(page);
    await canvas.clickAt(AT);
    await expect(anchors.first()).toBeVisible({ timeout: 5_000 });
    expect(await anchors.count()).toBeGreaterThan(0);

    // Lock the layer. The selection persists, but every transform handle is
    // withdrawn — a locked element is inert (draw.io / PowerPoint parity).
    await layers.toggleLock('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.locked, {
        timeout: 3_000
      })
      .toBe(true);
    await expect.poll(() => anchors.count(), { timeout: 3_000 }).toBe(0);
  });

  test('J6 (hide actually hides): a node on the ONLY hidden layer stops painting, and shows again on re-toggle', async ({ page }) => {
    // Regression guard for the layer-visibility bug (hide-layer left elements
    // drawn). The trap the old layers spec fell into: it asserted only
    // `layer.visible === false` and passed green while the canvas kept painting
    // the node. The failure lived in the render guards, which treated an EMPTY
    // visible-set as "no layers configured → draw all" — but an empty set also
    // means "every element is on a hidden layer". With a SINGLE layer holding
    // the SINGLE node, hiding it empties the set and tripped exactly that path.
    //
    // So this test uses that minimal one-node/one-layer shape (the worst case)
    // and asserts the PAINTED node count via NodesCanvas `data-draw-count`.
    await placeIcon(page, { x: 380, y: 280 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);
    const item = await getFirstItem(page);
    if (!item) throw new Error('expected one model item after placeIcon');

    // Deselect so the node lives on the bulk canvas (a selected node is lifted
    // into the DOM overlay and excluded from the canvas draw count).
    await page.keyboard.press('Escape');

    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await expect(layers.getLayerRow('Layer 1')).toBeVisible({ timeout: 5_000 });
    await layers.dragItemToLayer(item.id, 'Layer 1');

    // Sanity: the node is on the canvas and PAINTED while its layer is visible.
    // (If this never reaches 1 the draw-count assertions below are meaningless.)
    await expect.poll(() => nodesDrawCount(page), { timeout: 5_000 }).toBe(1);

    // Hide the layer → the node must STOP painting. Pre-fix this stayed 1.
    await layers.toggleVisibility('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.visible, { timeout: 3_000 })
      .toBe(false);
    await expect.poll(() => nodesDrawCount(page), { timeout: 3_000 }).toBe(0);

    // Show it again → the node must come BACK. This is the "user can reset
    // visibility" path the report said was stuck — the toggle has to work both
    // directions, not just latch hidden.
    await layers.toggleVisibility('Layer 1');
    await expect
      .poll(async () => (await getLayer(page, 'Layer 1'))?.visible, { timeout: 3_000 })
      .toBe(true);
    await expect.poll(() => nodesDrawCount(page), { timeout: 3_000 }).toBe(1);
  });
});
