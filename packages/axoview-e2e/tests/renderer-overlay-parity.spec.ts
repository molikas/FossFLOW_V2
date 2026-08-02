/**
 * renderer-overlay-parity.spec.ts — what the DOM overlay layers owe the bulk
 * canvases they sit on top of.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed R4/RND-02,
 * RND-04, RND-05, RND-14 and R5/OVL-06, OVL-12, OVL-13. Every one of them is the
 * same shape: the WebGL bulk layers and their DOM affordance layers each decide
 * independently what to show, and the two decisions had drifted apart.
 *
 *   RND-02  a hidden layer removed the connector body but not its label chip.
 *   RND-04  hybrid promotion keyed the drag set on a comma-joined string, so a
 *           node whose id contained a comma was neither promoted nor culled —
 *           it kept painting on the bulk with no drag preview at all.
 *   RND-05  below LABEL_LOD_ZOOM the bulk dropped every name chip while a
 *           selected node's DOM copy kept one.
 *   RND-14  the promotion set was filtered through the viewport cull, so
 *           panning a SELECTED node off-screen destroyed the overlay F2 talks
 *           to — "reveal, then act" (DECISIONS.md).
 *   OVL-06  present mode kept the floating-Label hover proxy and dropped the
 *           node-name one.
 *   OVL-12  the node-name grab box ignored the ADR 0015 counter-scale the chip
 *           it covers is drawn with.
 *   OVL-13  the node-name proxy filtered visibleIds but never lockedIds, so a
 *           locked layer still handed out a label drag + rename handle.
 *
 * The static half of this class — "every layer reaches the layer context and
 * consults both sets" — is the class gate at
 * `axoview-lib/src/components/SceneLayers/__tests__/layerFilter.contract.test.ts`
 * (ADR 0047 §3). This file is the behavioural half: the gate cannot see whether
 * a filter that exists actually removes anything on screen.
 *
 * Each test asserts its PRECONDITION (the layer really is hidden/locked, the
 * cull really fired, the counter-scale really is engaged) so a setup that
 * silently did not happen cannot read as a pass.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getViewItemCount } from '../helpers/store';
import { sceneCounters } from '../helpers/sceneCanvas';

test.describe.configure({ timeout: 120_000 });

const CANVAS = '[data-testid="axoview-canvas"]';
const NODES_CANVAS = '[data-testid="axoview-scene-canvas"]';
const NODE_NAME_PROXY = '[data-axoview-id="canvas-label-hit"]';
const labelProxyFor = (id: string) => `[data-label-hit-id="${id}"]`;

// ---------------------------------------------------------------------------
// Shared oracles
// ---------------------------------------------------------------------------

const firstItemId = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model.getState().views.find((v: any) => v.id === viewId);
    return ((view?.items ?? [])[0]?.id ?? null) as string | null;
  });

const selectItem = (page: Page, id: string) =>
  page.evaluate((itemId: string) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setItemControls({ type: 'ITEM', id: itemId });
  }, id);

const clearSelection = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });

const setName = (page: Page, id: string, name: string) =>
  page.evaluate(
    ({ id: itemId, name: n }) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      m.actions.set(
        {
          items: m.items.map((i: any) =>
            i.id === itemId ? { ...i, name: n, label: n } : i
          )
        },
        true
      );
      return (
        bridge.model.getState().items.find((i: any) => i.id === itemId)?.name ??
        null
      );
    },
    { id, name }
  );

/** The counters `NodesCanvas` publishes on its canvas element. */
const nodeCounters = (page: Page) =>
  page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLElement | null;
    return {
      // R3/GPU-13: one merged canvas, so `data-draw-count` is the TOTAL over
      // every entity type. The NODE count — which is what every assertion here
      // means — has its own channel, and it is also ADR 0020's anti-cheat one.
      drawCount: Number(c?.dataset.nodesDrawn ?? -1),
      labelsDrawn: c?.dataset.labelsDrawn ?? null,
      labelScale: Number(c?.dataset.labelScale ?? '1')
    };
  }, NODES_CANVAS);

/** Non-transparent pixels on a bulk canvas — "is this layer painting?". */
const paintedPixels = (page: Page, sel: string) =>
  page.evaluate((s: string) => {
    const gl = document.querySelector(s) as HTMLCanvasElement | null;
    if (!gl || !gl.width || !gl.height) return -1;
    const scratch = document.createElement('canvas');
    scratch.width = gl.width;
    scratch.height = gl.height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return -2;
    ctx.drawImage(gl, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n += 1;
    return n;
  }, sel);

/**
 * Put ONE layer on the active view and assign every entity to it.
 *
 * A blank-diagram boot configures NO layers, and the layers' escape hatch keys
 * on `layers.length === 0` (never on `visibleIds.size`, which would also mean
 * "everything is hidden" — the class gate asserts that distinction). So a
 * visibility test has to seed a layer before it can hide one.
 */
const seedLayer = (page: Page, flags: { visible: boolean; locked: boolean }) =>
  page.evaluate((f: { visible: boolean; locked: boolean }) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const LAYER_ID = 'parity-layer';
    const assign = (list: any[] | undefined) =>
      (list ?? []).map((e: any) => ({ ...e, layerId: LAYER_ID }));
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            layers: [
              {
                id: LAYER_ID,
                name: 'Parity layer',
                visible: f.visible,
                locked: f.locked,
                order: 0
              }
            ],
            items: assign(v.items),
            connectors: assign(v.connectors),
            rectangles: assign(v.rectangles),
            textBoxes: assign(v.textBoxes),
            labels: assign(v.labels)
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return {
      layers: (after?.layers ?? []).length,
      visible: after?.layers?.[0]?.visible as boolean,
      locked: after?.layers?.[0]?.locked as boolean,
      itemsOnLayer: (after?.items ?? []).filter(
        (i: any) => i.layerId === LAYER_ID
      ).length,
      connectorsOnLayer: (after?.connectors ?? []).filter(
        (c: any) => c.layerId === LAYER_ID
      ).length
    };
  }, flags);

/**
 * `tileToScreen` is relative to the interactions layer; `page.mouse` needs
 * ABSOLUTE page coordinates. Mixing the two silently aims a real drag at empty
 * canvas, which reads as "the drag never started" rather than as a bad point.
 */
async function tileToPage(canvas: CanvasPOM, tile: { x: number; y: number }) {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  if (!box) throw new Error('interactions box has no bounding box');
  return { x: box.x + rel.x, y: box.y + rel.y };
}

/** Close the Elements dock so it cannot swallow a real press over the canvas. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon
      .waitFor({ state: 'hidden', timeout: 3_000 })
      .catch(() => undefined);
  }
}

const NAME = 'Warehouse Router Alpha';

/** A single named, deselected node at tile {0,0}. */
async function setupNamedNode(page: Page) {
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 10_000 }).toBe(1);
  const id = (await firstItemId(page))!;
  expect(id, 'PRECONDITION: the node exists').toBeTruthy();
  expect(await setName(page, id, NAME)).toBe(NAME);
  await clearSelection(page);
  await page.waitForTimeout(500);
  return id;
}

// ---------------------------------------------------------------------------
// RND-02 — a hidden layer leaves no connector label behind
// ---------------------------------------------------------------------------

const LABEL_TEXT = 'ZQPCHIPZQP';

test('RND-02: hiding a layer removes its connector label chips, not just the body', async ({ app }) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  // Two nodes and a connector between them, built through real input so the
  // scene path is genuinely routed — a bridge-seeded connector would not be.
  const a = await canvas.tileToScreen({ x: -2, y: 0 });
  const b = await canvas.tileToScreen({ x: 2, y: 0 });
  await placeIconViaMouse(page, a);
  await expect.poll(() => getViewItemCount(page)).toBe(1);
  await placeIconViaMouse(page, b);
  await expect.poll(() => getViewItemCount(page)).toBe(2);

  await page.keyboard.press('c');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__axoview__.ui.getState().mode.type as string
        ),
      { timeout: 3_000 }
    )
    .toBe('CONNECTOR');
  await canvas.clickAt(a);
  await page.waitForTimeout(120);
  await canvas.clickAt(b);
  await page.keyboard.press('Escape');

  // `getConnectorLabels` renders `labels[]` — a bare `name` draws no chip.
  const named = await page.evaluate((text: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            connectors: (v.connectors ?? []).map((c: any, i: number) =>
              i === 0
                ? {
                    ...c,
                    name: text,
                    showLabel: true,
                    labels: [
                      { id: 'parity-label', text, position: 50, line: '1' }
                    ]
                  }
                : c
            )
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return {
      connectors: (after?.connectors ?? []).length,
      labels: (after?.connectors?.[0]?.labels ?? []).length
    };
  }, LABEL_TEXT);
  expect(named.connectors, 'exactly one connector was drawn').toBe(1);
  expect(named.labels, 'the connector carries one renderable label').toBe(1);

  // R4/RND-13/15: a selected connector is no longer DOM-promoted (selection is
  // order-preserving), but it still always keeps its labels — that would
  // confound the measurement, so clear the selection first.
  await clearSelection(page);
  await page.waitForTimeout(600);

  const chips = () => page.locator(`${CANVAS} >> text=${LABEL_TEXT}`).count();

  const shown = await seedLayer(page, { visible: true, locked: false });
  expect(shown.connectorsOnLayer).toBe(1);
  expect(shown.itemsOnLayer).toBe(2);
  await page.waitForTimeout(900);
  // R3/GPU-13: the four bulk canvases merged, so whole-canvas painted-pixels
  // can no longer answer "is the CONNECTOR bulk painting?" — the nodes on the
  // same layer paint into the same buffer. The per-type counter can.
  expect(
    (await sceneCounters(page)).connectorsDrawn,
    'PRECONDITION: the connector bulk is painting'
  ).toBeGreaterThan(0);
  expect(await chips(), 'PRECONDITION: the label chip is mounted').toBeGreaterThan(0);

  const hidden = await seedLayer(page, { visible: false, locked: false });
  expect(hidden.visible).toBe(false);
  await page.waitForTimeout(900);

  // PRECONDITION: the BODY really went away — otherwise the toggle did nothing
  // and a missing chip would prove nothing either.
  expect(
    (await sceneCounters(page)).connectorsDrawn,
    'PRECONDITION: the connector body stops painting when its layer is hidden'
  ).toBe(0);

  expect(await chips()).toBe(0);
});

// ---------------------------------------------------------------------------
// RND-04 — promotion survives an id that contains the join separator
// ---------------------------------------------------------------------------

const COMMA_ID = 'imported,node';

test('RND-04: a node whose id contains a comma is still promoted on drag', async ({ app }) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page)).toBe(1);
  await closeElementsDock(page);

  const rewritten = await page.evaluate((nid: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const view = m.views.find((v: any) => v.id === viewId);
    const oldId = (view?.items ?? [])[0]?.id;
    if (!oldId) return null;
    m.actions.set(
      {
        items: m.items.map((i: any) =>
          i.id === oldId ? { ...i, id: nid } : i
        ),
        views: m.views.map((v: any) =>
          v.id === viewId
            ? {
                ...v,
                items: (v.items ?? []).map((i: any) =>
                  i.id === oldId ? { ...i, id: nid } : i
                )
              }
            : v
        )
      },
      true
    );
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return {
      oldId,
      newId: (after?.items ?? [])[0]?.id as string,
      tile: (after?.items ?? [])[0]?.tile as { x: number; y: number }
    };
  }, COMMA_ID);
  expect(
    rewritten?.newId,
    'PRECONDITION: the id really carries a comma'
  ).toBe(COMMA_ID);

  // The drop tile is not necessarily the tile that was aimed at, so grab the
  // press point from where the node actually landed.
  const at = await tileToPage(canvas, rewritten!.tile);

  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    ui.actions.setItemControls(null);
    ui.actions.setSelectedIds([]);
  });
  await page.waitForTimeout(600);

  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(at.x + 80, at.y + 30, { steps: 6 });
  await page.mouse.move(at.x + 160, at.y + 60, { steps: 6 });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__axoview__.ui.getState().mode.type as string
        ),
      { timeout: 4_000 }
    )
    .toBe('DRAG_ITEMS');

  const promoted = await page.locator(`[data-drag-id="${COMMA_ID}"]`).count();
  // The bulk must have SKIPPED it in the same frame — promotion that leaves a
  // duplicate on the canvas is the other half of the bug.
  const drawn = (await nodeCounters(page)).drawCount;
  await page.mouse.up();
  await page.waitForTimeout(300);

  expect(promoted, 'the DOM drag preview exists for a comma id').toBe(1);
  expect(drawn, 'and the bulk skipped the promoted node').toBe(0);
});

// ---------------------------------------------------------------------------
// RND-05 — the LOD band covers the promoted node too
//
// R4/RND-13/15 changed WHAT promotes: selection is order-preserving now, so a
// selected node stays on the bulk. The rename session is the promotion this test
// needs, and it is the same DOM `<Node>` either way — RND-05's claim ("the
// overlay reads the same `isNodeLabelDrawn` predicate the bulk does") is
// untouched, only the route to a promoted node moved.
// ---------------------------------------------------------------------------

test('RND-05: below the label LOD zoom, a promoted node shows no name either', async ({ app }) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  const LOD_NAME = 'ZQPLODZQP';
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: -2, y: 0 }));
  await expect.poll(() => getViewItemCount(page)).toBe(1);
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 2, y: 0 }));
  await expect.poll(() => getViewItemCount(page)).toBe(2);

  const id = (await firstItemId(page))!;
  expect(await setName(page, id, LOD_NAME)).toBe(LOD_NAME);

  // PRECONDITION: readable-labels is OFF, so the LOD band is live at all.
  expect(
    await page.evaluate(
      () => (window as any).__axoview__.ui.getState().readableLabels
    ),
    'PRECONDITION: the readable-labels override is off'
  ).toBe(false);

  await selectItem(page, id);
  await page.evaluate(
    (nodeId) =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setInlineEditNodeId(nodeId),
    id
  );
  await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
  await page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setZoom(0.2)
  );
  await page.waitForTimeout(900);

  // PRECONDITION: the bulk really dropped every chip (LABEL_LOD_ZOOM = 0.25),
  // and the OTHER node is still on the bulk so this is a LABEL decision and not
  // an empty canvas.
  const c = await nodeCounters(page);
  expect(c.labelsDrawn, 'PRECONDITION: the bulk drew no name chips').toBe('0');
  expect(c.drawCount, 'PRECONDITION: the other node is still drawn').toBe(1);

  await expect(page.locator(`${CANVAS} >> text=${LOD_NAME}`)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// RND-14 — reveal, then act
// ---------------------------------------------------------------------------

test('RND-14: a rename started off-screen still finds its node', async ({ app }) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 0, y: 0 }));
  await expect.poll(() => getViewItemCount(page)).toBe(1);
  const id = (await firstItemId(page))!;
  await selectItem(page, id);
  // R4/RND-13/15: selection alone no longer mounts an overlay — that promotion
  // WAS the accidental "bring to front". The ruling RND-14 serves ("reveal, then
  // act": a keyboard command on an off-screen selection must not be a silent
  // no-op) is unchanged, and this is now the whole of it — the rename intent both
  // bypasses the viewport cull and promotes, in one store write.
  await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(0);

  // Pan far enough that the node's tile leaves the padded coarse bounds.
  await page.evaluate(() => {
    (window as any).__axoview__.ui.getState().actions.setScroll({
      position: { x: 20000, y: 20000 },
      offset: { x: 0, y: 0 }
    });
  });
  await page.waitForTimeout(900);

  // PRECONDITION: the cull really fired — the bulk draws nothing now.
  expect(
    (await nodeCounters(page)).drawCount,
    'PRECONDITION: the node was culled from the bulk'
  ).toBe(0);

  // The selection is intact…
  expect(
    await page.evaluate(
      () => (window as any).__axoview__.ui.getState().itemControls?.id
    )
  ).toBe(id);

  // `handleFunctionKeys` drops F2 unless the keystroke came from inside the
  // renderer or from document.body, and placing an icon leaves focus in the
  // Elements grid — so reset focus before asserting F2 works.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  expect(
    await page.evaluate(() => document.activeElement?.tagName ?? null),
    'PRECONDITION: focus is on body so F2 is not filtered out'
  ).toBe('BODY');
  await page.keyboard.press('F2');
  await page.waitForTimeout(600);
  // "Reveal, then act": the rename intent joins the promoted set, which bypasses
  // the viewport cull — so the culled node mounts and the editor has a target.
  await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
  expect(
    await page.locator('[contenteditable="true"]').count()
  ).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// OVL-06 — present mode keeps both hover proxies
// ---------------------------------------------------------------------------

test('OVL-06: a node name stays hoverable in present mode, like a floating Label', async ({ app }) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  const nodeId = await setupNamedNode(page);

  await canvas.placeLabelAt(await canvas.tileToScreen({ x: 3, y: 0 }), {
    keepEditing: true
  });
  await page.waitForTimeout(500);
  await page.keyboard.type('Legend');
  await page.keyboard.press('Enter');
  await clearSelection(page);
  await page.waitForTimeout(700);

  const labelId = await page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const v = bridge.model.getState().views.find((x: any) => x.id === viewId);
    return ((v?.labels ?? [])[0]?.id ?? null) as string | null;
  });
  expect(labelId, 'PRECONDITION: a floating Label exists').toBeTruthy();

  // PRECONDITION: in EDITABLE both proxy layers are live.
  await expect(page.locator(labelProxyFor(nodeId))).toHaveCount(1);
  await expect(page.locator(labelProxyFor(labelId!))).toHaveCount(1);

  await page.evaluate(() =>
    (window as any).__axoview__.ui
      .getState()
      .actions.setEditorMode('EXPLORABLE_READONLY')
  );
  await page.waitForTimeout(900);

  expect(
    await page.locator(labelProxyFor(labelId!)).count(),
    'PRECONDITION: the Label proxy survived the mode switch'
  ).toBe(1);
  expect(await page.locator(labelProxyFor(nodeId)).count()).toBe(1);
});

// ---------------------------------------------------------------------------
// OVL-12 — the grab box follows the counter-scale
// ---------------------------------------------------------------------------

/**
 * The proxy's box in CANVAS px. The divs live inside a `<SceneLayer>` whose CSS
 * transform is `translate(scroll) scale(zoom)`, so `boundingBox()` returns
 * SCREEN px and has to be divided by the live zoom before it means anything.
 */
const proxyRect = async (page: Page) => {
  const box = await page.locator(NODE_NAME_PROXY).first().boundingBox();
  if (!box) return null;
  const zoom = await page.evaluate(
    () => (window as any).__axoview__.ui.getState().zoom as number
  );
  return { width: box.width / zoom, height: box.height / zoom, zoom };
};

test('OVL-12: the node-name grab box grows with the counter-scaled chip', async ({ app }) => {
  const { page } = app;
  await setupNamedNode(page);

  // Zoom 0.5: above the proxy's hit floor but below the readable floor
  // (11 / 16 ≈ 0.69), so the counter-scale is > 1 there.
  await page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setZoom(0.5)
  );
  await page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setReadableLabels(false)
  );
  await page.waitForTimeout(700);
  await expect(page.locator(NODE_NAME_PROXY)).toHaveCount(1);
  const before = (await proxyRect(page))!;

  await page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setReadableLabels(true)
  );
  await page.waitForTimeout(700);

  // PRECONDITION: the canvas really is drawing bigger now.
  const glScale = (await nodeCounters(page)).labelScale;
  expect(glScale, 'PRECONDITION: the GL counter-scale is engaged').toBeGreaterThan(1.2);

  const after = (await proxyRect(page))!;
  expect(after.width / before.width).toBeCloseTo(glScale, 1);
  expect(after.height / before.height).toBeCloseTo(glScale, 1);
});

// ---------------------------------------------------------------------------
// OVL-13 — locked means no gesture affordance
// ---------------------------------------------------------------------------

test('OVL-13: a locked layer exposes no label drag/rename handle', async ({ app }) => {
  const { page } = app;
  await setupNamedNode(page);
  await expect(page.locator(NODE_NAME_PROXY)).toHaveCount(1);

  const seeded = await seedLayer(page, { visible: true, locked: true });
  expect(seeded.locked, 'PRECONDITION: the layer really is locked').toBe(true);
  expect(
    seeded.visible,
    'PRECONDITION: and it is VISIBLE — this is the locked half, not the hidden one'
  ).toBe(true);
  expect(seeded.itemsOnLayer).toBe(1);
  await page.waitForTimeout(700);

  expect(await page.locator(NODE_NAME_PROXY).count()).toBe(0);
});

test('OVL-13 CONTROL: an unlocked, visible layer still gets its handle', async ({ app }) => {
  const { page } = app;
  // Without this the test above passes for any reason that removes the proxy —
  // including seeding a layer at all.
  await setupNamedNode(page);
  const seeded = await seedLayer(page, { visible: true, locked: false });
  expect(seeded.locked).toBe(false);
  expect(seeded.itemsOnLayer).toBe(1);
  await page.waitForTimeout(700);

  await expect(page.locator(NODE_NAME_PROXY)).toHaveCount(1);
});
