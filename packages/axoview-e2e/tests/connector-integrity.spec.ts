/**
 * connector-integrity.spec.ts — what the connector tool refuses to build, and
 * how a reconnect ends.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed the I4 cluster
 * (`I4-connectors/conn-01-15`). Its carry-forward note had two headlines:
 *
 *  - *The connector tool trusts geometry and distrusts nothing else.* Its
 *    hit-tests called `getItemAtTile({ tile, scene })` with neither the ADR 0023
 *    cursor point nor `isItemInteractable`, while every Cursor path passes both
 *    — so a node on a locked (or hidden) layer was a valid anchor target
 *    (CONN-15).
 *  - *Degenerate connectors are creatable four ways and rejected none* — a
 *    self-loop (CONN-10), a zero-length free-floating one (CONN-07), a
 *    half-attached one (CONN-13) and I1/PTR-07's abandoned provisional. Nothing
 *    in the reducer, `validateView` or `modelSchema` objected to any of them.
 *
 * Plus `RECONNECT_ANCHOR`, the one mutating mode with no abort at all
 * (CONN-01/02).
 *
 * The predicates are unit-pinned in `connectorHitTest.test.ts`; the mode-level
 * commit/revert contracts in `Connector.modes.test.ts` and
 * `ReconnectAnchor.modes.test.ts`. This spec proves the wiring holds through the
 * real app, where the hit-test, the layer context and the history stack are all
 * genuine.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { LayersPanelPOM } from '../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getModelItemCount, getUiMode } from '../helpers/store';

type Page = import('@playwright/test').Page;

test.describe.configure({ timeout: 90_000 });

const A: CanvasPoint = { x: 480, y: 260 };
const B: CanvasPoint = { x: 800, y: 420 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

/**
 * An anchor's `ref`: `{ item }` when it is bound to an entity, `{ tile }` when
 * it fell back to a bare tile. Both halves are optional because which one is
 * present is precisely what several of these tests assert.
 */
interface AnchorRef {
  item?: string;
  tile?: { x: number; y: number };
}

interface ProbedConnector {
  id: string;
  anchors: AnchorRef[];
}

// The return type is written out because `activeView` is bridge-shaped (`any`)
// and everything downstream of it would inherit that, which silently drops the
// checking on the assertions below.
const connectors = async (page: Page): Promise<ProbedConnector[]> =>
  ((await activeView(page))?.connectors ?? []).map((c: any) => ({
    id: c.id as string,
    anchors: c.anchors.map((a: any) => a.ref)
  }));

/** Closes the Elements dock so it can't intercept real mouse events. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

async function twoNodes(page: Page) {
  await placeIconViaMouse(page, A);
  await placeIconViaMouse(page, B);
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
  await closeElementsDock(page);
  return (await activeView(page)).items;
}

const setInteractionMode = (page: Page, mode: 'click' | 'drag') =>
  page.evaluate((m) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setConnectorInteractionMode(m);
  }, mode);

// ---------------------------------------------------------------------------
// CONN-10 — the self-loop
// ---------------------------------------------------------------------------
test.describe('a connector from a node to itself (CONN-10)', () => {
  test('clicking the same node twice creates nothing', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    await page.keyboard.press('c');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CONNECTOR');

    const at = await canvas.tileToScreen(items[0].tile);
    await canvas.clickAt(at);
    await canvas.clickAt(at);
    await page.waitForTimeout(400);

    // `createConnectorAt` SEEDS both anchors on the pressed item, so this shape
    // was the default rather than an edge case — and it validated clean, saved,
    // and rendered as nothing useful.
    expect(await connectors(page)).toHaveLength(0);
  });

  test('control: clicking two different nodes still connects them', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(items[1].tile));

    await expect
      .poll(async () => (await connectors(page)).length, { timeout: 5_000 })
      .toBe(1);
    const [c] = await connectors(page);
    expect(c.anchors[0].item).not.toBe(c.anchors[c.anchors.length - 1].item);
  });
});

// ---------------------------------------------------------------------------
// CONN-07 — a zero-travel click in drag mode
// ---------------------------------------------------------------------------
test.describe('a stray click while the connector tool is armed (CONN-07)', () => {
  test('drag mode: a zero-travel press-release on empty canvas leaves nothing', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await twoNodes(page);
    await setInteractionMode(page, 'drag');

    await page.keyboard.press('c');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CONNECTOR');
    await canvas.clickAt({ x: 620, y: 520 });
    await page.waitForTimeout(400);

    // Before the fix this committed the start tile TWICE: a zero-length
    // connector attached to nothing, which then survived save and reload and
    // was impossible to select because there was nothing to click.
    expect(await connectors(page)).toHaveLength(0);
  });

  test('control: a real drag in drag mode still draws one', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);
    await setInteractionMode(page, 'drag');

    await page.keyboard.press('c');
    await canvas.dragFromTo(
      await canvas.tileToScreen(items[0].tile),
      await canvas.tileToScreen(items[1].tile)
    );
    await expect
      .poll(async () => (await connectors(page)).length, { timeout: 5_000 })
      .toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CONN-11 — two connectors between the same pair
// ---------------------------------------------------------------------------
test.describe('parallel connectors between one node pair (CONN-11)', () => {
  test('the second gets a distinct route', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    const draw = async () => {
      await page.keyboard.press('c');
      await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
      await canvas.clickAt(await canvas.tileToScreen(items[1].tile));
      await page.waitForTimeout(300);
    };

    await draw();
    await draw();

    const all = await connectors(page);
    expect(all).toHaveLength(2);

    // The router is a pure function of the two endpoints, so before the fix both
    // were routed along byte-identical tiles and rendered as one line — the
    // second could not be selected, styled, labelled or deleted by pointer.
    // The fan-out seeds a waypoint that pulls it off the direct route.
    //
    // Order-independent: the view's `connectors` array order is NOT creation
    // order (the I4 rig lesson that cost three wrong verdicts — resolve by
    // identity, never by index). Exactly one of the pair carries the waypoint.
    const anchorCounts = all.map((c) => c.anchors.length).sort();
    expect(anchorCounts).toEqual([2, 3]);

    const paths = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const scene = bridge.scene?.getState?.();
      const conns = scene?.connectors ?? {};
      return Object.values(conns).map((c: any) =>
        (c.path?.tiles ?? []).map((t: any) => `${t.x},${t.y}`).join('|')
      );
    });
    if (paths.length === 2) expect(paths[0]).not.toBe(paths[1]);
  });
});

// ---------------------------------------------------------------------------
// CONN-15 — a node on a locked layer is not a valid anchor target
// ---------------------------------------------------------------------------
test.describe('connecting to a node on a locked layer (CONN-15)', () => {
  test('the anchor binds to the tile, not to the locked node', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    // Put the TARGET node on its own layer and lock it.
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    const layerName = (await activeView(page)).layers[0].name as string;
    await layers.dragItemToLayer(items[1].id, layerName);
    await layers.toggleLock(layerName);
    await page.waitForTimeout(250);
    await closeElementsDock(page);

    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(items[1].tile));
    await page.waitForTimeout(400);

    const all = await connectors(page);
    // Either nothing was drawn, or the far end fell back to the bare tile — what
    // must NOT happen is an anchor bound to the locked node, an entity the user
    // has declared un-editable and which cannot be selected, moved or deleted.
    for (const c of all) {
      for (const ref of c.anchors) {
        expect(ref.item).not.toBe(items[1].id);
      }
    }
  });

  test('control: the same connection to an UNLOCKED node binds to the node', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(items[1].tile));

    await expect
      .poll(async () => (await connectors(page)).length, { timeout: 5_000 })
      .toBe(1);
    const [c] = await connectors(page);
    expect(c.anchors.some((r: any) => r.item === items[1].id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONN-04 — a stable end-anchor identity while drawing
// ---------------------------------------------------------------------------
test.describe('the end anchor while a connector is being drawn (CONN-04)', () => {
  test('keeps one id across every tile the pointer crosses', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await twoNodes(page);

    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await expect
      .poll(async () => (await connectors(page)).length, { timeout: 5_000 })
      .toBe(1);

    const endAnchorId = async () =>
      page.evaluate(() => {
        const bridge = (window as any).__axoview__;
        const viewId = bridge.ui.getState().view;
        const view = bridge.model
          .getState()
          .views.find((v: any) => v.id === viewId);
        const c = view.connectors[0];
        return c.anchors[c.anchors.length - 1].id as string;
      });

    const seen = new Set<string>();
    for (const p of [
      { x: 560, y: 300 },
      { x: 640, y: 340 },
      { x: 720, y: 380 }
    ]) {
      await canvas.dispatchAt(['mousemove'], p);
      await page.waitForTimeout(120);
      seen.add(await endAnchorId());
    }

    // Before the fix this was three distinct ids: `Connector.mousemove` rebuilt
    // the anchor with a fresh `generateId()` per frame, so anything holding the
    // id (an overlay key, a selection ref, `mouse.targetAnchorId`) pointed at an
    // anchor that no longer existed.
    expect(seen.size).toBe(1);

    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// CONN-01 / CONN-02 — the reconnect has a way out
// ---------------------------------------------------------------------------
test.describe('endpoint reconnect (CONN-01/02)', () => {
  /** Draws A→B and returns the connector plus its endpoint anchor ids. */
  async function connected(page: Page, canvas: CanvasPOM) {
    const items = await twoNodes(page);
    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(items[1].tile));
    await expect
      .poll(async () => (await connectors(page)).length, { timeout: 5_000 })
      .toBe(1);
    await page.keyboard.press('s');
    const view = await activeView(page);
    return { items, connector: view.connectors[0] };
  }

  /** Enters RECONNECT_ANCHOR through the store, then drags the pointer away. */
  async function beginReconnect(
    page: Page,
    canvas: CanvasPOM,
    connectorId: string,
    anchorId: string
  ) {
    await page.evaluate(
      ({ c, a }) => {
        (window as any).__axoview__.ui.getState().actions.setMode({
          type: 'RECONNECT_ANCHOR',
          showCursor: true,
          connectorId: c,
          anchorId: a
        });
      },
      { c: connectorId, a: anchorId }
    );
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('RECONNECT_ANCHOR');
    // Move over empty canvas so the live preview rewrites the anchor to a tile.
    await canvas.dispatchAt(['mousemove'], { x: 620, y: 540 });
    await page.waitForTimeout(200);
  }

  test('Escape restores the anchor and returns to CURSOR', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const { connector } = await connected(page, canvas);
    const anchorId = connector.anchors[connector.anchors.length - 1].id;
    const before = connector.anchors[connector.anchors.length - 1].ref;

    await beginReconnect(page, canvas, connector.id, anchorId);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Before the fix Escape left the anchor wherever the preview had put it AND
    // left the canvas in RECONNECT_ANCHOR — a mode with no visual signature that
    // the user could not get out of.
    expect(await modeType(page)).toBe('CURSOR');
    const [after] = await connectors(page);
    expect(after.anchors[after.anchors.length - 1]).toEqual(before);
  });

  test('a release ends the gesture even when it lands off the canvas', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const { connector } = await connected(page, canvas);
    const anchorId = connector.anchors[connector.anchors.length - 1].id;

    await beginReconnect(page, canvas, connector.id, anchorId);

    // A mouseup whose target is NOT the interactions box — the release landed
    // over a panel. The gesture began on the canvas, so it must still finish.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 1,
          pointerType: 'mouse',
          bubbles: true,
          clientX: 40,
          clientY: 300
        })
      );
    });
    await page.waitForTimeout(300);

    expect(await modeType(page)).toBe('CURSOR');
  });
});
